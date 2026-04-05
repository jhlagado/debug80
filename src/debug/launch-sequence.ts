/**
 * @fileoverview Launch/session build sequence helpers for the debug adapter.
 */

import * as fs from 'fs';
import type { DebugProtocol } from '@vscode/debugprotocol';
import { resolveBundledTec1Rom } from './assembler';
import { emitConsoleOutput } from './adapter-ui';
import { buildSymbolIndex } from './symbol-service';
import { SourceManager } from './source-manager';
import type { SourceStateManager } from './source-state-manager';
import type { PlatformRegistry } from './platform-registry';
import { handleMatrixKeyRequest, handleMatrixModeRequest } from './matrix-request';
import {
  relativeIfPossible,
  resolveArtifacts,
  resolveAsmPath,
  resolveDebugMapPath,
  resolveExtraDebugMapPath,
  resolveRelative,
  type LaunchArgsHelpers,
} from './launch-args';
import { buildListingCacheKey, resolveBaseDir, resolveCacheDir, resolveListingSourcePath, resolveMappedPath } from './path-resolver';
import { assembleIfRequested, normalizeStepLimit } from './launch-pipeline';
import { loadProgramArtifacts, type PlatformKind } from './program-loader';
import { resolveAssemblerBackend } from './assembler-backend';
import { emitMainSource } from './adapter-ui';
import { resolvePlatformProvider } from '../platforms/provider';
import { createZ80Runtime } from '../z80/runtime';
import type { MappingParseResult, SourceMapAnchor } from '../mapping/parser';
import type { SourceMapIndex } from '../mapping/source-map';
import { formatLogMessage, type Logger } from '../util/logger';
import type { MatrixKeyCombo } from '../platforms/tec1g/matrix-keymap';
import type { ListingInfo, HexProgram } from '../z80/loaders';
import type { LaunchRequestArguments } from './types';
import type { TerminalState } from './terminal-types';
import type {
  ActivePlatformRuntime,
  SessionStateShape,
} from './session-state';
import type { Z80Runtime } from '../z80/runtime';
import type { Tec1Runtime } from '../platforms/tec1/runtime';
import type { Tec1gRuntime } from '../platforms/tec1g/runtime';
import type { ResolvedPlatformProvider } from '../platforms/provider';
import type { DebugProtocol as DP } from '@vscode/debugprotocol';

const LAUNCH_ARGS_HELPERS: LaunchArgsHelpers = {
  resolveBaseDir,
  resolveAsmPath,
  resolveRelative,
  resolveCacheDir,
  buildListingCacheKey,
  relativeIfPossible,
};

export class MissingLaunchArtifactsError extends Error {
  constructor(
    public readonly hexPath: string,
    public readonly listingPath: string
  ) {
    super(`Z80 artifacts not found. Expected HEX at "${hexPath}" and LST at "${listingPath}".`);
    this.name = 'MissingLaunchArtifactsError';
  }
}

export function createLaunchLogger(
  baseLogger: Logger,
  sendEvent: (event: DebugProtocol.Event) => void,
): Logger {
  const emitOutput = (message: string): void => {
    emitConsoleOutput((event) => sendEvent(event as DebugProtocol.Event), message);
  };
  const tee = (
    sink: (message: string, ...args: unknown[]) => void,
    message: string,
    args: unknown[],
  ): void => {
    sink(message, ...args);
    emitOutput(formatLogMessage(message, args));
  };
  return {
    debug: (message: string, ...args: unknown[]) => tee(baseLogger.debug.bind(baseLogger), message, args),
    info: (message: string, ...args: unknown[]) => tee(baseLogger.info.bind(baseLogger), message, args),
    warn: (message: string, ...args: unknown[]) => tee(baseLogger.warn.bind(baseLogger), message, args),
    error: (message: string, ...args: unknown[]) => tee(baseLogger.error.bind(baseLogger), message, args),
  };
}

export function hasLaunchInputs(args: LaunchRequestArguments): boolean {
  return !(
    (args.asm === undefined || args.asm === '') &&
    (args.hex === undefined || args.hex === '') &&
    (args.listing === undefined || args.listing === '')
  );
}

export async function respondToMissingLaunchInputs(
  response: DebugProtocol.LaunchResponse,
  promptForConfigCreation: () => Promise<boolean>,
  sendErrorResponse: (
    response: DebugProtocol.LaunchResponse,
    id: number,
    message: string
  ) => void
): Promise<void> {
  try {
    const created = await promptForConfigCreation();
    if (created) {
      sendErrorResponse(
        response,
        1,
        'Debug80: Created debug80.json. Set up your default target and re-run.'
      );
      return;
    }
    sendErrorResponse(
      response,
      1,
      'Debug80: No asm/hex/listing provided and no debug80.json found. Add debug80.json or specify paths.'
    );
  } catch (err) {
    sendErrorResponse(
      response,
      1,
      `Debug80: Failed to create project config: ${String(err)}`
    );
  }
}

export async function respondToMissingArtifacts(
  response: DebugProtocol.LaunchResponse,
  err: MissingLaunchArtifactsError,
  promptForConfigCreation: () => Promise<boolean>,
  sendErrorResponse: (
    response: DebugProtocol.LaunchResponse,
    id: number,
    message: string
  ) => void
): Promise<void> {
  try {
    const created = await promptForConfigCreation();
    if (created) {
      sendErrorResponse(
        response,
        1,
        'Debug80: Created debug80.json. Re-run the launch after building artifacts.'
      );
      return;
    }
    sendErrorResponse(response, 1, err.message);
  } catch (promptErr) {
    sendErrorResponse(
      response,
      1,
      `Debug80: Failed to create project config: ${String(promptErr)}`
    );
  }
}

export interface LaunchSessionArtifacts {
  platform: PlatformKind;
  listing: ListingInfo;
  listingPath: string;
  mapping: MappingParseResult;
  mappingIndex: SourceMapIndex;
  sourceRoots: string[];
  extraListingPaths: string[];
  symbolAnchors: SourceMapAnchor[];
  symbolList: Array<{ name: string; address: number }>;
  loadedProgram: HexProgram;
  loadedEntry: number | undefined;
  restartCaptureAddress: number | undefined;
  runtime: Z80Runtime;
  terminalState: TerminalState | undefined;
  tec1Runtime: Tec1Runtime | undefined;
  tec1gRuntime: Tec1gRuntime | undefined;
  platformRuntime: ActivePlatformRuntime | undefined;
  stepOverMaxInstructions: number;
  stepOutMaxInstructions: number;
  tec1gConfig: ResolvedPlatformProvider['tec1gConfig'];
}

export interface LaunchSequenceContext {
  logger: Logger;
  sessionState: SessionStateShape;
  sourceState: SourceStateManager;
  platformRegistry: PlatformRegistry;
  matrixHeldKeys: Map<string, MatrixKeyCombo[]>;
  emitEvent: (event: DebugProtocol.Event) => void;
  emitDapEvent: (name: string, payload: unknown) => void;
  sendResponse: (response: DP.Response) => void;
  sendErrorResponse: (response: DP.Response, id: number, message: string) => void;
}

export async function buildLaunchSession(
  merged: LaunchRequestArguments,
  context: LaunchSequenceContext
): Promise<LaunchSessionArtifacts> {
  const platformProvider = await resolvePlatformProvider(merged);
  const platform = platformProvider.id;
  const simpleConfig = platformProvider.simpleConfig;
  const tec1Config = platformProvider.tec1Config;
  const tec1gConfig = platformProvider.tec1gConfig;

  context.platformRegistry.clear();
  const tec1gMatrixRuntime =
    context.sessionState.tec1gRuntime === undefined
      ? undefined
      : {
          state: {
            matrixModeEnabled: context.sessionState.tec1gRuntime.state.input.matrixModeEnabled,
            capsLock: context.sessionState.tec1gRuntime.state.system.capsLock,
          },
          setMatrixMode: (enabled: boolean) =>
            context.sessionState.tec1gRuntime?.setMatrixMode(enabled),
          applyMatrixKey: (row: number, col: number, pressed: boolean) =>
            context.sessionState.tec1gRuntime?.applyMatrixKey(row, col, pressed),
        };
  platformProvider.registerCommands(context.platformRegistry, {
    sessionState: context.sessionState,
    sendResponse: context.sendResponse,
    sendErrorResponse: context.sendErrorResponse,
    handleMatrixModeRequest: (args) =>
      handleMatrixModeRequest(tec1gMatrixRuntime, context.matrixHeldKeys, args),
    handleMatrixKeyRequest: (args) =>
      handleMatrixKeyRequest(tec1gMatrixRuntime, context.matrixHeldKeys, args),
    clearMatrixHeldKeys: () => {
      context.matrixHeldKeys.clear();
    },
  });
  context.emitDapEvent('debug80/platform', platformProvider.payload);

  const baseDir = resolveBaseDir(merged);
  context.sessionState.baseDir = baseDir;
  const { hexPath, listingPath, asmPath } = resolveArtifacts(merged, baseDir, {
    resolveAsmPath: (asm, dir) => resolveAsmPath(asm, dir),
    resolveRelative: (filePath, dir) => resolveRelative(filePath, dir),
  });
  const assemblerBackend = resolveAssemblerBackend(merged.assembler, asmPath);

  assembleIfRequested({
    backend: assemblerBackend,
    args: merged,
    asmPath,
    hexPath,
    listingPath,
    platform,
    ...(simpleConfig !== undefined ? { simpleConfig } : {}),
    sendEvent: (event) => context.emitEvent(event as DebugProtocol.Event),
  });

  if (!existsSync(hexPath) || !existsSync(listingPath)) {
    throw new MissingLaunchArtifactsError(hexPath, listingPath);
  }

  const { program, listingInfo, listingContent } = loadProgramArtifacts({
    platform,
    baseDir,
    hexPath,
    listingPath,
    resolveRelative: (p, dir) => resolveRelative(p, dir),
    resolveBundledTec1Rom: () => resolveBundledTec1Rom(),
    logger: context.logger,
    ...(tec1Config ? { tec1Config } : {}),
    ...(tec1gConfig ? { tec1gConfig } : {}),
  });

  context.sessionState.listingPath = listingPath;
  const extraListings = platformProvider.extraListings;
  context.sourceState.setManager(
    new SourceManager({
      platform,
      baseDir,
      resolveRelative: (p, dir) => resolveRelative(p, dir),
      resolveMappedPath: (file): string | undefined =>
        resolveMappedPath(file, context.sessionState.listingPath, context.sessionState.sourceRoots),
      relativeIfPossible: (filePath, dir) => relativeIfPossible(filePath, dir),
      resolveExtraDebugMapPath: (p) => resolveExtraDebugMapPath(p, LAUNCH_ARGS_HELPERS),
      resolveDebugMapPath: (args, dir, asm, listing) =>
        resolveDebugMapPath(
          args as LaunchRequestArguments,
          dir,
          asm,
          listing,
          LAUNCH_ARGS_HELPERS
        ),
      resolveListingSourcePath: (listing) => resolveListingSourcePath(listing),
      logger: context.logger,
    })
  );

  const builtSourceState = context.sourceState.build({
    listingContent,
    listingPath,
    ...(asmPath !== undefined && asmPath.length > 0 ? { asmPath } : {}),
    ...(merged.sourceFile !== undefined && merged.sourceFile.length > 0
      ? { sourceFile: merged.sourceFile }
      : {}),
    sourceRoots: merged.sourceRoots ?? [],
    extraListings,
    mapArgs: {
      ...(merged.artifactBase !== undefined && merged.artifactBase.length > 0
        ? { artifactBase: merged.artifactBase }
        : {}),
      ...(merged.outputDir !== undefined && merged.outputDir.length > 0
        ? { outputDir: merged.outputDir }
        : {}),
    },
  });

  emitMainSource((event) => context.emitEvent(event as DebugProtocol.Event), context.sourceState.file);

  const symbolIndex = buildSymbolIndex({
    mapping: builtSourceState.mapping,
    listingContent,
    sourceFile: context.sourceState.file,
  });
  context.sourceState.lookupAnchors = symbolIndex.lookupAnchors;

  const emitPlatformEvent = (name: string) => (payload: unknown) =>
    context.emitDapEvent(name, payload);
  const platformIo = await platformProvider.buildIoHandlers({
    ...(merged.terminal !== undefined ? { terminal: merged.terminal } : {}),
    onTec1Update: emitPlatformEvent('debug80/tec1Update'),
    onTec1Serial: emitPlatformEvent('debug80/tec1Serial'),
    onTec1gUpdate: emitPlatformEvent('debug80/tec1gUpdate'),
    onTec1gSerial: emitPlatformEvent('debug80/tec1gSerial'),
    onTerminalOutput: emitPlatformEvent('debug80/terminalOutput'),
  });

  context.sessionState.tec1Runtime = platformIo.tec1Runtime;
  context.sessionState.tec1gRuntime = platformIo.tec1gRuntime;
  context.sessionState.platformRuntime = platformIo.tec1Runtime ?? platformIo.tec1gRuntime;
  context.sessionState.terminalState = platformIo.terminalState;

  const platformAssets = platformProvider.loadAssets?.({
    baseDir,
    logger: context.logger,
    resolveRelative: (filePath, assetBaseDir) => resolveRelative(filePath, assetBaseDir),
  });
  const entry = platformProvider.resolveEntry(platformAssets);
  const restartCaptureAddress =
    platform === 'simple'
      ? simpleConfig?.appStart ?? entry
      : platform === 'tec1'
        ? tec1Config?.appStart ?? entry
        : platform === 'tec1g'
          ? tec1gConfig?.appStart ?? entry
          : entry;
  const runtime = createZ80Runtime(program, entry, platformIo.ioHandlers, platformProvider.runtimeOptions);
  context.sessionState.runtime = runtime;
  if (runtime !== undefined) {
    platformProvider.finalizeRuntime?.({
      runtime,
      sessionState: context.sessionState,
      assets: platformAssets,
    });
  }

  return {
    platform,
    listing: listingInfo,
    listingPath,
    mapping: builtSourceState.mapping,
    mappingIndex: builtSourceState.mappingIndex,
    sourceRoots: builtSourceState.sourceRoots,
    extraListingPaths: builtSourceState.extraListingPaths,
    symbolAnchors: symbolIndex.anchors,
    symbolList: symbolIndex.list,
    loadedProgram: program,
    loadedEntry: entry,
    restartCaptureAddress,
    runtime,
    terminalState: platformIo.terminalState,
    tec1Runtime: platformIo.tec1Runtime,
    tec1gRuntime: platformIo.tec1gRuntime,
    platformRuntime: platformIo.tec1Runtime ?? platformIo.tec1gRuntime,
    stepOverMaxInstructions: normalizeStepLimit(merged.stepOverMaxInstructions, 0),
    stepOutMaxInstructions: normalizeStepLimit(merged.stepOutMaxInstructions, 0),
    tec1gConfig,
  };
}

function existsSync(filePath: string): boolean {
  return filePath.length > 0 && fs.existsSync(filePath);
}
