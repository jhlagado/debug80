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
import * as path from 'path';
import * as crypto from 'crypto';
import { findSegmentForAddress } from '../mapping/source-map';
import { createZ80Runtime } from '../z80/runtime';
import { StepInfo } from '../z80/types';
import { Tec1gPlatformConfigNormalized } from '../platforms/types';
import { normalizeSimpleConfig } from '../platforms/simple/runtime';
import { normalizeTec1Config } from '../platforms/tec1/runtime';
import { normalizeTec1gConfig } from '../platforms/tec1g/runtime';
import { applyCartridgeMemory, createTec1gMemoryHooks } from './tec1g-memory';
import { createSessionState, resetSessionState, StopReason, type SessionStateShape } from './session-state';
import { loadProgramArtifacts } from './program-loader';
import { loadTec1gCartridgeImage, type Tec1gCartridgeImage } from './tec1g-cartridge';
import { BreakpointManager } from './breakpoint-manager';
import { buildPlatformIoHandlers } from './platform-host';
import { resolveBundledTec1Rom } from './assembler';
import { buildSymbolIndex } from './symbol-service';
import { SourceManager } from './source-manager';
import { SourceStateManager } from './source-state-manager';
import { buildStackFrames } from './stack-service';
import {
  applyStepInfo,
  runUntilReturnAsync,
  runUntilStopAsync,
  RuntimeControlContext,
} from './runtime-control';
import { VariableService } from './variable-service';
import { buildMemorySnapshotResponse } from './memory-snapshot';
import { ADDR_MASK } from '../platforms/tec-common';
import { getMatrixCombosForAscii, type MatrixKeyCombo } from '../platforms/tec1g/matrix-keymap';

// Import from extracted modules - types only for now (gradual migration)
import {
  LaunchRequestArguments,
  extractKeyCode,
} from './types';
import { resolveListingSourcePath } from './path-resolver';
import { applyTerminalBreak, applyTerminalInput } from './io-requests';
import { emitConsoleOutput, emitMainSource } from './adapter-ui';
import {
  handleKeyRequest,
  handleResetRequest,
  handleSerialRequest,
  handleSpeedRequest,
} from './platform-requests';
import { buildRomSourcesResponse } from './rom-requests';
import {
  normalizePlatformName,
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
import {
  assembleIfRequested,
  normalizeStepLimit,
  resolveExtraListings,
} from './launch-pipeline';

/** DAP thread identifier (single-threaded Z80) */
const THREAD_ID = 1;

/** Length of cache key hash */
const CACHE_KEY_LENGTH = 12;

type MatrixKeyPayload = {
  key: string;
  pressed: boolean;
  shift?: boolean;
  ctrl?: boolean;
  alt?: boolean;
};

export class Z80DebugSession extends DebugSession {
  private breakpointManager = new BreakpointManager();
  private sourceState = new SourceStateManager();
  private sessionState: SessionStateShape = createSessionState();
  private variableHandles = new Handles<'registers'>();
  private variableService = new VariableService(this.variableHandles);
  private matrixHeldKeys = new Map<string, MatrixKeyCombo[]>();
  private platformState = {
    active: 'simple',
  };

  public constructor() {
    super();
    this.setDebuggerLinesStartAt1(true);
    this.setDebuggerColumnsStartAt1(true);
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
      const merged: LaunchRequestArguments = populateFromConfig(args, {
        resolveBaseDir: (requestArgs) => this.resolveBaseDir(requestArgs),
      });
      this.sessionState.runState.stopOnEntry = merged.stopOnEntry === true;

      if (
        (merged.asm === undefined || merged.asm === '') &&
        (merged.hex === undefined || merged.hex === '') &&
        (merged.listing === undefined || merged.listing === '')
      ) {
        const created = await this.promptForConfigCreation(args);
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

      const platform = normalizePlatformName(merged);
      this.platformState.active = platform;
      const simpleConfig = platform === 'simple' ? normalizeSimpleConfig(merged.simple) : undefined;
      const tec1Config = platform === 'tec1' ? normalizeTec1Config(merged.tec1) : undefined;
      const tec1gConfig = platform === 'tec1g' ? normalizeTec1gConfig(merged.tec1g) : undefined;
      const platformPayload: {
        id: string;
        uiVisibility?: Tec1gPlatformConfigNormalized['uiVisibility'];
      } = { id: platform };
      if (platform === 'tec1g' && tec1gConfig?.uiVisibility) {
        platformPayload.uiVisibility = tec1gConfig.uiVisibility;
      }
      this.sendEvent(new DapEvent('debug80/platform', platformPayload));

      const baseDir = this.resolveBaseDir(merged);
      this.sessionState.baseDir = baseDir;
      const { hexPath, listingPath, asmPath } = resolveArtifacts(merged, baseDir, {
        resolveAsmPath: (asm, dir) => resolveAsmPath(asm, dir),
        resolveRelative: (filePath, dir) => resolveRelative(filePath, dir),
      });

      assembleIfRequested({
        args: merged,
        asmPath,
        hexPath,
        listingPath,
        platform,
        ...(simpleConfig !== undefined ? { simpleConfig } : {}),
        sendEvent: (event) => this.sendEvent(event as DebugProtocol.Event),
      });

      if (!fs.existsSync(hexPath) || !fs.existsSync(listingPath)) {
        const created = await this.promptForConfigCreation(args);
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
        log: (message: string): void => {
          emitConsoleOutput((event) => this.sendEvent(event as DebugProtocol.Event), message);
        },
        ...(tec1Config ? { tec1Config } : {}),
        ...(tec1gConfig ? { tec1gConfig } : {}),
      });

      this.sessionState.listing = listingInfo;
      this.sessionState.listingPath = listingPath;
      const extraListings = resolveExtraListings(platform, simpleConfig, tec1Config, tec1gConfig);
      this.sourceState.setManager(new SourceManager({
        platform,
        baseDir,
        resolveRelative: (p, dir) => resolveRelative(p, dir),
        resolveMappedPath: (file) => this.resolveMappedPath(file),
        relativeIfPossible: (filePath, dir) => relativeIfPossible(filePath, dir),
        resolveExtraDebugMapPath: (p) => resolveExtraDebugMapPath(p, this.getLaunchArgsHelpers()),
        resolveDebugMapPath: (args, dir, asm, listing) =>
          resolveDebugMapPath(
            args as LaunchRequestArguments,
            dir,
            asm,
            listing,
            this.getLaunchArgsHelpers()
          ),
        resolveListingSourcePath: (listing) => resolveListingSourcePath(listing),
        log: (message: string): void => {
          emitConsoleOutput((event) => this.sendEvent(event as DebugProtocol.Event), message);
        },
      }));

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
      emitMainSource((event) => this.sendEvent(event as DebugProtocol.Event), this.sourceState.file);
      const symbolIndex = buildSymbolIndex({
        mapping: this.sessionState.mapping,
        listingContent,
        sourceFile: this.sourceState.file,
      });
      this.sessionState.symbolAnchors = symbolIndex.anchors;
      this.sourceState.lookupAnchors = symbolIndex.lookupAnchors;
      this.sessionState.symbolList = symbolIndex.list;

      const platformIo = buildPlatformIoHandlers({
        platform,
        ...(merged.terminal !== undefined ? { terminal: merged.terminal } : {}),
        ...(tec1Config !== undefined ? { tec1Config } : {}),
        ...(tec1gConfig !== undefined ? { tec1gConfig } : {}),
        onTec1Update: (payload) => {
          this.sendEvent(new DapEvent('debug80/tec1Update', payload));
        },
        onTec1Serial: (payload) => {
          this.sendEvent(new DapEvent('debug80/tec1Serial', payload));
        },
        onTec1gUpdate: (payload) => {
          this.sendEvent(new DapEvent('debug80/tec1gUpdate', payload));
        },
        onTec1gSerial: (payload) => {
          this.sendEvent(new DapEvent('debug80/tec1gSerial', payload));
        },
        onTerminalOutput: (payload) => {
          this.sendEvent(new DapEvent('debug80/terminalOutput', payload));
        },
      });
      this.sessionState.tec1Runtime = platformIo.tec1Runtime;
      this.sessionState.tec1gRuntime = platformIo.tec1gRuntime;
      this.sessionState.terminalState = platformIo.terminalState;
      const ioHandlers = platformIo.ioHandlers;
      const runtimeOptions =
        (platform === 'simple' && simpleConfig) ||
        (platform === 'tec1' && tec1Config) ||
        (platform === 'tec1g' && tec1gConfig)
          ? { romRanges: (simpleConfig ?? tec1Config ?? tec1gConfig)?.romRanges ?? [] }
          : undefined;
      let tec1gCartridgeImage: Tec1gCartridgeImage | null = null;
      if (platform === 'tec1g' && tec1gConfig) {
        const cartridgeHex = tec1gConfig.cartridgeHex;
        if (cartridgeHex !== undefined && cartridgeHex !== '') {
          const cartridgePath = resolveRelative(cartridgeHex, this.sessionState.baseDir);
          if (!fs.existsSync(cartridgePath)) {
            emitConsoleOutput(
              (event) => this.sendEvent(event as DebugProtocol.Event),
              `Debug80: TEC-1G cartridge not found at "${cartridgePath}".`
            );
          } else {
            try {
              tec1gCartridgeImage = loadTec1gCartridgeImage(cartridgePath);
            } catch (err) {
              emitConsoleOutput(
                (event) => this.sendEvent(event as DebugProtocol.Event),
                `Debug80: Failed to load cartridge "${cartridgePath}": ${String(err)}`
              );
            }
          }
        }
      }
      const entry =
        platform === 'simple'
          ? simpleConfig?.entry
          : platform === 'tec1'
            ? tec1Config?.entry
            : platform === 'tec1g'
              ? (tec1gCartridgeImage?.bootEntry ?? tec1gConfig?.entry)
              : merged.entry;
      this.sessionState.loadedProgram = program;
      this.sessionState.loadedEntry = entry;
      this.sessionState.runtime = createZ80Runtime(program, entry, ioHandlers, runtimeOptions);
      const tec1gRuntime = this.sessionState.tec1gRuntime;
      if (platform === 'tec1g' && this.sessionState.runtime !== undefined && tec1gRuntime !== undefined) {
        const baseMemory = this.sessionState.runtime.hardware.memory;
        const romRanges = runtimeOptions?.romRanges ?? [];
        const hooks = createTec1gMemoryHooks(baseMemory, romRanges, tec1gRuntime.state);
        this.sessionState.runtime.hardware.memRead = hooks.memRead;
        this.sessionState.runtime.hardware.memWrite = hooks.memWrite;
        if (tec1gCartridgeImage) {
          applyCartridgeMemory(hooks.expandBanks, tec1gCartridgeImage.memory);
          tec1gRuntime.setCartridgePresent(true);
        } else {
          tec1gRuntime.setCartridgePresent(false);
        }
      }
      this.sessionState.runState.callDepth = 0;
      this.sessionState.runState.stepOverMaxInstructions = normalizeStepLimit(merged.stepOverMaxInstructions, 0);
      this.sessionState.runState.stepOutMaxInstructions = normalizeStepLimit(merged.stepOutMaxInstructions, 0);
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
      this.breakpointManager.rebuild(this.sessionState.listing, this.sessionState.listingPath, this.sessionState.mappingIndex);
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

    const unmappedReturn = this.getUnmappedCallReturnAddress();
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
      this.runUntilStop(new Set([returnAddress]), this.sessionState.runState.stepOverMaxInstructions, 'step over');
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
    if (
      this.sessionState.runState.lastStopReason === 'breakpoint' &&
      this.sessionState.runtime.getPC() === this.sessionState.runState.lastBreakpointAddress &&
      this.sessionState.runState.lastBreakpointAddress !== null &&
      this.isBreakpointAddress(this.sessionState.runState.lastBreakpointAddress)
    ) {
      this.sessionState.runState.skipBreakpointOnce = this.sessionState.runState.lastBreakpointAddress;
    } else {
      this.sessionState.runState.skipBreakpointOnce = null;
    }
    void runUntilReturnAsync(this.getRuntimeControlContext(), baseline, this.sessionState.runState.stepOutMaxInstructions);
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
      ...(this.sessionState.listingPath !== undefined ? { listingPath: this.sessionState.listingPath } : {}),
      ...(this.sessionState.mappingIndex !== undefined ? { mappingIndex: this.sessionState.mappingIndex } : {}),
      ...(this.sourceState.file !== undefined ? { sourceFile: this.sourceState.file } : {}),
      resolveMappedPath: (file) => this.resolveMappedPath(file),
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

  private resolveMappedPath(file: string): string | undefined {
    if (path.isAbsolute(file)) {
      return file;
    }
    const roots: string[] = [];
    if (this.sessionState.listingPath !== undefined) {
      roots.push(path.dirname(this.sessionState.listingPath));
    }
    roots.push(...this.sessionState.sourceRoots);

    for (const root of roots) {
      const candidate = path.resolve(root, file);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return undefined;
  }

  private collectRomSources(): Array<{ label: string; path: string; kind: 'listing' | 'source' }> {
    return this.sourceState.collectRomSources(this.sessionState.extraListingPaths);
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
      variables: this.variableService.resolveVariables(args.variablesReference, this.sessionState.runtime),
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
    this.sendResponse(response);
  }

  protected customRequest(command: string, response: DebugProtocol.Response, args: unknown): void {
    if (this.handleTerminalRequest(command, response, args)) {
      return;
    }
    if (this.handlePlatformRequest(command, response, args)) {
      return;
    }
    if (this.handleMemoryRequest(command, response, args)) {
      return;
    }
    if (this.handleRomRequest(command, response)) {
      return;
    }
    super.customRequest(command, response, args);
  }

  private handleTerminalRequest(
    command: string,
    response: DebugProtocol.Response,
    args: unknown
  ): boolean {
    if (command === 'debug80/terminalInput') {
      if (this.sessionState.terminalState === undefined) {
        this.sendErrorResponse(response, 1, 'Debug80: Terminal not configured.');
        return true;
      }
      applyTerminalInput(args, this.sessionState.terminalState);
      this.sendResponse(response);
      return true;
    }
    if (command === 'debug80/terminalBreak') {
      if (this.sessionState.terminalState === undefined) {
        this.sendErrorResponse(response, 1, 'Debug80: Terminal not configured.');
        return true;
      }
      applyTerminalBreak(this.sessionState.terminalState);
      this.sendResponse(response);
      return true;
    }
    return false;
  }

  private handlePlatformRequest(
    command: string,
    response: DebugProtocol.Response,
    args: unknown
  ): boolean {
    if (command === 'debug80/tec1Key') {
      const code = extractKeyCode(args);
      const error = handleKeyRequest(
        this.sessionState.tec1Runtime,
        code,
        () => this.sessionState.tec1gRuntime?.silenceSpeaker()
      );
      if (error !== null) {
        this.sendErrorResponse(response, 1, error);
        return true;
      }
      this.sendResponse(response);
      return true;
    }
    if (command === 'debug80/tec1gKey') {
      const code = extractKeyCode(args);
      const error = handleKeyRequest(this.sessionState.tec1gRuntime, code);
      if (error !== null) {
        this.sendErrorResponse(response, 1, error);
        return true;
      }
      this.sendResponse(response);
      return true;
    }
    if (command === 'debug80/tec1gMatrixKey') {
      const error = this.handleMatrixKeyRequest(args);
      if (error !== null) {
        this.sendErrorResponse(response, 1, error);
        return true;
      }
      this.sendResponse(response);
      return true;
    }
    if (command === 'debug80/tec1gMatrixMode') {
      const error = this.handleMatrixModeRequest(args);
      if (error !== null) {
        this.sendErrorResponse(response, 1, error);
        return true;
      }
      this.sendResponse(response);
      return true;
    }
    if (command === 'debug80/tec1Reset') {
      const error = handleResetRequest(
        this.sessionState.runtime,
        this.sessionState.loadedProgram,
        this.sessionState.loadedEntry,
        this.sessionState.tec1Runtime
      );
      if (error !== null) {
        this.sendErrorResponse(response, 1, error);
        return true;
      }
      this.sendResponse(response);
      return true;
    }
    if (command === 'debug80/tec1gReset') {
      const error = handleResetRequest(
        this.sessionState.runtime,
        this.sessionState.loadedProgram,
        this.sessionState.loadedEntry,
        this.sessionState.tec1gRuntime
      );
      if (error !== null) {
        this.sendErrorResponse(response, 1, error);
        return true;
      }
      this.matrixHeldKeys.clear();
      this.sendResponse(response);
      return true;
    }
    if (command === 'debug80/tec1Speed') {
      const error = handleSpeedRequest(this.sessionState.tec1Runtime, args);
      if (error !== null) {
        this.sendErrorResponse(response, 1, error);
        return true;
      }
      this.sendResponse(response);
      return true;
    }
    if (command === 'debug80/tec1gSpeed') {
      const error = handleSpeedRequest(this.sessionState.tec1gRuntime, args);
      if (error !== null) {
        this.sendErrorResponse(response, 1, error);
        return true;
      }
      this.sendResponse(response);
      return true;
    }
    if (command === 'debug80/tec1SerialInput') {
      const error = handleSerialRequest(this.sessionState.tec1Runtime, args);
      if (error !== null) {
        this.sendErrorResponse(response, 1, error);
        return true;
      }
      this.sendResponse(response);
      return true;
    }
    if (command === 'debug80/tec1gSerialInput') {
      const error = handleSerialRequest(this.sessionState.tec1gRuntime, args);
      if (error !== null) {
        this.sendErrorResponse(response, 1, error);
        return true;
      }
      this.sendResponse(response);
      return true;
    }
    return false;
  }

  private handleMemoryRequest(
    command: string,
    response: DebugProtocol.Response,
    args: unknown
  ): boolean {
    if (command === 'debug80/tec1MemorySnapshot') {
      if (this.sessionState.runtime === undefined) {
        this.sendErrorResponse(response, 1, 'Debug80: No program loaded.');
        return true;
      }
      const snapshot: ReturnType<typeof buildMemorySnapshotResponse> = buildMemorySnapshotResponse(args, {
        runtime: this.sessionState.runtime,
        symbolAnchors: this.sessionState.symbolAnchors,
        lookupAnchors: this.sourceState.lookupAnchors,
        symbolList: this.sessionState.symbolList,
      });
      response.body = {
        before: snapshot.before,
        rowSize: snapshot.rowSize,
        views: snapshot.views,
        symbols: snapshot.symbols,
        registers: snapshot.registers,
      };
      this.sendResponse(response);
      return true;
    }
    if (command === 'debug80/tec1gMemorySnapshot') {
      if (this.sessionState.runtime === undefined) {
        this.sendErrorResponse(response, 1, 'Debug80: No program loaded.');
        return true;
      }
      const snapshot: ReturnType<typeof buildMemorySnapshotResponse> = buildMemorySnapshotResponse(args, {
        runtime: this.sessionState.runtime,
        symbolAnchors: this.sessionState.symbolAnchors,
        lookupAnchors: this.sourceState.lookupAnchors,
        symbolList: this.sessionState.symbolList,
      });
      response.body = {
        before: snapshot.before,
        rowSize: snapshot.rowSize,
        views: snapshot.views,
        symbols: snapshot.symbols,
        registers: snapshot.registers,
      };
      this.sendResponse(response);
      return true;
    }
    return false;
  }

  private handleMatrixModeRequest(args: unknown): string | null {
    const runtime = this.sessionState.tec1gRuntime;
    if (!runtime) {
      return 'Debug80: Platform not active.';
    }
    const enabled = this.parseMatrixModeEnabled(args);
    if (enabled === undefined) {
      return 'Debug80: Missing matrix mode flag.';
    }
    runtime.setMatrixMode(enabled);
    if (!enabled) {
      this.matrixHeldKeys.clear();
    }
    return null;
  }

  private handleMatrixKeyRequest(args: unknown): string | null {
    const runtime = this.sessionState.tec1gRuntime;
    if (!runtime) {
      return 'Debug80: Platform not active.';
    }
    const payload = this.parseMatrixKeyPayload(args);
    if (!payload) {
      return 'Debug80: Missing matrix key payload.';
    }
    if (!runtime.state.matrixModeEnabled) {
      return null;
    }
    const ascii = this.resolveMatrixAscii(payload.key);
    if (ascii === undefined) {
      return null;
    }
    const combos = getMatrixCombosForAscii(ascii);
    if (combos.length === 0) {
      return null;
    }
    const keyId = this.buildMatrixKeyId(payload);
    const combo = this.selectMatrixCombo(combos, payload, runtime.state.capsLock);
    if (!combo) {
      return null;
    }
    const applied = this.expandMatrixCombo(combo);
    if (payload.pressed) {
      if (!this.matrixHeldKeys.has(keyId)) {
        this.matrixHeldKeys.set(keyId, applied);
        applied.forEach((entry) => runtime.applyMatrixKey(entry.row, entry.col, true));
      }
      return null;
    }
    const held = this.matrixHeldKeys.get(keyId) ?? applied;
    held.forEach((entry) => runtime.applyMatrixKey(entry.row, entry.col, false));
    this.matrixHeldKeys.delete(keyId);
    return null;
  }

  private parseMatrixModeEnabled(args: unknown): boolean | undefined {
    if (typeof args !== 'object' || args === null) {
      return undefined;
    }
    const candidate = (args as { enabled?: unknown }).enabled;
    return typeof candidate === 'boolean' ? candidate : undefined;
  }

  private parseMatrixKeyPayload(args: unknown): MatrixKeyPayload | null {
    if (typeof args !== 'object' || args === null) {
      return null;
    }
    const candidate = args as {
      key?: unknown;
      pressed?: unknown;
      shift?: unknown;
      ctrl?: unknown;
      alt?: unknown;
    };
    if (typeof candidate.key !== 'string' || typeof candidate.pressed !== 'boolean') {
      return null;
    }
    const payload: MatrixKeyPayload = {
      key: candidate.key,
      pressed: candidate.pressed,
    };
    if (candidate.shift === true) {
      payload.shift = true;
    }
    if (candidate.ctrl === true) {
      payload.ctrl = true;
    }
    if (candidate.alt === true) {
      payload.alt = true;
    }
    return payload;
  }

  private resolveMatrixAscii(key: string): number | undefined {
    if (key.length === 1) {
      return key.charCodeAt(0);
    }
    if (key === 'Enter') {
      return 0x0d;
    }
    if (key === 'Escape') {
      return 0x1b;
    }
    return undefined;
  }

  private buildMatrixKeyId(payload: MatrixKeyPayload): string {
    return (
      payload.key +
      '|' +
      (payload.shift === true ? '1' : '0') +
      (payload.ctrl === true ? '1' : '0') +
      (payload.alt === true ? '1' : '0')
    );
  }

  private selectMatrixCombo(
    combos: MatrixKeyCombo[],
    payload: MatrixKeyPayload,
    capsLock: boolean
  ): MatrixKeyCombo | undefined {
    const preferred =
      payload.ctrl === true ? 'ctrl' : payload.shift === true ? 'shift' : payload.alt === true ? 'fn' : undefined;
    const matchesCaps = (combo: MatrixKeyCombo): boolean =>
      combo.capsLock === undefined || combo.capsLock === capsLock;
    if (preferred !== undefined) {
      const preferredMatch = combos.find((combo) => combo.modifier === preferred && matchesCaps(combo));
      if (preferredMatch) {
        return preferredMatch;
      }
    }
    const unmodified = combos.find((combo) => combo.modifier === undefined && matchesCaps(combo));
    if (unmodified) {
      return unmodified;
    }
    const capsMatch = combos.find(matchesCaps);
    return capsMatch ?? combos[0];
  }

  private expandMatrixCombo(combo: MatrixKeyCombo): Array<{ row: number; col: number }> {
    const entries = [{ row: combo.row, col: combo.col }];
    if (combo.modifier === 'shift') {
      entries.push({ row: 0, col: 0 });
    } else if (combo.modifier === 'ctrl') {
      entries.push({ row: 0, col: 1 });
    } else if (combo.modifier === 'fn') {
      entries.push({ row: 0, col: 2 });
    }
    return entries;
  }

  private handleRomRequest(command: string, response: DebugProtocol.Response): boolean {
    if (command === 'debug80/romSources') {
      response.body = buildRomSourcesResponse(this.collectRomSources());
      this.sendResponse(response);
      return true;
    }
    return false;
  }


  private continueExecution(response: DebugProtocol.Response): void {
    if (this.sessionState.runtime === undefined) {
      this.sendErrorResponse(response, 1, 'No program loaded');
      return;
    }

    this.sendResponse(response);
    this.sessionState.runState.pauseRequested = false;
    if (
      this.sessionState.runState.lastStopReason === 'breakpoint' &&
      this.sessionState.runtime.getPC() === this.sessionState.runState.lastBreakpointAddress &&
      this.sessionState.runState.lastBreakpointAddress !== null &&
      this.isBreakpointAddress(this.sessionState.runState.lastBreakpointAddress)
    ) {
      this.sessionState.runState.skipBreakpointOnce = this.sessionState.runState.lastBreakpointAddress;
    } else {
      this.sessionState.runState.skipBreakpointOnce = null;
    }
    this.runUntilStop();
  }

  private runUntilStop(
    extraBreakpoints?: Set<number>,
    maxInstructions?: number,
    limitLabel = 'step'
  ): void {
    const options: {
      extraBreakpoints?: Set<number>;
      maxInstructions?: number;
      limitLabel?: string;
    } = { limitLabel };
    if (extraBreakpoints !== undefined) {
      options.extraBreakpoints = extraBreakpoints;
    }
    if (maxInstructions !== undefined) {
      options.maxInstructions = maxInstructions;
    }
    void runUntilStopAsync(this.getRuntimeControlContext(), options);
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

  private getUnmappedCallReturnAddress(): number | null {
    if (this.sessionState.runtime === undefined || this.sessionState.mappingIndex === undefined) {
      return null;
    }
    const cpu = this.sessionState.runtime.getRegisters();
    const memRead =
      this.sessionState.runtime.hardware.memRead ??
      ((addr: number): number => this.sessionState.runtime?.hardware.memory[addr & 0xffff] ?? 0);
    const pc = cpu.pc & 0xffff;
    const opcode = memRead(pc) & 0xff;

    const read16 = (addr: number): number => {
      const lo = memRead(addr & 0xffff) & 0xff;
      const hi = memRead((addr + 1) & 0xffff) & 0xff;
      return lo | (hi << 8);
    };

    let taken = false;
    let target: number | null = null;
    let returnAddress: number | null = null;

    switch (opcode) {
      case 0xcd: // CALL nn
        taken = true;
        target = read16(pc + 1);
        returnAddress = (pc + 3) & 0xffff;
        break;
      case 0xc4: // CALL NZ
        taken = !cpu.flags.Z;
        target = read16(pc + 1);
        returnAddress = (pc + 3) & 0xffff;
        break;
      case 0xcc: // CALL Z
        taken = !!cpu.flags.Z;
        target = read16(pc + 1);
        returnAddress = (pc + 3) & 0xffff;
        break;
      case 0xd4: // CALL NC
        taken = !cpu.flags.C;
        target = read16(pc + 1);
        returnAddress = (pc + 3) & 0xffff;
        break;
      case 0xdc: // CALL C
        taken = !!cpu.flags.C;
        target = read16(pc + 1);
        returnAddress = (pc + 3) & 0xffff;
        break;
      case 0xe4: // CALL PO
        taken = !cpu.flags.P;
        target = read16(pc + 1);
        returnAddress = (pc + 3) & 0xffff;
        break;
      case 0xec: // CALL PE
        taken = !!cpu.flags.P;
        target = read16(pc + 1);
        returnAddress = (pc + 3) & 0xffff;
        break;
      case 0xf4: // CALL P
        taken = !cpu.flags.S;
        target = read16(pc + 1);
        returnAddress = (pc + 3) & 0xffff;
        break;
      case 0xfc: // CALL M
        taken = !!cpu.flags.S;
        target = read16(pc + 1);
        returnAddress = (pc + 3) & 0xffff;
        break;
      case 0xc7:
      case 0xcf:
      case 0xd7:
      case 0xdf:
      case 0xe7:
      case 0xef:
      case 0xf7:
      case 0xff:
        taken = true;
        target = opcode & 0x38;
        returnAddress = (pc + 1) & 0xffff;
        break;
      default:
        break;
    }

    if (!taken || target === null || returnAddress === null) {
      return null;
    }

    const segment = findSegmentForAddress(this.sessionState.mappingIndex, target);
    if (segment && segment.loc.file !== null) {
      return null;
    }

    return returnAddress;
  }

  private getRuntimeControlContext(): RuntimeControlContext {
    return {
      getRuntime: () => this.sessionState.runtime,
      getTec1Runtime: () => this.sessionState.tec1Runtime,
      getTec1gRuntime: () => this.sessionState.tec1gRuntime,
      getActivePlatform: () => this.platformState.active,
      getCallDepth: () => this.sessionState.runState.callDepth,
      setCallDepth: (value: number): void => {
        this.sessionState.runState.callDepth = value;
      },
      getPauseRequested: () => this.sessionState.runState.pauseRequested,
      setPauseRequested: (value: boolean): void => {
        this.sessionState.runState.pauseRequested = value;
      },
      getSkipBreakpointOnce: () => this.sessionState.runState.skipBreakpointOnce,
      setSkipBreakpointOnce: (value: number | null): void => {
        this.sessionState.runState.skipBreakpointOnce = value;
      },
      getHaltNotified: () => this.sessionState.runState.haltNotified,
      setHaltNotified: (value: boolean): void => {
        this.sessionState.runState.haltNotified = value;
      },
      setLastStopReason: (reason: StopReason): void => {
        this.sessionState.runState.lastStopReason = reason;
      },
      setLastBreakpointAddress: (address: number | null): void => {
        this.sessionState.runState.lastBreakpointAddress = address;
      },
      isBreakpointAddress: (address: number | null): boolean =>
        this.isBreakpointAddress(address),
      handleHaltStop: (): void => this.handleHaltStop(),
      sendEvent: (event: unknown): void => {
        this.sendEvent(event as DebugProtocol.Event);
      },
    };
  }

  private async promptForConfigCreation(_args: LaunchRequestArguments): Promise<boolean> {
    const created = await vscode.commands.executeCommand<boolean>('debug80.createProject');
    return Boolean(created);
  }

  private getLaunchArgsHelpers(): LaunchArgsHelpers {
    return {
      resolveBaseDir: (args: LaunchRequestArguments) => this.resolveBaseDir(args),
      resolveAsmPath: (asm: string | undefined, baseDir: string) => resolveAsmPath(asm, baseDir),
      resolveRelative: (filePath: string, baseDir: string) => resolveRelative(filePath, baseDir),
      resolveCacheDir: (baseDir: string) => this.resolveCacheDir(baseDir),
      buildListingCacheKey: (listingPath: string) => this.buildListingCacheKey(listingPath),
      relativeIfPossible: (filePath: string, baseDir: string) =>
        relativeIfPossible(filePath, baseDir),
    };
  }

  private resolveBaseDir(args: LaunchRequestArguments): string {
    const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    // If a projectConfig is provided, use the workspace root when the config lives inside it
    // (including .vscode), otherwise fall back to the config directory.
    if (args.projectConfig !== undefined && args.projectConfig !== '') {
      const cfgPath = path.isAbsolute(args.projectConfig)
        ? args.projectConfig
        : workspace !== undefined
          ? path.join(workspace, args.projectConfig)
          : args.projectConfig;

      if (workspace !== undefined && cfgPath.startsWith(workspace)) {
        return workspace;
      }

      return path.dirname(cfgPath);
    }

    return workspace ?? process.cwd();
  }


  private resolveCacheDir(baseDir: string): string | undefined {
    if (!baseDir || baseDir.length === 0) {
      return undefined;
    }
    try {
      const stat = fs.statSync(baseDir);
      if (!stat.isDirectory()) {
        return undefined;
      }
      const cacheDir = path.resolve(baseDir, '.debug80', 'cache');
      fs.mkdirSync(cacheDir, { recursive: true });
      return cacheDir;
    } catch {
      return undefined;
    }
  }

  private buildListingCacheKey(listingPath: string): string {
    const normalized = path.resolve(listingPath);
    return crypto.createHash('sha1').update(normalized).digest('hex').slice(0, CACHE_KEY_LENGTH);
  }

}

export class Z80DebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {
  createDebugAdapterDescriptor(
    _session: vscode.DebugSession
  ): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
    return new vscode.DebugAdapterInlineImplementation(new Z80DebugSession());
  }
}
