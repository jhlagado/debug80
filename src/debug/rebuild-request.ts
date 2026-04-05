/**
 * @fileoverview Warm rebuild request for active debug sessions.
 */

import * as fs from 'fs';
import { BreakpointEvent } from '@vscode/debugadapter';
import type { DebugProtocol } from '@vscode/debugprotocol';
import { resolveBundledTec1Rom } from './assembler';
import { emitConsoleOutput, emitMainSource } from './adapter-ui';
import { resolveAssemblerBackend } from './assembler-backend';
import type { BreakpointManager } from './breakpoint-manager';
import { resolveArtifacts, resolveAsmPath, resolveDebugMapPath, resolveExtraDebugMapPath, resolveRelative, relativeIfPossible } from './launch-args';
import { assembleIfRequested } from './launch-pipeline';
import { resolveListingSourcePath, resolveMappedPath, resolveBaseDir, resolveCacheDir, buildListingCacheKey } from './path-resolver';
import { loadProgramArtifacts } from './program-loader';
import type { SessionStateShape } from './session-state';
import type { SourceStateManager } from './source-state-manager';
import { SourceManager } from './source-manager';
import { buildSymbolIndex } from './symbol-service';
import type { Logger } from '../util/logger';

type RebuildDeps = {
  logger: Logger;
  sessionState: SessionStateShape;
  sourceState: SourceStateManager;
  breakpointManager: BreakpointManager;
  platformState: { active: string };
  sendEvent: (event: DebugProtocol.Event) => void;
  sendResponse: (response: DebugProtocol.Response) => void;
  sendErrorResponse: (response: DebugProtocol.Response, id: number, message: string) => void;
};

function applyWriteRanges(
  memory: Uint8Array,
  previousProgram: SessionStateShape['loadedProgram'],
  nextProgram: NonNullable<SessionStateShape['loadedProgram']>
): void {
  for (const range of previousProgram?.writeRanges ?? []) {
    memory.fill(0, range.start, range.end);
  }
  for (const range of nextProgram.writeRanges ?? []) {
    memory.set(nextProgram.memory.subarray(range.start, range.end), range.start);
  }
}

export function handleWarmRebuildRequest(
  response: DebugProtocol.Response,
  deps: RebuildDeps
): boolean {
  const launchArgs = deps.sessionState.launchArgs;
  const runtime = deps.sessionState.runtime;
  if (!launchArgs || !runtime) {
    deps.sendErrorResponse(response, 1, 'Debug80: No active launch to rebuild.');
    return true;
  }

  try {
    const baseDir = deps.sessionState.baseDir || resolveBaseDir(launchArgs);
    const { asmPath, hexPath, listingPath } = resolveArtifacts(launchArgs, baseDir, {
      resolveAsmPath: (asm, dir) => resolveAsmPath(asm, dir),
      resolveRelative: (filePath, dir) => resolveRelative(filePath, dir),
    });
    const backend = resolveAssemblerBackend(launchArgs.assembler, asmPath);

    assembleIfRequested({
      backend,
      args: launchArgs,
      asmPath,
      hexPath,
      listingPath,
      platform: deps.platformState.active,
      sendEvent: (event) => deps.sendEvent(event as DebugProtocol.Event),
    });

    if (!fs.existsSync(hexPath) || !fs.existsSync(listingPath)) {
      deps.sendErrorResponse(response, 1, 'Debug80: Rebuild did not produce HEX/LST artifacts.');
      return true;
    }

    const simpleConfig = launchArgs.simple;
    const tec1Config = launchArgs.tec1;
    const tec1gConfig = launchArgs.tec1g;
    const { program, listingInfo, listingContent } = loadProgramArtifacts({
      platform: deps.platformState.active,
      baseDir,
      hexPath,
      listingPath,
      resolveRelative: (p, dir) => resolveRelative(p, dir),
      resolveBundledTec1Rom: () => resolveBundledTec1Rom(),
      logger: deps.logger,
      ...(tec1Config !== undefined ? { tec1Config: tec1Config as never } : {}),
      ...(tec1gConfig !== undefined ? { tec1gConfig: tec1gConfig as never } : {}),
    });

    if (!deps.sourceState.manager) {
      deps.sourceState.setManager(
        new SourceManager({
          platform: deps.platformState.active,
          baseDir,
          resolveRelative: (p, dir) => resolveRelative(p, dir),
          resolveMappedPath: (file) =>
            resolveMappedPath(file, deps.sessionState.listingPath, deps.sessionState.sourceRoots),
          relativeIfPossible: (filePath, dir) => relativeIfPossible(filePath, dir),
          resolveExtraDebugMapPath: (p) =>
            resolveExtraDebugMapPath(p, { resolveCacheDir, buildListingCacheKey }),
          resolveDebugMapPath: (args, dir, asm, listing) =>
            resolveDebugMapPath(args as never, dir, asm, listing, {
              resolveCacheDir,
              buildListingCacheKey,
              resolveRelative,
            }),
          resolveListingSourcePath: (listing) => resolveListingSourcePath(listing),
          logger: deps.logger,
        })
      );
    }

    const builtSourceState = deps.sourceState.build({
      listingContent,
      listingPath,
      ...(asmPath !== undefined && asmPath.length > 0 ? { asmPath } : {}),
      ...(launchArgs.sourceFile !== undefined && launchArgs.sourceFile.length > 0
        ? { sourceFile: launchArgs.sourceFile }
        : {}),
      sourceRoots: launchArgs.sourceRoots ?? [],
      extraListings:
        deps.platformState.active === 'simple'
          ? simpleConfig?.extraListings ?? []
          : deps.platformState.active === 'tec1'
            ? tec1Config?.extraListings ?? []
            : tec1gConfig?.extraListings ?? [],
      mapArgs: {
        ...(launchArgs.artifactBase !== undefined && launchArgs.artifactBase.length > 0
          ? { artifactBase: launchArgs.artifactBase }
          : {}),
        ...(launchArgs.outputDir !== undefined && launchArgs.outputDir.length > 0
          ? { outputDir: launchArgs.outputDir }
          : {}),
      },
    });

    const symbolIndex = buildSymbolIndex({
      mapping: builtSourceState.mapping,
      listingContent,
      sourceFile: deps.sourceState.file,
    });

    applyWriteRanges(runtime.hardware.memory, deps.sessionState.loadedProgram, program);
    deps.sessionState.loadedProgram = program;
    deps.sessionState.listing = listingInfo;
    deps.sessionState.listingPath = listingPath;
    deps.sessionState.mapping = builtSourceState.mapping;
    deps.sessionState.mappingIndex = builtSourceState.mappingIndex;
    deps.sessionState.sourceRoots = builtSourceState.sourceRoots;
    deps.sessionState.extraListingPaths = builtSourceState.extraListingPaths;
    deps.sessionState.symbolAnchors = symbolIndex.anchors;
    deps.sessionState.symbolList = symbolIndex.list;
    deps.sessionState.runState.callDepth = 0;
    deps.sessionState.runState.haltNotified = false;
    deps.sessionState.runState.lastBreakpointAddress = null;
    deps.sessionState.runState.skipBreakpointOnce = null;
    deps.sourceState.lookupAnchors = symbolIndex.lookupAnchors;

    emitMainSource((event) => deps.sendEvent(event as DebugProtocol.Event), deps.sourceState.file);

    const applied = deps.breakpointManager.applyAll(
      deps.sessionState.listing,
      deps.sessionState.listingPath,
      deps.sessionState.mappingIndex
    );
    for (const bp of applied) {
      deps.sendEvent(new BreakpointEvent('changed', bp));
    }

    if (deps.sessionState.entryCpuState !== undefined) {
      runtime.restoreCpuState(deps.sessionState.entryCpuState);
    } else {
      runtime.reset(program, deps.sessionState.loadedEntry);
    }

    emitConsoleOutput(
      (event) => deps.sendEvent(event as DebugProtocol.Event),
      'Debug80: Rebuilt program and restarted from the captured entry state.'
    );
    deps.sendResponse(response);
    return true;
  } catch (err) {
    const detail = `Debug80: Warm rebuild failed: ${String(err)}`;
    deps.logger.error(detail);
    emitConsoleOutput((event) => deps.sendEvent(event as DebugProtocol.Event), detail);
    deps.sendErrorResponse(response, 1, detail);
    return true;
  }
}