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
  BreakpointEvent,
  Event as DapEvent,
} from '@vscode/debugadapter';
import { DebugProtocol } from '@vscode/debugprotocol';
import * as fs from 'fs';

import { createZ80Runtime } from '../z80/runtime';
import { StepInfo } from '../z80/types';
import {
  createSessionState,
  resetSessionState,
  StopReason,
  type SessionStateShape,
} from './session-state';
import { loadProgramArtifacts } from './program-loader';
import { BreakpointManager } from './breakpoint-manager';
import { resolveBundledTec1Rom } from './assembler';
import { buildSymbolIndex } from './symbol-service';
import { SourceManager } from './source-manager';
import { SourceStateManager } from './source-state-manager';
import { CommandRouter } from './command-router';
import { PlatformRegistry } from './platform-registry';
import { buildStackFrames } from './stack-service';
import {
  applyStepInfo,
  runUntilReturnAsync,
  runUntilStopAsync,
  RuntimeControlContext,
} from './runtime-control';
import { VariableService } from './variable-service';
import { ADDR_MASK } from '../platforms/tec-common';
import { type MatrixKeyCombo } from '../platforms/tec1g/matrix-keymap';
import { resolveAssemblerBackend } from './assembler-backend';
import { resolvePlatformProvider } from '../platforms/provider';

import { LaunchRequestArguments } from './types';
import {
  buildListingCacheKey,
  resolveBaseDir,
  resolveCacheDir,
  resolveListingSourcePath,
  resolveMappedPath,
} from './path-resolver';
import { emitConsoleOutput, emitMainSource } from './adapter-ui';
import { buildRomSourcesResponse } from './rom-requests';
import { handleTerminalInput, handleTerminalBreak } from './terminal-request';
import { handleMemorySnapshotRequest } from './memory-request';
import { handleMatrixModeRequest, handleMatrixKeyRequest } from './matrix-request';
import { getUnmappedCallReturnAddress } from './step-call-resolver';
import {
  populateFromConfig,
  resolveArtifacts,
  resolveDebugMapPath,
  resolveExtraDebugMapPath,
  resolveRelative,
  resolveAsmPath,
  normalizeSourcePath,
  relativeIfPossible,
  type LaunchArgsHelpers,
} from './launch-args';
import { getShadowAlias, isBreakpointAddress } from './debug-addressing';
import { assembleIfRequested, normalizeStepLimit } from './launch-pipeline';
import { formatLogMessage, Logger, NullLogger } from '../util/logger';

/** DAP thread identifier (single-threaded Z80) */
const THREAD_ID = 1;

function createLaunchLogger(
  baseLogger: Logger,
  sendEvent: (event: unknown) => void,
): Logger {
  const emitOutput = (message: string): void => {
    emitConsoleOutput((event) => sendEvent(event), message);
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

const LAUNCH_ARGS_HELPERS: LaunchArgsHelpers = {
  resolveBaseDir,
  resolveAsmPath,
  resolveRelative,
  resolveCacheDir,
  buildListingCacheKey,
  relativeIfPossible,
};

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

    try {
      const launchLogger = createLaunchLogger(this.logger, (event) => this.sendEvent(event as DebugProtocol.Event));
      const merged: LaunchRequestArguments = populateFromConfig(args, {
        resolveBaseDir: (requestArgs) => resolveBaseDir(requestArgs),
      });
      this.sessionState.runState.stopOnEntry = merged.stopOnEntry === true;

      if (
        (merged.asm === undefined || merged.asm === '') &&
        (merged.hex === undefined || merged.hex === '') &&
        (merged.listing === undefined || merged.listing === '')
      ) {
        const created = await this.promptForConfigCreation();
        if (created) {
          this.sendErrorResponse(
            response,
            1,
            'Debug80: Created debug80.json. Set up your default target and re-run.'
          );
          return;
        }
        this.sendErrorResponse(
          response,
          1,
          'Debug80: No asm/hex/listing provided and no debug80.json found. Add debug80.json or specify paths.'
        );
        return;
      }

      const platformProvider = resolvePlatformProvider(merged);
      const platform = platformProvider.id;
      this.platformState.active = platform;
      const simpleConfig = platformProvider.simpleConfig;
      const tec1Config = platformProvider.tec1Config;
      const tec1gConfig = platformProvider.tec1gConfig;
      this.platformRegistry.clear();
      platformProvider.registerCommands(this.platformRegistry, {
        sessionState: this.sessionState,
        sendResponse: (platformResponse) => this.sendResponse(platformResponse),
        sendErrorResponse: (platformResponse, id, message) =>
          this.sendErrorResponse(platformResponse, id, message),
        handleMatrixModeRequest: (platformArgs) =>
          handleMatrixModeRequest(this.sessionState.tec1gRuntime, this.matrixHeldKeys, platformArgs),
        handleMatrixKeyRequest: (platformArgs) =>
          handleMatrixKeyRequest(this.sessionState.tec1gRuntime, this.matrixHeldKeys, platformArgs),
        clearMatrixHeldKeys: () => {
          this.matrixHeldKeys.clear();
        },
      });
      this.sendEvent(new DapEvent('debug80/platform', platformProvider.payload));

      const baseDir = resolveBaseDir(merged);
      this.sessionState.baseDir = baseDir;
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
        sendEvent: (event) => this.sendEvent(event as DebugProtocol.Event),
      });

      if (!fs.existsSync(hexPath) || !fs.existsSync(listingPath)) {
        const created = await this.promptForConfigCreation();
        if (created) {
          this.sendErrorResponse(
            response,
            1,
            'Debug80: Created debug80.json. Re-run the launch after building artifacts.'
          );
          return;
        }
        this.sendErrorResponse(
          response,
          1,
          `Z80 artifacts not found. Expected HEX at "${hexPath}" and LST at "${listingPath}".`
        );
        return;
      }

      const { program, listingInfo, listingContent } = loadProgramArtifacts({
        platform,
        baseDir,
        hexPath,
        listingPath,
        resolveRelative: (p, dir) => resolveRelative(p, dir),
        resolveBundledTec1Rom: () => resolveBundledTec1Rom(),
        logger: launchLogger,
        ...(tec1Config ? { tec1Config } : {}),
        ...(tec1gConfig ? { tec1gConfig } : {}),
      });

      this.sessionState.listing = listingInfo;
      this.sessionState.listingPath = listingPath;
      const extraListings = platformProvider.extraListings;
      this.sourceState.setManager(
        new SourceManager({
          platform,
          baseDir,
          resolveRelative: (p, dir) => resolveRelative(p, dir),
          resolveMappedPath: (file): string | undefined =>
            resolveMappedPath(file, this.sessionState.listingPath, this.sessionState.sourceRoots),
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
          logger: launchLogger,
        })
      );

      const sourceState = this.sourceState.build({
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

      this.sessionState.sourceRoots = sourceState.sourceRoots;
      this.sessionState.extraListingPaths = sourceState.extraListingPaths;
      this.sessionState.mapping = sourceState.mapping;
      this.sessionState.mappingIndex = sourceState.mappingIndex;
      emitMainSource(
        (event) => this.sendEvent(event as DebugProtocol.Event),
        this.sourceState.file
      );
      const symbolIndex = buildSymbolIndex({
        mapping: this.sessionState.mapping,
        listingContent,
        sourceFile: this.sourceState.file,
      });
      this.sessionState.symbolAnchors = symbolIndex.anchors;
      this.sourceState.lookupAnchors = symbolIndex.lookupAnchors;
      this.sessionState.symbolList = symbolIndex.list;

      const emitDap = (name: string) => (payload: unknown) =>
        this.sendEvent(new DapEvent(name, payload));
      const platformIo = platformProvider.buildIoHandlers({
        ...(merged.terminal !== undefined ? { terminal: merged.terminal } : {}),
        onTec1Update: emitDap('debug80/tec1Update'),
        onTec1Serial: emitDap('debug80/tec1Serial'),
        onTec1gUpdate: emitDap('debug80/tec1gUpdate'),
        onTec1gSerial: emitDap('debug80/tec1gSerial'),
        onTerminalOutput: emitDap('debug80/terminalOutput'),
      });
      this.sessionState.tec1Runtime = platformIo.tec1Runtime;
      this.sessionState.tec1gRuntime = platformIo.tec1gRuntime;
      this.sessionState.terminalState = platformIo.terminalState;
      const ioHandlers = platformIo.ioHandlers;
      const runtimeOptions = platformProvider.runtimeOptions;
      const platformAssets = platformProvider.loadAssets?.({
        baseDir: this.sessionState.baseDir,
        logger: launchLogger,
        resolveRelative: (filePath, baseDir) => resolveRelative(filePath, baseDir),
      });
      const entry = platformProvider.resolveEntry(platformAssets);
      this.sessionState.loadedProgram = program;
      this.sessionState.loadedEntry = entry;
      this.sessionState.runtime = createZ80Runtime(program, entry, ioHandlers, runtimeOptions);
      if (this.sessionState.runtime !== undefined) {
        platformProvider.finalizeRuntime?.({
          runtime: this.sessionState.runtime,
          sessionState: this.sessionState,
          assets: platformAssets,
        });
      }
      this.sessionState.runState.callDepth = 0;
      this.sessionState.runState.stepOverMaxInstructions = normalizeStepLimit(
        merged.stepOverMaxInstructions,
        0
      );
      this.sessionState.runState.stepOutMaxInstructions = normalizeStepLimit(
        merged.stepOutMaxInstructions,
        0
      );
      if (this.sessionState.listing !== undefined) {
        const applied = this.breakpointManager.applyAll(
          this.sessionState.listing,
          this.sessionState.listingPath,
          this.sessionState.mappingIndex
        );
        for (const bp of applied) {
          this.sendEvent(new BreakpointEvent('changed', bp));
        }
      }

      this.sendResponse(response);

      if (this.sessionState.runState.stopOnEntry) {
        this.sessionState.runState.lastStopReason = 'entry';
        this.sessionState.runState.lastBreakpointAddress = null;
        this.sendEvent(new StoppedEvent('entry', THREAD_ID));
      }
    } catch (err) {
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
    this.sessionState.tec1Runtime?.recordCycles(result.cycles ?? 0);
    this.sessionState.tec1gRuntime?.recordCycles(result.cycles ?? 0);
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
    this.sessionState.tec1Runtime?.recordCycles(result.cycles ?? 0);
    this.sessionState.tec1gRuntime?.recordCycles(result.cycles ?? 0);
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
    this.sessionState.tec1Runtime?.silenceSpeaker();
    this.sessionState.tec1gRuntime?.silenceSpeaker();
    this.sessionState.runtime = undefined;
    this.sessionState.runState.haltNotified = false;
    this.sessionState.terminalState = undefined;
    this.sessionState.tec1Runtime = undefined;
    this.sessionState.tec1gRuntime = undefined;
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
    this.sessionState.tec1gRuntime?.silenceSpeaker();
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

  private getRuntimeControlContext(): RuntimeControlContext {
    const rs = this.sessionState.runState;
    return {
      getRuntime: () => this.sessionState.runtime,
      getTec1Runtime: () => this.sessionState.tec1Runtime,
      getTec1gRuntime: () => this.sessionState.tec1gRuntime,
      getActivePlatform: () => this.platformState.active,
      getCallDepth: (): number => rs.callDepth,
      setCallDepth: (v: number): void => { rs.callDepth = v; },
      getPauseRequested: (): boolean => rs.pauseRequested,
      setPauseRequested: (v: boolean): void => { rs.pauseRequested = v; },
      getSkipBreakpointOnce: (): number | null => rs.skipBreakpointOnce,
      setSkipBreakpointOnce: (v: number | null): void => { rs.skipBreakpointOnce = v; },
      getHaltNotified: (): boolean => rs.haltNotified,
      setHaltNotified: (v: boolean): void => { rs.haltNotified = v; },
      setLastStopReason: (reason: StopReason): void => { rs.lastStopReason = reason; },
      setLastBreakpointAddress: (addr: number | null): void => { rs.lastBreakpointAddress = addr; },
      isBreakpointAddress: (addr: number | null): boolean => this.isBreakpointAddress(addr),
      handleHaltStop: (): void => this.handleHaltStop(),
      sendEvent: (event: unknown): void => { this.sendEvent(event as DebugProtocol.Event); },
    };
  }

  private async promptForConfigCreation(): Promise<boolean> {
    const created = await vscode.commands.executeCommand<boolean>('debug80.createProject');
    return Boolean(created);
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
