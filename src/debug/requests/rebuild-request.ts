/**
 * @fileoverview Warm rebuild request for active debug sessions.
 */

import * as fs from 'fs';
import * as path from 'path';
import { BreakpointEvent } from '@vscode/debugadapter';
import type { DebugProtocol } from '@vscode/debugprotocol';
import {
  AssembleFailureError,
  formatAssemblyDiagnostic,
  resolveBundledTec1Rom,
} from '../launch/assembler';
import { emitConsoleOutput, emitMainSource } from '../session/adapter-ui';
import { resolveAssemblerBackend } from '../launch/assembler-backend';
import type { BreakpointManager } from '../mapping/breakpoint-manager';
import { resolveArtifacts, resolveAsmPath, resolveDebugMapPath, resolveExtraDebugMapPath, resolveRelative, relativeIfPossible } from '../launch-args';
import { assembleIfRequested } from '../launch/launch-pipeline';
import type { WarmRebuildResult } from '../session/message-types';
import { resolveListingSourcePath, resolveMappedPath, resolveBaseDir, resolveCacheDir, buildListingCacheKey } from '../mapping/path-resolver';
import { loadProgramArtifacts } from '../launch/program-loader';
import type { SessionStateShape } from '../session/session-state';
import type { SourceStateManager } from '../mapping/source-state-manager';
import { SourceManager } from '../mapping/source-manager';
import { buildSymbolIndex } from '../mapping/symbol-service';
import type { Logger } from '../../util/logger';

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

function sendWarmRebuildResult(
  response: DebugProtocol.Response,
  deps: RebuildDeps,
  result: WarmRebuildResult,
  showInConsole = true
): boolean {
  response.body = result;
  if (showInConsole) {
    const consoleMessage = [result.summary, result.detail]
      .filter((value): value is string => value !== undefined && value.length > 0)
      .join('\n');
    emitConsoleOutput((event) => deps.sendEvent(event as DebugProtocol.Event), consoleMessage);
  }
  deps.sendResponse(response);
  return true;
}

function createWarmRebuildFailureResult(
  summary: string,
  options?: { detail?: string; location?: WarmRebuildResult['location'] }
): WarmRebuildResult {
  return {
    ok: false,
    summary,
    ...(options?.detail !== undefined ? { detail: options.detail } : {}),
    ...(options?.location !== undefined ? { location: options.location } : {}),
  };
}

function buildCompactFailureDetail(err: AssembleFailureError): string | undefined {
  const diagnostic = err.result.diagnostic;
  if (diagnostic !== undefined) {
    return [diagnostic.message, diagnostic.sourceLine]
      .filter((value): value is string => value !== undefined && value.length > 0)
      .join('\n');
  }
  return err.result.error;
}

export function handleWarmRebuildRequest(
  response: DebugProtocol.Response,
  deps: RebuildDeps
): boolean {
  const launchArgs = deps.sessionState.launchArgs;
  const runtime = deps.sessionState.runtime;
  if (!launchArgs || !runtime) {
    return sendWarmRebuildResult(
      response,
      deps,
      createWarmRebuildFailureResult('Debug80: No active launch to rebuild.'),
      false
    );
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
      return sendWarmRebuildResult(
        response,
        deps,
        createWarmRebuildFailureResult('Debug80: Rebuild did not produce HEX/LST artifacts.')
      );
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

    const successSummary = `${path.basename(asmPath ?? listingPath)} rebuilt and restarted`;
    return sendWarmRebuildResult(
      response,
      deps,
      {
        ok: true,
        summary: successSummary,
        ...(asmPath !== undefined && asmPath.length > 0 ? { rebuiltPath: asmPath } : {}),
      },
      true
    );
  } catch (err) {
    if (err instanceof AssembleFailureError) {
      const diagnostic = err.result.diagnostic;
      const location =
        diagnostic?.path !== undefined && diagnostic.line !== undefined
          ? {
              path: diagnostic.path,
              line: diagnostic.line,
              ...(diagnostic.column !== undefined ? { column: diagnostic.column } : {}),
              ...(diagnostic.sourceLine !== undefined
                ? { sourceLine: diagnostic.sourceLine }
                : {}),
            }
          : undefined;
      const locationLabel =
        location !== undefined ? `${path.basename(location.path)}:${location.line}` : 'assembly';
      const summary = locationLabel;
      const detail = buildCompactFailureDetail(err) ?? formatAssemblyDiagnostic(diagnostic ?? {
        message: err.result.error ?? String(err),
      });
      return sendWarmRebuildResult(
        response,
        deps,
        createWarmRebuildFailureResult(summary, {
          ...(detail !== summary ? { detail } : {}),
          ...(location !== undefined ? { location } : {}),
        })
      );
    }

    const detail = String(err);
    return sendWarmRebuildResult(
      response,
      deps,
      createWarmRebuildFailureResult('Rebuild failed', { detail })
    );
  }
}