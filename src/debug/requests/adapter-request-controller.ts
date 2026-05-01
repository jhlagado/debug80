/**
 * @fileoverview DAP request/control helpers for the debug adapter.
 */

import { OutputEvent, StoppedEvent, TerminatedEvent, Thread } from '@vscode/debugadapter';
import type { DebugProtocol } from '@vscode/debugprotocol';
import type { StepInfo } from '../../z80/types';
import type { BreakpointManager } from '../mapping/breakpoint-manager';
import type { CommandRouter } from './command-router';
import { getShadowAlias, isBreakpointAddress } from '../mapping/debug-addressing';
import { buildStackFrames, flushDiagLog, isDiagnosticsEnabled } from '../mapping/stack-service';
import type { SourceStateManager } from '../mapping/source-state-manager';
import {
  captureEntryCpuStateIfNeeded,
  runUntilReturnAsync,
  runUntilStopAsync,
  type RuntimeControlContext,
} from '../session/runtime-control';
import { normalizeSourcePath, resolveMappedPath } from '../mapping/path-resolver';
import { getUnmappedCallReturnAddress } from '../session/step-call-resolver';
import { emitDebugSessionStatus } from '../session/session-status';
import type { VariableService } from './variable-service';
import type { SessionStateShape } from '../session/session-state';
import type { PlatformRegistry } from '../session/platform-registry';
import { ADDR_MASK } from '../../platforms/tec-common';
import {
  tryWriteRegisterByKey,
  writableRegisterKeyFromVariableName,
} from './register-request';

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

/**
 * Handles the adapter's request/control flow so the session class can stay small.
 */
export class AdapterRequestController {
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

    const verified =
      this.deps.sessionState.listing !== undefined && normalized !== undefined
        ? this.deps.breakpointManager.applyForSource(
            this.deps.sessionState.listing,
            this.deps.sessionState.listingPath,
            this.deps.sessionState.mappingIndex,
            normalized,
            breakpoints
          )
        : breakpoints.map((bp) => ({ line: bp.line, verified: false }));

    if (this.deps.sessionState.listing !== undefined) {
      this.deps.breakpointManager.rebuild(
        this.deps.sessionState.listing,
        this.deps.sessionState.listingPath,
        this.deps.sessionState.mappingIndex
      );
    }

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

  public nextRequest(response: DebugProtocol.NextResponse, _args: DebugProtocol.NextArguments): void {
    if (this.deps.sessionState.runtime === undefined) {
      this.deps.sendErrorResponse(response, 1, 'No program loaded');
      return;
    }

    const trace: StepInfo = { taken: false };
    const result = this.deps.sessionState.runtime.step({ trace });
    this.applyStepInfo(trace);
    this.deps.sessionState.platformRuntime?.recordCycles(result.cycles ?? 0);
    captureEntryCpuStateIfNeeded(this.deps.getRuntimeControlContext());
    this.deps.sessionState.runState.pauseRequested = false;
    this.deps.sendResponse(response);

    if (result.halted) {
      this.handleHaltStop();
    } else {
      if (trace.kind && trace.taken && trace.returnAddress !== undefined) {
        this.deps.sessionState.runState.haltNotified = false;
        this.deps.sessionState.runState.isRunning = true;
        this.deps.sessionState.runState.lastStopReason = 'step';
        this.deps.sessionState.runState.lastBreakpointAddress = null;
        this.runUntilStop(
          new Set([trace.returnAddress]),
          this.deps.sessionState.runState.stepOverMaxInstructions,
          'step over'
        );
        return;
      }
      this.deps.sessionState.runState.haltNotified = false;
      this.deps.sessionState.runState.isRunning = false;
      this.deps.sessionState.runState.lastStopReason = 'step';
      this.deps.sessionState.runState.lastBreakpointAddress = null;
      this.deps.sendEvent(new StoppedEvent('step', this.deps.threadId));
    }
  }

  public stepInRequest(
    response: DebugProtocol.StepInResponse,
    _args: DebugProtocol.StepInArguments
  ): void {
    if (this.deps.sessionState.runtime === undefined) {
      this.deps.sendErrorResponse(response, 1, 'No program loaded');
      return;
    }

    const unmappedReturn = this.resolveUnmappedCall();
    const trace: StepInfo = { taken: false };
    const result = this.deps.sessionState.runtime.step({ trace });
    this.applyStepInfo(trace);
    this.deps.sessionState.platformRuntime?.recordCycles(result.cycles ?? 0);
    captureEntryCpuStateIfNeeded(this.deps.getRuntimeControlContext());
    this.deps.sessionState.runState.pauseRequested = false;
    this.deps.sendResponse(response);

    if (unmappedReturn !== null && trace.kind && trace.taken) {
      const returnAddress = trace.returnAddress ?? unmappedReturn;
      this.deps.sessionState.runState.haltNotified = false;
      this.deps.sessionState.runState.isRunning = true;
      this.deps.sessionState.runState.lastStopReason = 'step';
      this.deps.sessionState.runState.lastBreakpointAddress = null;
      this.runUntilStop(
        new Set([returnAddress]),
        this.deps.sessionState.runState.stepOverMaxInstructions,
        'step over'
      );
      return;
    }

    if (result.halted) {
      this.handleHaltStop();
    } else {
      this.deps.sessionState.runState.haltNotified = false;
      this.deps.sessionState.runState.isRunning = false;
      this.deps.sessionState.runState.lastStopReason = 'step';
      this.deps.sessionState.runState.lastBreakpointAddress = null;
      this.deps.sendEvent(new StoppedEvent('step', this.deps.threadId));
    }
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
      resolveMappedPath(file, this.deps.sessionState.listingPath, this.deps.sessionState.sourceRoots);
    const responseBody = buildStackFrames(pc, {
      ...(this.deps.sessionState.listing !== undefined ? { listing: this.deps.sessionState.listing } : {}),
      ...(this.deps.sessionState.listingPath !== undefined
        ? { listingPath: this.deps.sessionState.listingPath }
        : {}),
      ...(this.deps.sessionState.mappingIndex !== undefined
        ? { mappingIndex: this.deps.sessionState.mappingIndex }
        : {}),
      ...(this.deps.sourceState.file !== undefined ? { sourceFile: this.deps.sourceState.file } : {}),
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
          `listingPath="${this.deps.sessionState.listingPath ?? '(none)'}" ` +
          `sourceRoots=[${this.deps.sessionState.sourceRoots.join(', ')}]`,
        ...diagLines,
        `  => frame.source="${frame?.source?.path ?? '(none)'}" line=${frame?.line ?? '?'}`,
      ].join('\n');
      this.deps.sendEvent(new OutputEvent(diagText + '\n', 'console'));
    }

    response.body = responseBody;
    this.deps.sendResponse(response);
  }

  public scopesRequest(
    response: DebugProtocol.ScopesResponse,
    _args: DebugProtocol.ScopesArguments
  ): void {
    response.body = {
      scopes: this.deps.variableService.createScopes(),
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

  public isBreakpointAddress(address: number | null): boolean {
    return isBreakpointAddress(address, {
      hasBreakpoint: (addr) => this.deps.breakpointManager.hasAddress(addr),
      activePlatform: this.deps.platformState.active,
      tec1gRuntime: this.deps.sessionState.tec1gRuntime,
    });
  }

  public handleHaltStop(): void {
    this.deps.sessionState.runState.isRunning = false;
    if (!this.deps.sessionState.runState.haltNotified) {
      this.deps.sessionState.runState.haltNotified = true;
      this.deps.sessionState.runState.lastStopReason = 'halt';
      this.deps.sessionState.runState.lastBreakpointAddress = null;
      emitDebugSessionStatus(this.deps.sendEvent, 'paused');
      this.deps.sendEvent(new StoppedEvent('halt', this.deps.threadId));
      return;
    }

    this.deps.sessionState.tec1Runtime?.silenceSpeaker();
    this.deps.sessionState.platformRuntime?.silenceSpeaker();
    this.deps.sendEvent(new TerminatedEvent());
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
    if (
      rs.lastStopReason === 'breakpoint' &&
      this.deps.sessionState.runtime?.getPC() === rs.lastBreakpointAddress &&
      rs.lastBreakpointAddress !== null &&
      this.isBreakpointAddress(rs.lastBreakpointAddress)
    ) {
      rs.skipBreakpointOnce = rs.lastBreakpointAddress;
    } else {
      rs.skipBreakpointOnce = null;
    }
  }

  private runUntilStop(
    extraBreakpoints?: Set<number>,
    maxInstructions?: number,
    limitLabel = 'step',
  ): void {
    this.deps.sessionState.runState.isRunning = true;
    void runUntilStopAsync(this.deps.getRuntimeControlContext(), {
      limitLabel,
      ...(extraBreakpoints !== undefined ? { extraBreakpoints } : {}),
      ...(maxInstructions !== undefined ? { maxInstructions } : {}),
    });
  }

  private resolveUnmappedCall(): number | null {
    const { runtime, mappingIndex } = this.deps.sessionState;
    if (runtime === undefined || mappingIndex === undefined) {
      return null;
    }
    const cpu = runtime.getRegisters();
    const memRead = runtime.hardware.memRead ?? ((addr: number): number => runtime.hardware.memory[addr & 0xffff] ?? 0);
    return getUnmappedCallReturnAddress({ cpu, memRead, mappingIndex });
  }

  private getShadowAlias(address: number): number | null {
    return getShadowAlias(address, {
      activePlatform: this.deps.platformState.active,
      tec1gRuntime: this.deps.sessionState.tec1gRuntime,
    });
  }

  private applyStepInfo(trace: StepInfo): void {
    if (!trace.kind || !trace.taken) {
      return;
    }
    if (trace.kind === 'call' || trace.kind === 'rst') {
      this.deps.sessionState.runState.callDepth += 1;
      return;
    }
    if (trace.kind === 'ret') {
      this.deps.sessionState.runState.callDepth = Math.max(0, this.deps.sessionState.runState.callDepth - 1);
    }
  }
}
