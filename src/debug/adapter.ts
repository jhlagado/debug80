/**
 * @fileoverview Z80 Debug Adapter implementation.
 * Provides DAP (Debug Adapter Protocol) support for Z80 assembly debugging.
 */

import * as vscode from 'vscode';
import {
  DebugSession,
  InitializedEvent,
  StoppedEvent,
  TerminatedEvent,
  Thread,
  Handles,
  Event as DapEvent,
} from '@vscode/debugadapter';
import { DebugProtocol } from '@vscode/debugprotocol';

import { StepInfo } from '../z80/types';
import {
  createSessionState,
  resetSessionState,
  type SessionStateShape,
} from './session-state';
import { BreakpointManager } from './breakpoint-manager';
import { SourceStateManager } from './source-state-manager';
import { CommandRouter } from './command-router';
import { PlatformRegistry } from './platform-registry';
import { buildStackFrames } from './stack-service';
import {
  applyStepInfo,
  applyLaunchBreakpoints,
  applyLaunchSessionArtifacts,
  createLaunchSequenceContext,
  createRuntimeControlContext,
  runUntilReturnAsync,
  runUntilStopAsync,
  RuntimeControlContext,
} from './runtime-control';
import { VariableService } from './variable-service';
import { ADDR_MASK } from '../platforms/tec-common';
import { type MatrixKeyCombo } from '../platforms/tec1g/matrix-keymap';

import { LaunchRequestArguments } from './types';
import {
  resolveBaseDir,
  resolveMappedPath,
} from './path-resolver';
import { emitConsoleOutput } from './adapter-ui';
import { buildRomSourcesResponse } from './rom-requests';
import { handleTerminalInput, handleTerminalBreak } from './terminal-request';
import { handleMemorySnapshotRequest } from './memory-request';
import { getUnmappedCallReturnAddress } from './step-call-resolver';
import {
  populateFromConfig,
  normalizeSourcePath,
} from './launch-args';
import { getShadowAlias, isBreakpointAddress } from './debug-addressing';
import {
  MissingLaunchArtifactsError,
  buildLaunchSession,
  createLaunchLogger,
  hasLaunchInputs,
  respondToMissingArtifacts,
  respondToMissingLaunchInputs,
} from './launch-sequence';
import { Logger, NullLogger } from '../util/logger';

/** DAP thread identifier (single-threaded Z80) */
const THREAD_ID = 1;

export class Z80DebugSession extends DebugSession {
  private breakpointManager = new BreakpointManager();
  private sourceState = new SourceStateManager();
  private sessionState: SessionStateShape = createSessionState();
  private variableHandles = new Handles<'registers'>();
  private variableService = new VariableService(this.variableHandles);
  private matrixHeldKeys = new Map<string, MatrixKeyCombo[]>();
  private commandRouter = new CommandRouter();
  private platformRegistry = new PlatformRegistry();
  private platformState = {
    active: 'simple',
  };
  private logger: Logger;
  private readonly getRuntimeControlContext = (): RuntimeControlContext =>
    createRuntimeControlContext({
      sessionState: this.sessionState,
      activePlatform: () => this.platformState.active,
      isBreakpointAddress: (address: number | null): boolean =>
        this.isBreakpointAddress(address),
      handleHaltStop: (): void => this.handleHaltStop(),
      sendEvent: (event: unknown): void => {
        this.sendEvent(event as DebugProtocol.Event);
      },
    });

  public constructor(logger: Logger = new NullLogger()) {
    super();
    this.logger = logger;
    this.setDebuggerLinesStartAt1(true);
    this.setDebuggerColumnsStartAt1(true);
    this.registerCommandHandlers();
  }

  private registerCommandHandlers(): void {
    const respond = (response: DebugProtocol.Response): void => this.sendResponse(response);
    const respondError = (response: DebugProtocol.Response, id: number, message: string): void =>
      this.sendErrorResponse(response, id, message);
    const terminalDeps = {
      getTerminalState: () => this.sessionState.terminalState,
      sendResponse: respond,
      sendErrorResponse: respondError,
    };
    this.commandRouter.register('debug80/terminalInput', (response, args) =>
      handleTerminalInput(response, args, terminalDeps)
    );
    this.commandRouter.register('debug80/terminalBreak', (response) =>
      handleTerminalBreak(response, terminalDeps)
    );
    const memoryDeps = {
      getRuntime: () => this.sessionState.runtime,
      getSymbolAnchors: () => this.sessionState.symbolAnchors,
      getLookupAnchors: () => this.sourceState.lookupAnchors,
      getSymbolList: () => this.sessionState.symbolList,
      sendResponse: respond,
      sendErrorResponse: respondError,
    };
    this.commandRouter.register('debug80/tec1MemorySnapshot', (response, args) =>
      handleMemorySnapshotRequest(response, args, memoryDeps)
    );
    this.commandRouter.register('debug80/tec1gMemorySnapshot', (response, args) =>
      handleMemorySnapshotRequest(response, args, memoryDeps)
    );
    this.commandRouter.register('debug80/romSources', (response) => {
      response.body = buildRomSourcesResponse(
        this.sourceState.collectRomSources(this.sessionState.extraListingPaths)
      );
      this.sendResponse(response);
      return true;
    });
  }

  protected initializeRequest(
    response: DebugProtocol.InitializeResponse,
    _args: DebugProtocol.InitializeRequestArguments
  ): void {
    response.body = response.body ?? {};
    response.body.supportsConfigurationDoneRequest = true;
    response.body.supportsSingleThreadExecutionRequests = true;

    this.sendResponse(response);
    this.sendEvent(new InitializedEvent());
  }

  protected launchRequest(
    response: DebugProtocol.LaunchResponse,
    args: LaunchRequestArguments
  ): void {
    void this.handleLaunchRequest(response, args);
  }

  private async handleLaunchRequest(
    response: DebugProtocol.LaunchResponse,
    args: LaunchRequestArguments
  ): Promise<void> {
    resetSessionState(this.sessionState);
    this.breakpointManager.reset();
    const launchLogger = createLaunchLogger(this.logger, (event) => this.sendEvent(event));
    const merged: LaunchRequestArguments = populateFromConfig(args, {
      resolveBaseDir: (requestArgs) => resolveBaseDir(requestArgs),
    });
    this.sessionState.runState.stopOnEntry = merged.stopOnEntry === true;

    if (!hasLaunchInputs(merged)) {
      await respondToMissingLaunchInputs(
        response,
        () => this.promptForConfigCreation(),
        (launchResponse, id, message) => this.sendErrorResponse(launchResponse, id, message)
      );
      return;
    }

    try {
      const artifacts = buildLaunchSession(
        merged,
        createLaunchSequenceContext({
          logger: launchLogger,
          sessionState: this.sessionState,
          sourceState: this.sourceState,
          platformRegistry: this.platformRegistry,
          matrixHeldKeys: this.matrixHeldKeys,
          emitEvent: (event) => {
            this.sendEvent(event);
          },
          emitDapEvent: (name, payload) => {
            this.sendEvent(new DapEvent(name, payload));
          },
          sendResponse: (platformResponse) => {
            this.sendResponse(platformResponse);
          },
          sendErrorResponse: (platformResponse, id, message) => {
            this.sendErrorResponse(platformResponse, id, message);
          },
        })
      );
    applyLaunchSessionArtifacts(
      { platformState: this.platformState, sessionState: this.sessionState },
      artifacts
    );
    applyLaunchBreakpoints(
      this.breakpointManager,
      {
        listing: this.sessionState.listing,
        listingPath: this.sessionState.listingPath,
        mappingIndex: this.sessionState.mappingIndex,
      },
      (event) => {
        this.sendEvent(event);
      }
    );
    this.sendResponse(response);
    this.sendEntryStopIfNeeded();
    } catch (err) {
      if (err instanceof MissingLaunchArtifactsError) {
        await respondToMissingArtifacts(
          response,
          err,
          () => this.promptForConfigCreation(),
          (launchResponse, id, message) => this.sendErrorResponse(launchResponse, id, message)
        );
        return;
      }
      const detail = `Failed to load program: ${String(err)}`;
      this.logger.error(detail);
      emitConsoleOutput((event) => this.sendEvent(event as DebugProtocol.Event), detail);
      const short =
        detail.toLowerCase().includes('asm80') || detail.toLowerCase().includes('failed')
          ? 'Failed to load program (see Debug Console for asm80 output).'
          : detail;
      this.sendErrorResponse(response, 1, short);
    }
  }

  protected setBreakPointsRequest(
    response: DebugProtocol.SetBreakpointsResponse,
    args: DebugProtocol.SetBreakpointsArguments
  ): void {
    const sourcePath = args.source?.path;
    const breakpoints = args.breakpoints ?? [];
    const normalized =
      sourcePath === undefined || sourcePath.length === 0
        ? undefined
        : normalizeSourcePath(sourcePath, this.sessionState.baseDir);

    if (normalized !== undefined) {
      this.breakpointManager.setPending(normalized, breakpoints);
    }

    const verified =
      this.sessionState.listing !== undefined && normalized !== undefined
        ? this.breakpointManager.applyForSource(
            this.sessionState.listing,
            this.sessionState.listingPath,
            this.sessionState.mappingIndex,
            normalized,
            breakpoints
          )
        : breakpoints.map((bp) => ({ line: bp.line, verified: false }));

    if (this.sessionState.listing !== undefined) {
      this.breakpointManager.rebuild(
        this.sessionState.listing,
        this.sessionState.listingPath,
        this.sessionState.mappingIndex
      );
    }

    response.body = { breakpoints: verified };
    this.sendResponse(response);
  }

  protected configurationDoneRequest(
    response: DebugProtocol.ConfigurationDoneResponse,
    _args: DebugProtocol.ConfigurationDoneArguments
  ): void {
    this.sendResponse(response);

    if (!this.sessionState.runState.stopOnEntry) {
      this.runUntilStop();
    }
  }

  protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
    response.body = {
      threads: [new Thread(THREAD_ID, 'Main Thread')],
    };
    this.sendResponse(response);
  }

  protected continueRequest(
    response: DebugProtocol.ContinueResponse,
    _args: DebugProtocol.ContinueArguments
  ): void {
    this.continueExecution(response);
  }

  protected nextRequest(
    response: DebugProtocol.NextResponse,
    _args: DebugProtocol.NextArguments
  ): void {
    if (this.sessionState.runtime === undefined) {
      this.sendErrorResponse(response, 1, 'No program loaded');
      return;
    }

    const trace: StepInfo = { taken: false };
    const result = this.sessionState.runtime.step({ trace });
    applyStepInfo(this.getRuntimeControlContext(), trace);
    this.sessionState.platformRuntime?.recordCycles(result.cycles ?? 0);
    this.sessionState.runState.pauseRequested = false;
    this.sendResponse(response);

    if (result.halted) {
      this.handleHaltStop();
    } else {
      if (trace.kind && trace.taken && trace.returnAddress !== undefined) {
        this.sessionState.runState.haltNotified = false;
        this.sessionState.runState.lastStopReason = 'step';
        this.sessionState.runState.lastBreakpointAddress = null;
        this.runUntilStop(
          new Set([trace.returnAddress]),
          this.sessionState.runState.stepOverMaxInstructions,
          'step over'
        );
        return;
      }
      this.sessionState.runState.haltNotified = false;
      this.sessionState.runState.lastStopReason = 'step';
      this.sessionState.runState.lastBreakpointAddress = null;
      this.sendEvent(new StoppedEvent('step', THREAD_ID));
    }
  }

  protected stepInRequest(
    response: DebugProtocol.StepInResponse,
    _args: DebugProtocol.StepInArguments
  ): void {
    if (this.sessionState.runtime === undefined) {
      this.sendErrorResponse(response, 1, 'No program loaded');
      return;
    }

    const unmappedReturn = this.resolveUnmappedCall();
    const trace: StepInfo = { taken: false };
    const result = this.sessionState.runtime.step({ trace });
    applyStepInfo(this.getRuntimeControlContext(), trace);
    this.sessionState.platformRuntime?.recordCycles(result.cycles ?? 0);
    this.sessionState.runState.pauseRequested = false;
    this.sendResponse(response);

    if (unmappedReturn !== null && trace.kind && trace.taken) {
      const returnAddress = trace.returnAddress ?? unmappedReturn;
      this.sessionState.runState.haltNotified = false;
      this.sessionState.runState.lastStopReason = 'step';
      this.sessionState.runState.lastBreakpointAddress = null;
      this.runUntilStop(
        new Set([returnAddress]),
        this.sessionState.runState.stepOverMaxInstructions,
        'step over'
      );
      return;
    }

    if (result.halted) {
      this.handleHaltStop();
    } else {
      this.sessionState.runState.haltNotified = false;
      this.sessionState.runState.lastStopReason = 'step';
      this.sessionState.runState.lastBreakpointAddress = null;
      this.sendEvent(new StoppedEvent('step', THREAD_ID));
    }
  }

  protected stepOutRequest(
    response: DebugProtocol.StepOutResponse,
    _args: DebugProtocol.StepOutArguments
  ): void {
    if (this.sessionState.runtime === undefined) {
      this.sendErrorResponse(response, 1, 'No program loaded');
      return;
    }
    const baseline = this.sessionState.runState.callDepth;
    this.sendResponse(response);
    this.sessionState.runState.pauseRequested = false;
    this.updateBreakpointSkip();
    void runUntilReturnAsync(
      this.getRuntimeControlContext(),
      baseline,
      this.sessionState.runState.stepOutMaxInstructions
    );
  }

  protected pauseRequest(
    response: DebugProtocol.PauseResponse,
    _args: DebugProtocol.PauseArguments
  ): void {
    this.sessionState.runState.pauseRequested = true;
    this.sendResponse(response);
  }

  protected stackTraceRequest(
    response: DebugProtocol.StackTraceResponse,
    _args: DebugProtocol.StackTraceArguments
  ): void {
    if (this.sessionState.runtime === undefined) {
      response.body = { stackFrames: [], totalFrames: 0 };
      this.sendResponse(response);
      return;
    }
    const responseBody = buildStackFrames(this.sessionState.runtime.getPC(), {
      ...(this.sessionState.listing !== undefined ? { listing: this.sessionState.listing } : {}),
      ...(this.sessionState.listingPath !== undefined
        ? { listingPath: this.sessionState.listingPath }
        : {}),
      ...(this.sessionState.mappingIndex !== undefined
        ? { mappingIndex: this.sessionState.mappingIndex }
        : {}),
      ...(this.sourceState.file !== undefined ? { sourceFile: this.sourceState.file } : {}),
      resolveMappedPath: (file): string | undefined =>
        resolveMappedPath(file, this.sessionState.listingPath, this.sessionState.sourceRoots),
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

    response.body = responseBody;
    this.sendResponse(response);
  }

  private getShadowAlias(address: number): number | null {
    return getShadowAlias(address, {
      activePlatform: this.platformState.active,
      tec1gRuntime: this.sessionState.tec1gRuntime,
    });
  }

  private isBreakpointAddress(address: number | null): boolean {
    return isBreakpointAddress(address, {
      hasBreakpoint: (addr) => this.breakpointManager.hasAddress(addr),
      activePlatform: this.platformState.active,
      tec1gRuntime: this.sessionState.tec1gRuntime,
    });
  }

  protected scopesRequest(
    response: DebugProtocol.ScopesResponse,
    _args: DebugProtocol.ScopesArguments
  ): void {
    response.body = {
      scopes: this.variableService.createScopes(),
    };
    this.sendResponse(response);
  }

  protected variablesRequest(
    response: DebugProtocol.VariablesResponse,
    args: DebugProtocol.VariablesArguments
  ): void {
    response.body = {
      variables: this.variableService.resolveVariables(
        args.variablesReference,
        this.sessionState.runtime
      ),
    };

    this.sendResponse(response);
  }

  protected disconnectRequest(
    response: DebugProtocol.DisconnectResponse,
    _args: DebugProtocol.DisconnectArguments
  ): void {
    this.sessionState.platformRuntime?.silenceSpeaker();
    this.sessionState.runtime = undefined;
    this.sessionState.runState.haltNotified = false;
    this.sessionState.terminalState = undefined;
    this.sessionState.tec1Runtime = undefined;
    this.sessionState.tec1gRuntime = undefined;
    this.sessionState.platformRuntime = undefined;
    this.sessionState.loadedProgram = undefined;
    this.sessionState.loadedEntry = undefined;
    this.platformRegistry.clear();
    this.sendResponse(response);
  }

  protected customRequest(command: string, response: DebugProtocol.Response, args: unknown): void {
    if (this.commandRouter.handle(command, response, args)) {
      return;
    }
    const platformHandler = this.platformRegistry.getHandler(command);
    if (platformHandler && platformHandler(response, args)) {
      return;
    }
    super.customRequest(command, response, args);
  }

  private continueExecution(response: DebugProtocol.Response): void {
    if (this.sessionState.runtime === undefined) {
      this.sendErrorResponse(response, 1, 'No program loaded');
      return;
    }

    this.sendResponse(response);
    this.sessionState.runState.pauseRequested = false;
    this.updateBreakpointSkip();
    this.runUntilStop();
  }

  private updateBreakpointSkip(): void {
    const rs = this.sessionState.runState;
    if (
      rs.lastStopReason === 'breakpoint' &&
      this.sessionState.runtime?.getPC() === rs.lastBreakpointAddress &&
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
    void runUntilStopAsync(this.getRuntimeControlContext(), {
      limitLabel,
      ...(extraBreakpoints !== undefined ? { extraBreakpoints } : {}),
      ...(maxInstructions !== undefined ? { maxInstructions } : {}),
    });
  }

  private handleHaltStop(): void {
    if (!this.sessionState.runState.haltNotified) {
      this.sessionState.runState.haltNotified = true;
      this.sessionState.runState.lastStopReason = 'halt';
      this.sessionState.runState.lastBreakpointAddress = null;
      this.sendEvent(new StoppedEvent('halt', THREAD_ID));
      return;
    }

    this.sessionState.tec1Runtime?.silenceSpeaker();
    this.sessionState.platformRuntime?.silenceSpeaker();
    this.sendEvent(new TerminatedEvent());
  }

  private resolveUnmappedCall(): number | null {
    const { runtime, mappingIndex } = this.sessionState;
    if (runtime === undefined || mappingIndex === undefined) {
      return null;
    }
    const cpu = runtime.getRegisters();
    const memRead = runtime.hardware.memRead ?? ((addr: number): number => runtime.hardware.memory[addr & 0xffff] ?? 0);
    return getUnmappedCallReturnAddress({ cpu, memRead, mappingIndex });
  }

  private async promptForConfigCreation(): Promise<boolean> {
    const created = await vscode.commands.executeCommand<boolean>('debug80.createProject');
    return Boolean(created);
  }

  private sendEntryStopIfNeeded(): void {
    if (!this.sessionState.runState.stopOnEntry) {
      return;
    }
    this.sessionState.runState.lastStopReason = 'entry';
    this.sessionState.runState.lastBreakpointAddress = null;
    this.sendEvent(new StoppedEvent('entry', THREAD_ID));
  }
}

export class Z80DebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {
  public constructor(private readonly logger: Logger = new NullLogger()) {}

  createDebugAdapterDescriptor(
    _session: vscode.DebugSession
  ): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
    return new vscode.DebugAdapterInlineImplementation(new Z80DebugSession(this.logger));
  }
}
