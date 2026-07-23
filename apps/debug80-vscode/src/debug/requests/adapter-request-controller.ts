import { Thread } from '@vscode/debugadapter';
import type { DebugProtocol } from '@vscode/debugprotocol';
import type { StepInfo } from '@jhlagado/debug80-runtime/z80/types';
import {
  getShadowAlias,
  getTec1gExpansionAddressSpace,
  isBreakpointAddress,
  sourceAddressSpacesEqual,
} from '../mapping/debug-addressing';
import {
  applyStepInfo,
  captureEntryCpuStateIfNeeded,
  runUntilReturnAsync,
  runUntilStopAsync,
  type RuntimeStopTarget,
} from '../session/runtime-control';
import { normalizeSourcePath } from '../mapping/path-resolver';
import { getUnmappedCallReturnAddress } from '../session/step-call-resolver';
import type { SourceAddressSpace } from '../../mapping/types';
import { ADDR_MASK } from '@jhlagado/debug80-runtime/platforms/tec-common';
import { evaluateWatchExpressionTruthy } from './watch-expression';
import {
  emitHaltStopped,
  emitInvalidConditionalBreakpoint,
  emitStepStopped,
  emitTerminated,
} from './request-events';
import { AdapterInspectionRequests } from './adapter-inspection-requests';
import { AdapterNavigationRequests } from './adapter-navigation-requests';
import type { AdapterRequestControllerDeps } from './adapter-request-deps';

export type { AdapterRequestControllerDeps } from './adapter-request-deps';

export class AdapterRequestController {
  private readonly navigationRequests: AdapterNavigationRequests;
  private readonly inspectionRequests: AdapterInspectionRequests;
  private readonly reportedInvalidBreakpointConditions = new Set<string>();
  public constructor(private readonly deps: AdapterRequestControllerDeps) {
    this.inspectionRequests = new AdapterInspectionRequests(deps);
    this.navigationRequests = new AdapterNavigationRequests(
      deps,
      () => {
        this.deps.sessionState.runState.pauseRequested = false;
        this.updateBreakpointSkip();
      },
      (extraBreakpoints, maxInstructions, limitLabel) =>
        this.runUntilStop(extraBreakpoints, maxInstructions, limitLabel)
    );
  }

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
    this.navigationRequests.gotoTargetsRequest(response, args);
  }

  public gotoRequest(
    response: DebugProtocol.GotoResponse,
    args: DebugProtocol.GotoArguments
  ): void {
    this.navigationRequests.gotoRequest(response, args);
  }

  public stackTraceRequest(
    response: DebugProtocol.StackTraceResponse,
    args: DebugProtocol.StackTraceArguments
  ): void {
    this.inspectionRequests.stackTraceRequest(response, args);
  }

  public scopesRequest(
    response: DebugProtocol.ScopesResponse,
    args: DebugProtocol.ScopesArguments
  ): void {
    this.inspectionRequests.scopesRequest(response, args);
  }

  public variablesRequest(
    response: DebugProtocol.VariablesResponse,
    args: DebugProtocol.VariablesArguments
  ): void {
    this.inspectionRequests.variablesRequest(response, args);
  }

  public evaluateRequest(
    response: DebugProtocol.EvaluateResponse,
    args: DebugProtocol.EvaluateArguments
  ): void {
    this.inspectionRequests.evaluateRequest(response, args);
  }

  public setVariableRequest(
    response: DebugProtocol.SetVariableResponse,
    args: DebugProtocol.SetVariableArguments
  ): void {
    this.inspectionRequests.setVariableRequest(response, args);
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
    return this.navigationRequests.runToStackFrameRequest(response, args);
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
      sourceAddressSpacesEqual(matched.addressSpace, rs.lastBreakpointAddressSpace)
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
