/**
 * @fileoverview Z80 Debug Adapter implementation.
 * Provides DAP (Debug Adapter Protocol) support for Z80 assembly debugging.
 */

import * as vscode from 'vscode';
import {
  DebugSession,
  InitializedEvent,
  StoppedEvent,
  Handles,
  Event as DapEvent,
} from '@vscode/debugadapter';
import { DebugProtocol } from '@vscode/debugprotocol';

import {
  createSessionState,
  resetSessionState,
  type SessionStateShape,
} from './session-state';
import { BreakpointManager } from './breakpoint-manager';
import { SourceStateManager } from './source-state-manager';
import { CommandRouter } from './command-router';
import { PlatformRegistry } from './platform-registry';
import {
  applyLaunchBreakpoints,
  applyLaunchSessionArtifacts,
  captureEntryCpuStateIfNeeded,
  createLaunchSequenceContext,
  createRuntimeControlContext,
  RuntimeControlContext,
} from './runtime-control';
import { VariableService } from './variable-service';
import { type MatrixKeyCombo } from '../platforms/tec1g/matrix-keymap';

import { LaunchRequestArguments } from './types';
import { resolveBaseDir } from './path-resolver';
import { emitAssemblyFailed, emitConsoleOutput } from './adapter-ui';
import { AssembleFailureError } from './assembler';
import { buildRomSourcesResponse } from './rom-requests';
import { handleTerminalInput, handleTerminalBreak } from './terminal-request';
import { handleMemorySnapshotRequest } from './memory-request';
import { populateFromConfig } from './launch-args';
import {
  MissingLaunchArtifactsError,
  buildLaunchSession,
  createLaunchLogger,
  hasLaunchInputs,
  respondToMissingArtifacts,
  respondToMissingLaunchInputs,
} from './launch-sequence';
import { Logger, NullLogger } from '../util/logger';
import { AdapterRequestController } from './adapter-request-controller';
import { handleWarmRebuildRequest } from './rebuild-request';

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
  private readonly requestController: AdapterRequestController;
  private readonly getRuntimeControlContext = (): RuntimeControlContext =>
    createRuntimeControlContext({
      sessionState: this.sessionState,
      activePlatform: () => this.platformState.active,
      isBreakpointAddress: (address: number | null): boolean =>
        this.requestController.isBreakpointAddress(address),
      handleHaltStop: (): void => this.requestController.handleHaltStop(),
      sendEvent: (event: unknown): void => {
        this.sendEvent(event as DebugProtocol.Event);
      },
    });

  public constructor(logger: Logger = new NullLogger()) {
    super();
    this.logger = logger;
    this.requestController = new AdapterRequestController({
      threadId: THREAD_ID,
      breakpointManager: this.breakpointManager,
      sourceState: this.sourceState,
      sessionState: this.sessionState,
      platformState: this.platformState,
      variableService: this.variableService,
      commandRouter: this.commandRouter,
      platformRegistry: this.platformRegistry,
      sendResponse: (response: DebugProtocol.Response): void => {
        this.sendResponse(response);
      },
      sendErrorResponse: (response: DebugProtocol.Response, id: number, message: string): void => {
        this.sendErrorResponse(response, id, message);
      },
      sendEvent: (event: unknown): void => {
        this.sendEvent(event as DebugProtocol.Event);
      },
      getRuntimeControlContext: (): RuntimeControlContext => this.getRuntimeControlContext(),
    });
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
    this.commandRouter.register('debug80/rebuildWarm', (response) =>
      handleWarmRebuildRequest(response, {
        logger: this.logger,
        sessionState: this.sessionState,
        sourceState: this.sourceState,
        breakpointManager: this.breakpointManager,
        platformState: this.platformState,
        sendEvent: (event) => this.sendEvent(event),
        sendResponse: (resp) => this.sendResponse(resp),
        sendErrorResponse: (resp, id, message) => this.sendErrorResponse(resp, id, message),
      })
    );
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
    this.sessionState.launchArgs = merged;
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
      const artifacts = await buildLaunchSession(
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
      captureEntryCpuStateIfNeeded(this.getRuntimeControlContext());
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
      this.requestController.markLaunchComplete();
      this.sendResponse(response);
      this.requestController.startConfiguredExecutionIfReady();
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
      if (err instanceof AssembleFailureError) {
        const detail = err.result.error ?? 'Assembly failed';
        emitConsoleOutput((event) => this.sendEvent(event as DebugProtocol.Event), detail);
        emitAssemblyFailed((event) => this.sendEvent(event as DebugProtocol.Event), {
          ...(err.result.diagnostic !== undefined ? { diagnostic: err.result.diagnostic } : {}),
          ...(err.result.error !== undefined ? { error: err.result.error } : {}),
        });
        this.sendErrorResponse(response, 1, detail.split(/\r?\n/, 1)[0] ?? detail);
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

  protected setBreakPointsRequest(
    response: DebugProtocol.SetBreakpointsResponse,
    args: DebugProtocol.SetBreakpointsArguments
  ): void {
    this.requestController.setBreakPointsRequest(response, args);
  }

  protected configurationDoneRequest(
    response: DebugProtocol.ConfigurationDoneResponse,
    _args: DebugProtocol.ConfigurationDoneArguments
  ): void {
    this.requestController.configurationDoneRequest(response, _args);
  }

  protected threadsRequest(response: DebugProtocol.ThreadsResponse): void {
    this.requestController.threadsRequest(response);
  }

  protected continueRequest(
    response: DebugProtocol.ContinueResponse,
    _args: DebugProtocol.ContinueArguments
  ): void {
    this.requestController.continueRequest(response, _args);
  }

  protected nextRequest(
    response: DebugProtocol.NextResponse,
    _args: DebugProtocol.NextArguments
  ): void {
    this.requestController.nextRequest(response, _args);
  }

  protected stepInRequest(
    response: DebugProtocol.StepInResponse,
    _args: DebugProtocol.StepInArguments
  ): void {
    this.requestController.stepInRequest(response, _args);
  }

  protected stepOutRequest(
    response: DebugProtocol.StepOutResponse,
    _args: DebugProtocol.StepOutArguments
  ): void {
    this.requestController.stepOutRequest(response, _args);
  }

  protected pauseRequest(
    response: DebugProtocol.PauseResponse,
    _args: DebugProtocol.PauseArguments
  ): void {
    this.requestController.pauseRequest(response, _args);
  }

  protected stackTraceRequest(
    response: DebugProtocol.StackTraceResponse,
    _args: DebugProtocol.StackTraceArguments
  ): void {
    this.requestController.stackTraceRequest(response, _args);
  }

  protected scopesRequest(
    response: DebugProtocol.ScopesResponse,
    _args: DebugProtocol.ScopesArguments
  ): void {
    this.requestController.scopesRequest(response, _args);
  }

  protected variablesRequest(
    response: DebugProtocol.VariablesResponse,
    args: DebugProtocol.VariablesArguments
  ): void {
    this.requestController.variablesRequest(response, args);
  }

  protected disconnectRequest(
    response: DebugProtocol.DisconnectResponse,
    _args: DebugProtocol.DisconnectArguments
  ): void {
    this.requestController.disconnectRequest(response, _args);
  }

  protected customRequest(command: string, response: DebugProtocol.Response, args: unknown): void {
    this.requestController.customRequest(command, response, args, (cmd, resp, customArgs) =>
      super.customRequest(cmd, resp, customArgs)
    );
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
