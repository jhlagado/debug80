/**
 * @fileoverview Warm rebuild request for active debug sessions.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { DebugProtocol } from '@vscode/debugprotocol';
import {
  AssembleFailureError,
  formatAssemblyDiagnostic,
  resolveBundledTec1Rom,
} from '../launch/assembler';
import { emitConsoleOutput, emitMainSource } from '../session/adapter-ui';
import { resolveAssemblerBackend } from '../launch/assembler-backend';
import type { BreakpointManager } from '../mapping/breakpoint-manager';
import { assembleIfRequested } from '../launch/launch-pipeline';
import type { WarmRebuildResult } from '../session/message-types';
import { resolveBaseDir, resolveArtifacts, resolveRelative } from '../mapping/path-resolver';
import { loadProgramArtifacts } from '../launch/program-loader';
import type { SessionStateShape } from '../session/session-state';
import type { SourceStateManager } from '../mapping/source-state-manager';
import { buildSymbolIndex } from '../mapping/symbol-service';
import type { Logger } from '../../util/logger';
import { emitChangedBreakpoints } from '../session/runtime-events';
import {
  buildSourceStateBuildArgs,
  createSourceStateManager,
} from '../launch/source-state-build-options';
import { resolvePlatformProvider } from '../../platforms/provider';

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

function createAssemblyFailureLocation(
  err: AssembleFailureError
): WarmRebuildResult['location'] | undefined {
  const diagnostic = err.result.diagnostic;
  if (diagnostic?.path === undefined || diagnostic.line === undefined) {
    return undefined;
  }
  return {
    path: diagnostic.path,
    line: diagnostic.line,
    ...(diagnostic.column !== undefined ? { column: diagnostic.column } : {}),
    ...(diagnostic.sourceLine !== undefined ? { sourceLine: diagnostic.sourceLine } : {}),
  };
}

function createAssemblyFailureDetail(err: AssembleFailureError): string {
  return (
    buildCompactFailureDetail(err) ??
    formatAssemblyDiagnostic(
      err.result.diagnostic ?? {
        message: err.result.error ?? String(err),
      }
    )
  );
}

function createAssemblyFailureResult(err: AssembleFailureError): WarmRebuildResult {
  const location = createAssemblyFailureLocation(err);
  const summary =
    location !== undefined ? `${path.basename(location.path)}:${location.line}` : 'assembly';
  const detail = createAssemblyFailureDetail(err);
  return createWarmRebuildFailureResult(summary, {
    ...(detail !== summary ? { detail } : {}),
    ...(location !== undefined ? { location } : {}),
  });
}

function sendWarmRebuildErrorResult(
  response: DebugProtocol.Response,
  deps: RebuildDeps,
  err: unknown
): void {
  if (err instanceof AssembleFailureError) {
    sendWarmRebuildResult(response, deps, createAssemblyFailureResult(err));
    return;
  }

  sendWarmRebuildResult(
    response,
    deps,
    createWarmRebuildFailureResult('Rebuild failed', { detail: String(err) })
  );
}

export async function handleWarmRebuildRequest(
  response: DebugProtocol.Response,
  deps: RebuildDeps
): Promise<void> {
  const launchArgs = deps.sessionState.launchArgs;
  const runtime = deps.sessionState.runtime;
  if (!launchArgs || !runtime) {
    sendWarmRebuildResult(
      response,
      deps,
      createWarmRebuildFailureResult('Debug80: No active launch to rebuild.'),
      false
    );
    return;
  }

  try {
    const baseDir = deps.sessionState.baseDir || resolveBaseDir(launchArgs);
    const { asmPath, hexPath } = resolveArtifacts(launchArgs, baseDir);
    const backend = resolveAssemblerBackend(launchArgs.assembler, asmPath);
    const platformProvider = await resolvePlatformProvider(launchArgs);

    await assembleIfRequested({
      backend,
      args: launchArgs,
      asmPath,
      hexPath,
      sourceRoot: baseDir,
      platform: platformProvider.id,
      ...(platformProvider.simpleConfig !== undefined
        ? { simpleConfig: platformProvider.simpleConfig }
        : {}),
      sendEvent: (event) => deps.sendEvent(event as DebugProtocol.Event),
    });

    if (!fs.existsSync(hexPath)) {
      sendWarmRebuildResult(
        response,
        deps,
        createWarmRebuildFailureResult('Debug80: Rebuild did not produce a HEX artifact.')
      );
      return;
    }

    const tec1Config = launchArgs.tec1;
    const tec1gConfig = launchArgs.tec1g;
    const { program } = loadProgramArtifacts({
      platform: deps.platformState.active,
      baseDir,
      hexPath,
      resolveRelative: (p, dir) => resolveRelative(p, dir),
      resolveBundledTec1Rom: () => resolveBundledTec1Rom(),
      logger: deps.logger,
      ...(tec1Config !== undefined ? { tec1Config: tec1Config as never } : {}),
      ...(tec1gConfig !== undefined ? { tec1gConfig: tec1gConfig as never } : {}),
    });

    if (!deps.sourceState.manager) {
      deps.sourceState.setManager(
        createSourceStateManager({
          platform: deps.platformState.active,
          baseDir,
          getSourceRoots: () => deps.sessionState.sourceRoots,
          logger: deps.logger,
        })
      );
    }

    const builtSourceState = deps.sourceState.build(
      buildSourceStateBuildArgs({
        args: launchArgs,
        hexPath,
        asmPath,
        sourceRoots: launchArgs.sourceRoots ?? [],
      })
    );

    const symbolIndex = buildSymbolIndex({
      mapping: builtSourceState.mapping,
    });

    applyWriteRanges(runtime.hardware.memory, deps.sessionState.loadedProgram, program);
    deps.sessionState.loadedProgram = program;
    deps.sessionState.mapping = builtSourceState.mapping;
    deps.sessionState.mappingIndex = builtSourceState.mappingIndex;
    deps.sessionState.sourceRoots = builtSourceState.sourceRoots;
    deps.sessionState.symbolAnchors = symbolIndex.anchors;
    deps.sessionState.symbolList = symbolIndex.list;
    deps.sessionState.runState.callDepth = 0;
    deps.sessionState.runState.haltNotified = false;
    deps.sessionState.runState.lastBreakpointAddress = null;
    deps.sessionState.runState.lastBreakpointAddressSpace = undefined;
    deps.sessionState.runState.skipBreakpointOnce = null;
    deps.sessionState.runState.skipBreakpointAddressSpace = undefined;
    deps.sourceState.lookupAnchors = symbolIndex.lookupAnchors;

    emitMainSource((event) => deps.sendEvent(event as DebugProtocol.Event), deps.sourceState.file);

    const applied = deps.breakpointManager.applyAll(deps.sessionState.mappingIndex);
    emitChangedBreakpoints(deps.sendEvent, applied);

    if (deps.sessionState.entryCpuState !== undefined) {
      runtime.restoreCpuState(deps.sessionState.entryCpuState);
    } else {
      runtime.reset(program, deps.sessionState.loadedEntry);
    }

    const successSummary = `${path.basename(asmPath ?? hexPath)} rebuilt and restarted`;
    sendWarmRebuildResult(
      response,
      deps,
      {
        ok: true,
        summary: successSummary,
        ...(asmPath !== undefined && asmPath.length > 0 ? { rebuiltPath: asmPath } : {}),
      },
      true
    );
    return;
  } catch (err) {
    sendWarmRebuildErrorResult(response, deps, err);
  }
}
