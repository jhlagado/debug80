/**
 * @fileoverview DAP request/control helpers for the debug adapter.
 */

import { Thread } from '@vscode/debugadapter';
import type { DebugProtocol } from '@vscode/debugprotocol';
import type { StepInfo } from '../../z80/types';
import type { BreakpointManager } from '../mapping/breakpoint-manager';
import type { CommandRouter } from './command-router';
import {
  getShadowAlias,
  getTec1gExpansionAddressSpace,
  isBreakpointAddress,
} from '../mapping/debug-addressing';
import { buildStackFrames, flushDiagLog, isDiagnosticsEnabled } from '../mapping/stack-service';
import type { SourceStateManager } from '../mapping/source-state-manager';
import {
  applyStepInfo,
  captureEntryCpuStateIfNeeded,
  runUntilReturnAsync,
  runUntilStopAsync,
  type RuntimeControlContext,
  type RuntimeStopTarget,
} from '../session/runtime-control';
import { normalizeSourcePath, resolveMappedPath } from '../mapping/path-resolver';
import {
  findSegmentForAddress,
  resolveExecutableLocationTargets,
  type ResolvedSourceAddress,
} from '../../mapping/source-map';
import { getUnmappedCallReturnAddress } from '../session/step-call-resolver';
import type { VariableService } from './variable-service';
import type { SessionStateShape } from '../session/session-state';
import type { PlatformRegistry } from '../session/platform-registry';
import type { SourceAddressSpace } from '../../mapping/types';
import { ADDR_MASK } from '../../platforms/tec-common';
import { tryWriteRegisterByKey, writableRegisterKeyFromVariableName } from './register-request';
import { buildEvaluateResponseBody, evaluateWatchExpressionTruthy } from './watch-expression';
import {
  emitConsoleDiagnostic,
  emitHaltStopped,
  emitInvalidConditionalBreakpoint,
  emitSourceMapMissing,
  emitStepStopped,
  emitTerminated,
} from './request-events';

export interface AdapterRequestControllerDeps {
  threadId: number;
  breakpointManager: BreakpointManager;
  sourceState: SourceStateManager;
  sessionState: SessionStateShape;
  platformState: { active: string };
  variableService: VariableService;
  commandRouter: CommandRouter;
  platformRegistry: PlatformRegistry;
  sendResponse: (response: DebugProtocol.Response) => void;
  sendErrorResponse: (response: DebugProtocol.Response, id: number, message: string) => void;
  sendEvent: (event: unknown) => void;
  getRuntimeControlContext: () => RuntimeControlContext;
}

function readFrameId(args: unknown): number | undefined {
  if (typeof args !== 'object' || args === null || !('frameId' in args)) {
    return undefined;
  }
  const value = (args as { frameId?: unknown }).frameId;
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
}

/**
 * Handles the adapter's request/control flow so the session class can stay small.
 */
export class AdapterRequestController {
  private readonly gotoTargets = new Map<number, RuntimeStopTarget>();
  private readonly reportedInvalidBreakpointConditions = new Set<string>();
  private nextGotoTargetId = 1;

  public constructor(private readonly deps: AdapterRequestControllerDeps) {}

  public markLaunchComplete(): void {
    this.deps.sessionState.runState.launchComplete = true;
  }

  public startConfiguredExecutionIfReady(): void {
    const runState = this.deps.sessionState.runState;
    if (!runState.launchComplete || !runState.configurationDone || runState.stopOnEntry) {
      return;
    }
    runState.isRunning = true;
    this.runUntilStop();
  }

  public setBreakPointsRequest(
    response: DebugProtocol.SetBreakpointsResponse,
    args: DebugProtocol.SetBreakpointsArguments
  ): void {
    const sourcePath = args.source?.path;
    const breakpoints = args.breakpoints ?? [];
    const normalized =
      sourcePath === undefined || sourcePath.length === 0
        ? undefined
        : normalizeSourcePath(sourcePath, this.deps.sessionState.baseDir);

    if (normalized !== undefined) {
      this.deps.breakpointManager.setPending(normalized, breakpoints);
    }
    this.reportedInvalidBreakpointConditions.clear();

    const verified =
      normalized !== undefined
        ? this.deps.breakpointManager.applyForSource(
            this.deps.sessionState.mappingIndex,
            normalized,
            breakpoints
          )
        : breakpoints.map((bp) => ({ line: bp.line, verified: false }));

    this.deps.breakpointManager.rebuild(this.deps.sessionState.mappingIndex);

    response.body = { breakpoints: verified };
    this.deps.sendResponse(response);
  }

  public configurationDoneRequest(
    response: DebugProtocol.ConfigurationDoneResponse,
    _args: DebugProtocol.ConfigurationDoneArguments
  ): void {
    this.deps.sessionState.runState.configurationDone = true;
    this.deps.sendResponse(response);
    this.startConfiguredExecutionIfReady();
  }

  public threadsRequest(response: DebugProtocol.ThreadsResponse): void {
    response.body = {
      threads: [new Thread(this.deps.threadId, 'Main Thread')],
    };
    this.deps.sendResponse(response);
  }

  public continueRequest(
    response: DebugProtocol.ContinueResponse,
    _args: DebugProtocol.ContinueArguments
  ): void {
    this.continueExecution(response);
  }

  public nextRequest(
    response: DebugProtocol.NextResponse,
    _args: DebugProtocol.NextArguments
  ): void {
    this.handleSingleStepRequest(response, {
      getStepOverReturnAddress: (trace) =>
        trace.kind && trace.taken ? trace.returnAddress : undefined,
      stepOverPrecedesHalt: false,
    });
  }

  public stepInRequest(
    response: DebugProtocol.StepInResponse,
    _args: DebugProtocol.StepInArguments
  ): void {
    const unmappedReturn = this.resolveUnmappedCall();
    this.handleSingleStepRequest(response, {
      getStepOverReturnAddress: (trace) =>
        unmappedReturn !== null && trace.kind && trace.taken
          ? (trace.returnAddress ?? unmappedReturn)
          : undefined,
      stepOverPrecedesHalt: true,
    });
  }

  public stepOutRequest(
    response: DebugProtocol.StepOutResponse,
    _args: DebugProtocol.StepOutArguments
  ): void {
    if (this.deps.sessionState.runtime === undefined) {
      this.deps.sendErrorResponse(response, 1, 'No program loaded');
      return;
    }
    const baseline = this.deps.sessionState.runState.callDepth;
    this.deps.sessionState.runState.isRunning = true;
    this.deps.sendResponse(response);
    this.deps.sessionState.runState.pauseRequested = false;
    this.updateBreakpointSkip();
    void runUntilReturnAsync(
      this.deps.getRuntimeControlContext(),
      baseline,
      this.deps.sessionState.runState.stepOutMaxInstructions
    );
  }

  public pauseRequest(
    response: DebugProtocol.PauseResponse,
    _args: DebugProtocol.PauseArguments
  ): void {
    this.deps.sessionState.runState.pauseRequested = true;
    this.deps.sendResponse(response);
  }

  public gotoTargetsRequest(
    response: DebugProtocol.GotoTargetsResponse,
    args: DebugProtocol.GotoTargetsArguments
  ): void {
    const sourcePath = args.source?.path;
    const line = args.line ?? 0;
    const mappingIndex = this.deps.sessionState.mappingIndex;
    if (sourcePath === undefined || sourcePath.length === 0 || mappingIndex === undefined) {
      response.body = { targets: [] };
      emitSourceMapMissing(this.deps.sendEvent);
      this.deps.sendResponse(response);
      return;
    }

    const normalized = normalizeSourcePath(sourcePath, this.deps.sessionState.baseDir);
    const direct = resolveExecutableLocationTargets(mappingIndex, normalized, line);
    const addresses = direct.length > 0 ? direct : this.resolveGotoByBasename(normalized, line);
    const targets = addresses.map((target) => {
      const id = this.nextGotoTargetId++;
      const address = target.address & ADDR_MASK;
      this.gotoTargets.set(id, {
        address,
        ...(target.addressSpace !== undefined ? { addressSpace: target.addressSpace } : {}),
      });
      return {
        id,
        label: `$${address.toString(16).toUpperCase().padStart(4, '0')}`,
        line,
      };
    });
    response.body = { targets };
    this.deps.sendResponse(response);
  }

  public gotoRequest(
    response: DebugProtocol.GotoResponse,
    args: DebugProtocol.GotoArguments
  ): void {
    const target = this.gotoTargets.get(args.targetId);
    if (target === undefined) {
      this.deps.sendErrorResponse(response, 1, 'Debug80: Run to Cursor target is unavailable.');
      return;
    }
    if (this.deps.sessionState.runtime === undefined) {
      this.deps.sendErrorResponse(response, 1, 'No program loaded');
      return;
    }
    this.gotoTargets.delete(args.targetId);
    this.deps.sendResponse(response);
    this.deps.sessionState.runState.pauseRequested = false;
    this.updateBreakpointSkip();
    this.runUntilStop([target], undefined, 'run to cursor');
  }

  public stackTraceRequest(
    response: DebugProtocol.StackTraceResponse,
    _args: DebugProtocol.StackTraceArguments
  ): void {
    if (this.deps.sessionState.runtime === undefined) {
      response.body = { stackFrames: [], totalFrames: 0 };
      this.deps.sendResponse(response);
      return;
    }
    const pc = this.deps.sessionState.runtime.getPC();
    const resolveFn = (file: string): string | undefined =>
      resolveMappedPath(file, undefined, this.deps.sessionState.sourceRoots);
    const responseBody = buildStackFrames(pc, {
      ...(this.deps.sessionState.mappingIndex !== undefined
        ? { mappingIndex: this.deps.sessionState.mappingIndex }
        : {}),
      ...(this.deps.sourceState.file !== undefined
        ? { sourceFile: this.deps.sourceState.file }
        : {}),
      symbolAnchors: this.deps.sessionState.symbolAnchors,
      lookupAnchors: this.deps.sourceState.lookupAnchors,
      stackPointer: this.deps.sessionState.runtime.getRegisters().sp,
      maxStackFrames: 8,
      readMemory: (address) =>
        this.deps.sessionState.runtime?.hardware.memRead?.(address) ??
        this.deps.sessionState.runtime?.hardware.memory[address & ADDR_MASK] ??
        0,
      resolveMappedPath: resolveFn,
      getAddressAliases: (address) => {
        const masked = address & ADDR_MASK;
        const aliases = [masked];
        const shadowAlias = this.getShadowAlias(masked);
        if (shadowAlias !== null && shadowAlias !== masked) {
          aliases.push(shadowAlias);
        }
        return aliases;
      },
      getAddressSpace: (address) => this.getExpansionAddressSpace(address & ADDR_MASK),
    });

    if (isDiagnosticsEnabled()) {
      const diagLines = flushDiagLog();
      const frame = responseBody.stackFrames[0];
      const hasMappingIndex = this.deps.sessionState.mappingIndex !== undefined;
      const segCount = this.deps.sessionState.mappingIndex?.segmentsByAddress?.length ?? 0;
      const diagText = [
        `[debug80-diag] PC=0x${pc.toString(16).padStart(4, '0')} ` +
          `mappingIndex=${hasMappingIndex} (${segCount} segs) ` +
          `sourceFile="${this.deps.sourceState.file ?? '(none)'}" ` +
          `sourceRoots=[${this.deps.sessionState.sourceRoots.join(', ')}]`,
        ...diagLines,
        `  => frame.source="${frame?.source?.path ?? '(none)'}" line=${frame?.line ?? '?'}`,
      ].join('\n');
      emitConsoleDiagnostic(this.deps.sendEvent, diagText);
    }

    response.body = responseBody;
    this.deps.sendResponse(response);
  }

  public scopesRequest(
    response: DebugProtocol.ScopesResponse,
    _args: DebugProtocol.ScopesArguments
  ): void {
    response.body = {
      scopes: this.deps.variableService.createScopes(this.deps.sessionState.sourceMapSymbols),
    };
    this.deps.sendResponse(response);
  }

  public variablesRequest(
    response: DebugProtocol.VariablesResponse,
    args: DebugProtocol.VariablesArguments
  ): void {
    response.body = {
      variables: this.deps.variableService.resolveVariables(
        args.variablesReference,
        this.deps.sessionState.runtime
      ),
    };

    this.deps.sendResponse(response);
  }

  public evaluateRequest(
    response: DebugProtocol.EvaluateResponse,
    args: DebugProtocol.EvaluateArguments
  ): void {
    try {
      response.body = buildEvaluateResponseBody(args.expression, {
        runtime: this.deps.sessionState.runtime,
        symbols: this.deps.sessionState.sourceMapSymbols,
      });
      this.deps.sendResponse(response);
    } catch (err) {
      this.deps.sendErrorResponse(response, 1, String(err instanceof Error ? err.message : err));
    }
  }

  public setVariableRequest(
    response: DebugProtocol.SetVariableResponse,
    args: DebugProtocol.SetVariableArguments
  ): void {
    if (!this.deps.variableService.isRegistersVariablesReference(args.variablesReference)) {
      this.deps.sendErrorResponse(response, 1, 'Debug80: This variable cannot be edited here.');
      return;
    }

    const registerKey = writableRegisterKeyFromVariableName(args.name);
    if (registerKey === null) {
      this.deps.sendErrorResponse(
        response,
        1,
        'Debug80: This register is read-only or not recognized.'
      );
      return;
    }

    const err = tryWriteRegisterByKey(this.deps.sessionState, registerKey, args.value);
    if (err !== null) {
      this.deps.sendErrorResponse(response, 1, err);
      return;
    }

    const runtime = this.deps.sessionState.runtime;
    const variables = this.deps.variableService.resolveVariables(args.variablesReference, runtime);
    const updated = variables.find((v) => v.name === args.name);
    response.body = {
      value: updated?.value ?? String(args.value),
    };
    this.deps.sendResponse(response);
  }

  public disconnectRequest(
    response: DebugProtocol.DisconnectResponse,
    _args: DebugProtocol.DisconnectArguments
  ): void {
    this.deps.sessionState.platformRuntime?.silenceSpeaker();
    this.deps.sessionState.runtime = undefined;
    this.deps.sessionState.runState.isRunning = false;
    this.deps.sessionState.runState.haltNotified = false;
    this.deps.sessionState.terminalState = undefined;
    this.deps.sessionState.tec1Runtime = undefined;
    this.deps.sessionState.tec1gRuntime = undefined;
    this.deps.sessionState.platformRuntime = undefined;
    this.deps.sessionState.loadedProgram = undefined;
    this.deps.sessionState.loadedEntry = undefined;
    this.deps.sessionState.restartCaptureAddress = undefined;
    this.deps.sessionState.entryCpuState = undefined;
    this.deps.sessionState.launchArgs = undefined;
    this.deps.platformRegistry.clear();
    this.deps.sendResponse(response);
  }

  public customRequest(
    command: string,
    response: DebugProtocol.Response,
    args: unknown,
    fallback: (command: string, response: DebugProtocol.Response, args: unknown) => void
  ): void {
    if (this.deps.commandRouter.handle(command, response, args)) {
      return;
    }
    const platformHandler = this.deps.platformRegistry.getHandler(command);
    if (platformHandler && platformHandler(response, args)) {
      return;
    }
    fallback(command, response, args);
  }

  public runToStackFrameRequest(response: DebugProtocol.Response, args: unknown): boolean {
    const frameId = readFrameId(args);
    const runtime = this.deps.sessionState.runtime;
    if (runtime === undefined) {
      this.deps.sendErrorResponse(response, 1, 'No program loaded');
      return true;
    }
    if (frameId === undefined || frameId < 1) {
      this.deps.sendErrorResponse(response, 1, 'Select a stack return frame, not the current PC.');
      return true;
    }
    const sp = runtime.getRegisters().sp & ADDR_MASK;
    const stackAddress = (sp + (frameId - 1) * 2) & ADDR_MASK;
    const returnAddress = this.readWord(stackAddress);
    const segment =
      this.deps.sessionState.mappingIndex !== undefined
        ? findSegmentForAddress(this.deps.sessionState.mappingIndex, returnAddress)
        : undefined;
    if (segment === undefined || segment.loc.file === null) {
      this.deps.sendErrorResponse(
        response,
        1,
        `Stack entry $${returnAddress.toString(16).padStart(4, '0')} is not mapped to source code.`
      );
      return true;
    }

    this.deps.sendResponse(response);
    this.deps.sessionState.runState.pauseRequested = false;
    this.updateBreakpointSkip();
    this.runUntilStop([{ address: returnAddress & ADDR_MASK }], undefined, 'stack frame return');
    return true;
  }

  public isBreakpointAddress(address: number | null): boolean {
    return isBreakpointAddress(address, {
      hasBreakpoint: (addr, addressSpace) =>
        this.deps.breakpointManager.hasAddress(addr, addressSpace),
      activePlatform: this.deps.platformState.active,
      tec1gRuntime: this.deps.sessionState.tec1gRuntime,
    });
  }

  public shouldStopAtBreakpoint(address: number | null): boolean {
    if (address === null) {
      return false;
    }
    const matched = this.findMatchedBreakpointAddress(address);
    if (matched === null) {
      return false;
    }
    const condition = this.deps.breakpointManager.getCondition(
      matched.address,
      matched.addressSpace
    );
    if (condition === undefined) {
      return true;
    }
    try {
      return evaluateWatchExpressionTruthy(condition, {
        runtime: this.deps.sessionState.runtime,
        symbols: this.deps.sessionState.sourceMapSymbols,
      });
    } catch (err) {
      const reportKey = `${matched.address}:${matched.addressSpace?.kind ?? 'addr'}:${matched.addressSpace?.physicalBank ?? ''}:${condition}`;
      if (!this.reportedInvalidBreakpointConditions.has(reportKey)) {
        this.reportedInvalidBreakpointConditions.add(reportKey);
        emitInvalidConditionalBreakpoint(this.deps.sendEvent, condition, err);
      }
      return false;
    }
  }

  public getBreakpointAddressSpace(address: number | null): SourceAddressSpace | undefined {
    if (address === null) {
      return undefined;
    }
    return this.findMatchedBreakpointAddress(address)?.addressSpace;
  }

  public handleHaltStop(): void {
    this.deps.sessionState.runState.isRunning = false;
    if (!this.deps.sessionState.runState.haltNotified) {
      this.deps.sessionState.runState.haltNotified = true;
      this.deps.sessionState.runState.lastStopReason = 'halt';
      this.deps.sessionState.runState.lastBreakpointAddress = null;
      this.deps.sessionState.runState.lastBreakpointAddressSpace = undefined;
      emitHaltStopped(this.deps.sendEvent, this.deps.threadId);
      return;
    }

    this.deps.sessionState.tec1Runtime?.silenceSpeaker();
    this.deps.sessionState.platformRuntime?.silenceSpeaker();
    emitTerminated(this.deps.sendEvent);
  }

  private continueExecution(response: DebugProtocol.Response): void {
    if (this.deps.sessionState.runtime === undefined) {
      this.deps.sendErrorResponse(response, 1, 'No program loaded');
      return;
    }

    this.deps.sendResponse(response);
    this.deps.sessionState.runState.pauseRequested = false;
    this.updateBreakpointSkip();
    this.runUntilStop();
  }

  private updateBreakpointSkip(): void {
    const rs = this.deps.sessionState.runState;
    const matched =
      rs.lastBreakpointAddress !== null
        ? this.findMatchedBreakpointAddress(rs.lastBreakpointAddress)
        : null;
    if (
      rs.lastStopReason === 'breakpoint' &&
      this.deps.sessionState.runtime?.getPC() === rs.lastBreakpointAddress &&
      rs.lastBreakpointAddress !== null &&
      matched !== null &&
      addressSpacesEqual(matched.addressSpace, rs.lastBreakpointAddressSpace)
    ) {
      rs.skipBreakpointOnce = rs.lastBreakpointAddress;
      rs.skipBreakpointAddressSpace = matched.addressSpace;
    } else {
      rs.skipBreakpointOnce = null;
      rs.skipBreakpointAddressSpace = undefined;
    }
  }

  private runUntilStop(
    extraBreakpoints?: RuntimeStopTarget[],
    maxInstructions?: number,
    limitLabel = 'step'
  ): void {
    this.deps.sessionState.runState.isRunning = true;
    void runUntilStopAsync(this.deps.getRuntimeControlContext(), {
      limitLabel,
      ...(extraBreakpoints !== undefined ? { extraBreakpoints } : {}),
      ...(maxInstructions !== undefined ? { maxInstructions } : {}),
    });
  }

  private findMatchedBreakpointAddress(address: number): {
    address: number;
    addressSpace?: SourceAddressSpace;
  } | null {
    const masked = address & ADDR_MASK;
    const addressSpace = this.getExpansionAddressSpace(masked);
    if (
      addressSpace !== undefined &&
      this.deps.breakpointManager.hasAddress(masked, addressSpace)
    ) {
      return { address: masked, ...(addressSpace !== undefined ? { addressSpace } : {}) };
    }
    if (this.deps.breakpointManager.hasAddress(masked)) {
      return { address: masked };
    }
    const shadowAlias = this.getShadowAlias(masked);
    if (shadowAlias !== null && this.deps.breakpointManager.hasAddress(shadowAlias)) {
      return { address: shadowAlias };
    }
    return null;
  }

  private readWord(address: number): number {
    const runtime = this.deps.sessionState.runtime;
    const readByte = (addr: number): number =>
      runtime?.hardware.memRead?.(addr) ?? runtime?.hardware.memory[addr & ADDR_MASK] ?? 0;
    return (readByte(address) & 0xff) | ((readByte((address + 1) & ADDR_MASK) & 0xff) << 8);
  }

  private handleSingleStepRequest(
    response: DebugProtocol.Response,
    options: {
      getStepOverReturnAddress: (trace: StepInfo) => number | undefined;
      stepOverPrecedesHalt: boolean;
    }
  ): void {
    const runtime = this.deps.sessionState.runtime;
    if (runtime === undefined) {
      this.deps.sendErrorResponse(response, 1, 'No program loaded');
      return;
    }

    const trace: StepInfo = { taken: false };
    const result = runtime.step({ trace });
    const context = this.deps.getRuntimeControlContext();
    applyStepInfo(context, trace);
    this.deps.sessionState.platformRuntime?.recordCycles(result.cycles ?? 0);
    captureEntryCpuStateIfNeeded(context);
    this.deps.sessionState.runState.pauseRequested = false;
    this.deps.sendResponse(response);

    if (options.stepOverPrecedesHalt && this.continueStepOverIfNeeded(options, trace)) {
      return;
    }

    if (result.halted) {
      this.handleHaltStop();
      return;
    }

    if (!options.stepOverPrecedesHalt && this.continueStepOverIfNeeded(options, trace)) {
      return;
    }

    this.markStepStopped();
    emitStepStopped(this.deps.sendEvent, this.deps.threadId);
  }

  private continueStepOverIfNeeded(
    options: {
      getStepOverReturnAddress: (trace: StepInfo) => number | undefined;
    },
    trace: StepInfo
  ): boolean {
    const returnAddress = options.getStepOverReturnAddress(trace);
    if (returnAddress === undefined) {
      return false;
    }

    this.markStepRunning();
    this.runUntilStop(
      [{ address: returnAddress & ADDR_MASK }],
      this.deps.sessionState.runState.stepOverMaxInstructions,
      'step over'
    );
    return true;
  }

  private markStepRunning(): void {
    this.deps.sessionState.runState.haltNotified = false;
    this.deps.sessionState.runState.isRunning = true;
    this.deps.sessionState.runState.lastStopReason = 'step';
    this.deps.sessionState.runState.lastBreakpointAddress = null;
    this.deps.sessionState.runState.lastBreakpointAddressSpace = undefined;
  }

  private markStepStopped(): void {
    this.deps.sessionState.runState.haltNotified = false;
    this.deps.sessionState.runState.isRunning = false;
    this.deps.sessionState.runState.lastStopReason = 'step';
    this.deps.sessionState.runState.lastBreakpointAddress = null;
    this.deps.sessionState.runState.lastBreakpointAddressSpace = undefined;
  }

  private resolveUnmappedCall(): number | null {
    const { runtime, mappingIndex } = this.deps.sessionState;
    if (runtime === undefined || mappingIndex === undefined) {
      return null;
    }
    const cpu = runtime.getRegisters();
    const memRead =
      runtime.hardware.memRead ??
      ((addr: number): number => runtime.hardware.memory[addr & 0xffff] ?? 0);
    return getUnmappedCallReturnAddress({
      cpu,
      memRead,
      mappingIndex,
      getAddressSpace: (address) => this.getExpansionAddressSpace(address & ADDR_MASK),
    });
  }

  private resolveGotoByBasename(sourcePath: string, line: number): ResolvedSourceAddress[] {
    const mappingIndex = this.deps.sessionState.mappingIndex;
    if (mappingIndex === undefined) {
      return [];
    }
    const want = sourcePath.split(/[\\/]/).pop()?.toLowerCase() ?? '';
    const lineSlop = [0, -1, 1, -2, 2, -3, 3, -4, 4];
    for (const [fileKey, fileMap] of mappingIndex.segmentsByFileLine.entries()) {
      if ((fileKey.split(/[\\/]/).pop()?.toLowerCase() ?? '') !== want) {
        continue;
      }
      for (const delta of lineSlop) {
        const tryLine = line + delta;
        if (tryLine < 1) {
          continue;
        }
        const segments = fileMap.get(tryLine);
        const executable = segments?.filter((segment) => segment.end > segment.start) ?? [];
        if (executable.length > 0) {
          return executable.map((segment) => ({
            address: segment.start,
            ...(segment.addressSpace !== undefined ? { addressSpace: segment.addressSpace } : {}),
          }));
        }
      }
    }
    return [];
  }

  private getShadowAlias(address: number): number | null {
    return getShadowAlias(address, {
      activePlatform: this.deps.platformState.active,
      tec1gRuntime: this.deps.sessionState.tec1gRuntime,
    });
  }

  private getExpansionAddressSpace(address: number): SourceAddressSpace | undefined {
    return getTec1gExpansionAddressSpace(address, {
      activePlatform: this.deps.platformState.active,
      tec1gRuntime: this.deps.sessionState.tec1gRuntime,
    });
  }
}

function addressSpacesEqual(
  actual: SourceAddressSpace | undefined,
  expected: SourceAddressSpace | undefined
): boolean {
  return actual?.kind === expected?.kind && actual?.physicalBank === expected?.physicalBank;
}
