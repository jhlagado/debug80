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
  StackFrame,
  Scope,
  Source,
  Handles,
  BreakpointEvent,
  OutputEvent,
  Event as DapEvent,
} from '@vscode/debugadapter';
import { DebugProtocol } from '@vscode/debugprotocol';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { ListingInfo, HexProgram } from '../z80/loaders';
import { MappingParseResult, SourceMapAnchor } from '../mapping/parser';
import { findAnchorLine, findSegmentForAddress, SourceMapIndex } from '../mapping/source-map';
import { createZ80Runtime, Z80Runtime } from '../z80/runtime';
import { StepInfo } from '../z80/types';
import {
  SimplePlatformConfigNormalized,
  Tec1PlatformConfigNormalized,
  Tec1gPlatformConfigNormalized,
} from '../platforms/types';
import { normalizeSimpleConfig } from '../platforms/simple/runtime';
import { normalizeTec1Config, Tec1Runtime } from '../platforms/tec1/runtime';
import { normalizeTec1gConfig, Tec1gRuntime } from '../platforms/tec1g/runtime';
import { ensureTec1gShadowRom } from './tec1g-shadow';
import { resetSessionState, StopReason } from './session-state';
import type { SessionStateShape } from './session-state';
import { loadProgramArtifacts } from './program-loader';
import type { PlatformKind } from './program-loader';
import { buildMappingFromListing } from './mapping-service';
import { BreakpointManager } from './breakpoint-manager';
import { buildPlatformIoHandlers } from './platform-host';
import { resolveBundledTec1Rom, runAssembler, runAssemblerBin } from './assembler';
import { buildSymbolIndex, findNearestSymbol } from './symbol-service';
import {
  BYTE_MASK,
  ADDR_MASK,
  TEC1G_SHADOW_START,
  TEC1G_SHADOW_END,
  TEC1G_SHADOW_SIZE,
  TEC1G_EXPAND_START,
  TEC1G_EXPAND_END,
  TEC1G_EXPAND_SIZE,
  TEC1G_PROTECT_START,
  TEC1G_PROTECT_END,
  KEY_RESET,
} from '../platforms/tec-common';

// Import from extracted modules - types only for now (gradual migration)
import {
  LaunchRequestArguments,
  TerminalState,
  extractTerminalText,
  extractKeyCode,
  extractSpeedMode,
  extractSerialText,
  extractMemorySnapshotPayload,
  extractViewEntry,
} from './types';
import { resolveListingSourcePath } from './path-resolver';
import { isPathWithin } from './path-utils';

/** DAP thread identifier (single-threaded Z80) */
const THREAD_ID = 1;

/** Length of cache key hash */
const CACHE_KEY_LENGTH = 12;

export class Z80DebugSession extends DebugSession {
  private runtime: Z80Runtime | undefined;
  private listing: ListingInfo | undefined;
  private listingPath: string | undefined;
  private mapping: MappingParseResult | undefined;
  private mappingIndex: SourceMapIndex | undefined;
  private symbolAnchors: SourceMapAnchor[] = [];
  private symbolLookupAnchors: SourceMapAnchor[] = [];
  private symbolList: Array<{ name: string; address: number }> = [];
  private breakpointManager = new BreakpointManager();
  private sourceRoots: string[] = [];
  private baseDir = process.cwd();
  private sourceFile = '';
  private stopOnEntry = false;
  private haltNotified = false;
  private lastStopReason: StopReason | undefined;
  private lastBreakpointAddress: number | null = null;
  private skipBreakpointOnce: number | null = null;
  private callDepth = 0;
  private stepOverMaxInstructions = 0;
  private stepOutMaxInstructions = 0;
  private pauseRequested = false;
  private variableHandles = new Handles<'registers'>();
  private terminalState: TerminalState | undefined;
  private tec1Runtime: Tec1Runtime | undefined;
  private tec1gRuntime: Tec1gRuntime | undefined;
  private activePlatform = 'simple';
  private loadedProgram: HexProgram | undefined;
  private loadedEntry: number | undefined;
  private extraListingPaths: string[] = [];

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
    resetSessionState(this as unknown as SessionStateShape);
    this.breakpointManager.reset();

    try {
      const merged = this.populateFromConfig(args);
      this.stopOnEntry = merged.stopOnEntry === true;

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

      const platform = this.normalizePlatformName(merged);
      this.activePlatform = platform;
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
      this.baseDir = baseDir;
      const { hexPath, listingPath, asmPath } = this.resolveArtifacts(merged, baseDir);

      this.assembleIfRequested(merged, asmPath, hexPath, listingPath, platform, simpleConfig);

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
        resolveRelative: (p, dir) => this.resolveRelative(p, dir),
        resolveBundledTec1Rom: () => resolveBundledTec1Rom(),
        log: (message) => {
          this.sendEvent(new OutputEvent(`${message}\n`, 'console'));
        },
        ...(tec1Config ? { tec1Config } : {}),
        ...(tec1gConfig ? { tec1gConfig } : {}),
      });

      this.listing = listingInfo;
      this.listingPath = listingPath;
      const mergedSourceFile = merged.sourceFile;
      const sourcePath =
        asmPath ??
        (mergedSourceFile !== undefined && mergedSourceFile.length > 0
          ? this.resolveRelative(mergedSourceFile, baseDir)
          : undefined);
      this.sourceFile = sourcePath ?? listingPath;
      this.sendEvent(
        new DapEvent('debug80/mainSource', {
          path: this.sourceFile,
        })
      );
      this.sourceRoots = this.resolveSourceRoots(merged, baseDir);
      const extraListings = this.resolveExtraListings(
        platform,
        simpleConfig,
        tec1Config,
        tec1gConfig
      );
      const extraListingPaths = this.resolveExtraListingPaths(extraListings, baseDir, listingPath);
      this.extraListingPaths = extraListingPaths;
      this.extendSourceRoots(extraListingPaths);

      const mappingResult = buildMappingFromListing({
        listingContent,
        listingPath,
        ...(asmPath !== undefined && asmPath.length > 0 ? { asmPath } : {}),
        ...(merged.sourceFile !== undefined && merged.sourceFile.length > 0
          ? { sourceFile: merged.sourceFile }
          : {}),
        extraListingPaths,
        mapArgs: {
          ...(merged.artifactBase !== undefined && merged.artifactBase.length > 0
            ? { artifactBase: merged.artifactBase }
            : {}),
          ...(merged.outputDir !== undefined && merged.outputDir.length > 0
            ? { outputDir: merged.outputDir }
            : {}),
        },
        service: {
          platform,
          baseDir,
          resolveMappedPath: (file) => this.resolveMappedPath(file),
          relativeIfPossible: (filePath, dir) => this.relativeIfPossible(filePath, dir),
          resolveExtraDebugMapPath: (p) => this.resolveExtraDebugMapPath(p),
          resolveDebugMapPath: (args, dir, asm, listing) =>
            this.resolveDebugMapPath(args as LaunchRequestArguments, dir, asm, listing),
          log: (message) => {
            this.sendEvent(new OutputEvent(`${message}\n`, 'console'));
          },
        },
      });

      this.mapping = mappingResult.mapping;
      this.mappingIndex = mappingResult.index;
      const symbolIndex = buildSymbolIndex({
        mapping: this.mapping,
        listingContent,
        sourceFile: this.sourceFile,
      });
      this.symbolAnchors = symbolIndex.anchors;
      this.symbolLookupAnchors = symbolIndex.lookupAnchors;
      this.symbolList = symbolIndex.list;

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
      this.tec1Runtime = platformIo.tec1Runtime;
      this.tec1gRuntime = platformIo.tec1gRuntime;
      this.terminalState = platformIo.terminalState;
      const ioHandlers = platformIo.ioHandlers;
      const runtimeOptions =
        (platform === 'simple' && simpleConfig) ||
        (platform === 'tec1' && tec1Config) ||
        (platform === 'tec1g' && tec1gConfig)
          ? { romRanges: (simpleConfig ?? tec1Config ?? tec1gConfig)?.romRanges ?? [] }
          : undefined;
      const entry =
        platform === 'simple'
          ? simpleConfig?.entry
          : platform === 'tec1'
            ? tec1Config?.entry
            : platform === 'tec1g'
              ? tec1gConfig?.entry
              : merged.entry;
      this.loadedProgram = program;
      this.loadedEntry = entry;
      this.runtime = createZ80Runtime(program, entry, ioHandlers, runtimeOptions);
      const tec1gRuntime = this.tec1gRuntime;
      if (platform === 'tec1g' && this.runtime !== undefined && tec1gRuntime !== undefined) {
        const baseMemory = this.runtime.hardware.memory;
        const expandBank = new Uint8Array(TEC1G_EXPAND_SIZE);
        const romRanges = runtimeOptions?.romRanges ?? [];
        const shadowInfo = ensureTec1gShadowRom(baseMemory, romRanges);
        const isRomAddress = (addr: number): boolean =>
          romRanges.some((range) => addr >= range.start && addr <= range.end) ||
          (shadowInfo.shadowCopied && addr >= TEC1G_SHADOW_START && addr <= TEC1G_SHADOW_END);
        this.runtime.hardware.memRead = (addr: number): number => {
          const masked = addr & ADDR_MASK;
          const shadowEnabled = tec1gRuntime.state.shadowEnabled === true;
          if (shadowEnabled && masked < TEC1G_SHADOW_SIZE) {
            const shadowAddr = TEC1G_SHADOW_START + masked;
            return baseMemory[shadowAddr] ?? 0;
          }
          if (masked >= TEC1G_EXPAND_START && masked <= TEC1G_EXPAND_END) {
            const expandEnabled = tec1gRuntime.state.expandEnabled === true;
            if (expandEnabled) {
              return expandBank[masked - TEC1G_EXPAND_START] ?? 0;
            }
          }
          return baseMemory[masked] ?? 0;
        };
        this.runtime.hardware.memWrite = (addr: number, value: number): void => {
          const masked = addr & ADDR_MASK;
          if (masked >= TEC1G_SHADOW_SIZE && isRomAddress(masked)) {
            return;
          }
          const protectEnabled = tec1gRuntime.state.protectEnabled === true;
          if (protectEnabled && masked >= TEC1G_PROTECT_START && masked <= TEC1G_PROTECT_END) {
            return;
          }
          if (masked >= TEC1G_EXPAND_START && masked <= TEC1G_EXPAND_END) {
            const expandEnabled = tec1gRuntime.state.expandEnabled === true;
            if (expandEnabled) {
              expandBank[masked - TEC1G_EXPAND_START] = value & BYTE_MASK;
              return;
            }
          }
          baseMemory[masked] = value & BYTE_MASK;
        };
      }
      this.callDepth = 0;
      this.stepOverMaxInstructions = this.normalizeStepLimit(merged.stepOverMaxInstructions, 0);
      this.stepOutMaxInstructions = this.normalizeStepLimit(merged.stepOutMaxInstructions, 0);
      if (this.listing !== undefined) {
        const applied = this.breakpointManager.applyAll(
          this.listing,
          this.listingPath,
          this.mappingIndex
        );
        for (const bp of applied) {
          this.sendEvent(new BreakpointEvent('changed', bp));
        }
      }

      this.sendResponse(response);

      if (this.stopOnEntry) {
        this.lastStopReason = 'entry';
        this.lastBreakpointAddress = null;
        this.sendEvent(new StoppedEvent('entry', THREAD_ID));
      }
    } catch (err) {
      const detail = `Failed to load program: ${String(err)}`;
      this.sendEvent(new OutputEvent(`${detail}\n`, 'console'));
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
        : this.normalizeSourcePath(sourcePath);

    if (normalized !== undefined) {
      this.breakpointManager.setPending(normalized, breakpoints);
    }

    const verified =
      this.listing !== undefined && normalized !== undefined
        ? this.breakpointManager.applyForSource(
            this.listing,
            this.listingPath,
            this.mappingIndex,
            normalized,
            breakpoints
          )
        : breakpoints.map((bp) => ({ line: bp.line, verified: false }));

    if (this.listing !== undefined) {
      this.breakpointManager.rebuild(this.listing, this.listingPath, this.mappingIndex);
    }

    response.body = { breakpoints: verified };
    this.sendResponse(response);
  }

  protected configurationDoneRequest(
    response: DebugProtocol.ConfigurationDoneResponse,
    _args: DebugProtocol.ConfigurationDoneArguments
  ): void {
    this.sendResponse(response);

    if (!this.stopOnEntry) {
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
    if (this.runtime === undefined) {
      this.sendErrorResponse(response, 1, 'No program loaded');
      return;
    }

    const trace: StepInfo = { taken: false };
    const result = this.runtime.step({ trace });
    this.applyStepInfo(trace);
    this.tec1Runtime?.recordCycles(result.cycles ?? 0);
    this.tec1gRuntime?.recordCycles(result.cycles ?? 0);
    this.pauseRequested = false;
    this.sendResponse(response);

    if (result.halted) {
      this.handleHaltStop();
    } else {
      if (trace.kind && trace.taken && trace.returnAddress !== undefined) {
        this.haltNotified = false;
        this.lastStopReason = 'step';
        this.lastBreakpointAddress = null;
        this.runUntilStop(
          new Set([trace.returnAddress]),
          this.stepOverMaxInstructions,
          'step over'
        );
        return;
      }
      this.haltNotified = false;
      this.lastStopReason = 'step';
      this.lastBreakpointAddress = null;
      this.sendEvent(new StoppedEvent('step', THREAD_ID));
    }
  }

  protected stepInRequest(
    response: DebugProtocol.StepInResponse,
    _args: DebugProtocol.StepInArguments
  ): void {
    if (this.runtime === undefined) {
      this.sendErrorResponse(response, 1, 'No program loaded');
      return;
    }

    const unmappedReturn = this.getUnmappedCallReturnAddress();
    const trace: StepInfo = { taken: false };
    const result = this.runtime.step({ trace });
    this.applyStepInfo(trace);
    this.tec1Runtime?.recordCycles(result.cycles ?? 0);
    this.tec1gRuntime?.recordCycles(result.cycles ?? 0);
    this.pauseRequested = false;
    this.sendResponse(response);

    if (unmappedReturn !== null && trace.kind && trace.taken) {
      const returnAddress = trace.returnAddress ?? unmappedReturn;
      this.haltNotified = false;
      this.lastStopReason = 'step';
      this.lastBreakpointAddress = null;
      this.runUntilStop(new Set([returnAddress]), this.stepOverMaxInstructions, 'step over');
      return;
    }

    if (result.halted) {
      this.handleHaltStop();
    } else {
      this.haltNotified = false;
      this.lastStopReason = 'step';
      this.lastBreakpointAddress = null;
      this.sendEvent(new StoppedEvent('step', THREAD_ID));
    }
  }

  protected stepOutRequest(
    response: DebugProtocol.StepOutResponse,
    _args: DebugProtocol.StepOutArguments
  ): void {
    if (this.runtime === undefined) {
      this.sendErrorResponse(response, 1, 'No program loaded');
      return;
    }
    const baseline = this.callDepth;
    this.sendResponse(response);
    this.pauseRequested = false;
    if (
      this.lastStopReason === 'breakpoint' &&
      this.runtime.getPC() === this.lastBreakpointAddress &&
      this.lastBreakpointAddress !== null &&
      this.isBreakpointAddress(this.lastBreakpointAddress)
    ) {
      this.skipBreakpointOnce = this.lastBreakpointAddress;
    } else {
      this.skipBreakpointOnce = null;
    }
    void this.runUntilReturnAsync(baseline);
  }

  protected pauseRequest(
    response: DebugProtocol.PauseResponse,
    _args: DebugProtocol.PauseArguments
  ): void {
    this.pauseRequested = true;
    this.sendResponse(response);
  }

  protected stackTraceRequest(
    response: DebugProtocol.StackTraceResponse,
    _args: DebugProtocol.StackTraceArguments
  ): void {
    if (this.runtime === undefined) {
      response.body = { stackFrames: [], totalFrames: 0 };
      this.sendResponse(response);
      return;
    }

    const resolved = this.resolveSourceForAddress(this.runtime.getPC());
    const source = new Source(path.basename(resolved.path), resolved.path);

    response.body = {
      stackFrames: [new StackFrame(0, 'main', source, resolved.line)],
      totalFrames: 1,
    };

    this.sendResponse(response);
  }

  private resolveSourceForAddress(address: number): { path: string; line: number } {
    const listingPath = this.listingPath;
    const listingLine = this.listing?.addressToLine.get(address) ?? 1;
    const sourcePath = this.sourceFile ?? listingPath ?? '';
    const fallbackLine = listingPath !== undefined && sourcePath === listingPath ? listingLine : 1;
    const fallback = { path: sourcePath, line: fallbackLine };

    const resolved = this.resolveSourceForAddressInternal(address);
    if (resolved) {
      return resolved;
    }

    const aliases = this.getDebugAddressAliases(address);
    for (const alias of aliases) {
      if (alias === address) {
        continue;
      }
      const resolvedAlias = this.resolveSourceForAddressInternal(alias);
      if (resolvedAlias) {
        return resolvedAlias;
      }
    }

    return fallback;
  }

  private resolveSourceForAddressInternal(address: number): { path: string; line: number } | null {
    const index = this.mappingIndex;
    if (!index) {
      return null;
    }
    const segment = findSegmentForAddress(index, address);
    if (segment === undefined || segment.loc.file === null) {
      return null;
    }

    const resolvedPath = this.resolveMappedPath(segment.loc.file);
    if (resolvedPath === undefined || resolvedPath.length === 0) {
      return null;
    }

    if (segment.loc.line !== null) {
      return { path: resolvedPath, line: segment.loc.line };
    }

    const anchorLine = findAnchorLine(index, resolvedPath, address);
    if (anchorLine !== null) {
      return { path: resolvedPath, line: anchorLine };
    }

    return null;
  }

  private getDebugAddressAliases(address: number): number[] {
    const masked = address & ADDR_MASK;
    const aliases = [masked];
    const shadowAlias = this.getShadowAlias(masked);
    if (shadowAlias !== null && shadowAlias !== masked) {
      aliases.push(shadowAlias);
    }
    return aliases;
  }

  private getShadowAlias(address: number): number | null {
    if (this.activePlatform !== 'tec1g') {
      return null;
    }
    const runtime = this.tec1gRuntime;
    if (!runtime || runtime.state.shadowEnabled !== true) {
      return null;
    }
    if (address < TEC1G_SHADOW_SIZE) {
      return (TEC1G_SHADOW_START + address) & ADDR_MASK;
    }
    return null;
  }

  private isBreakpointAddress(address: number | null): boolean {
    if (address === null) {
      return false;
    }
    if (this.breakpointManager.hasAddress(address)) {
      return true;
    }
    const shadowAlias = this.getShadowAlias(address);
    return shadowAlias !== null && this.breakpointManager.hasAddress(shadowAlias);
  }

  private resolveMappedPath(file: string): string | undefined {
    if (path.isAbsolute(file)) {
      return file;
    }
    const roots: string[] = [];
    if (this.listingPath !== undefined) {
      roots.push(path.dirname(this.listingPath));
    }
    roots.push(...this.sourceRoots);

    for (const root of roots) {
      const candidate = path.resolve(root, file);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }

    return undefined;
  }

  private resolveExtraListings(
    platform: string,
    simpleConfig?: SimplePlatformConfigNormalized,
    tec1Config?: Tec1PlatformConfigNormalized,
    tec1gConfig?: Tec1gPlatformConfigNormalized
  ): string[] {
    if (platform === 'simple') {
      return simpleConfig?.extraListings ?? [];
    }
    if (platform === 'tec1') {
      return tec1Config?.extraListings ?? [];
    }
    if (platform === 'tec1g') {
      return tec1gConfig?.extraListings ?? [];
    }
    return [];
  }

  private resolveExtraListingPaths(
    extraListings: string[],
    baseDir: string,
    primaryListingPath: string
  ): string[] {
    if (!Array.isArray(extraListings) || extraListings.length === 0) {
      return [];
    }
    const resolved: string[] = [];
    const seen = new Set<string>();
    const primary = path.resolve(primaryListingPath);
    for (const entry of extraListings) {
      if (typeof entry !== 'string') {
        continue;
      }
      const trimmed = entry.trim();
      if (trimmed === '') {
        continue;
      }
      const abs = this.resolveRelative(trimmed, baseDir);
      const normalized = path.resolve(abs);
      if (normalized === primary || seen.has(normalized)) {
        continue;
      }
      if (!fs.existsSync(normalized)) {
        const prefix = `Debug80 [${this.activePlatform}]`;
        this.sendEvent(
          new OutputEvent(`${prefix}: extra listing not found at "${normalized}".\n`, 'console')
        );
        continue;
      }
      resolved.push(normalized);
      seen.add(normalized);
    }
    return resolved;
  }

  private extendSourceRoots(listingPaths: string[]): void {
    if (listingPaths.length === 0) {
      return;
    }
    const roots = new Set(this.sourceRoots.map((root) => path.resolve(root)));
    for (const listingPath of listingPaths) {
      const root = path.resolve(path.dirname(listingPath));
      if (!roots.has(root)) {
        this.sourceRoots.push(root);
        roots.add(root);
      }
    }
  }

  private collectRomSources(): Array<{ label: string; path: string; kind: 'listing' | 'source' }> {
    const seen = new Set<string>();
    return this.extraListingPaths.flatMap((listingPath) => {
      const entries: Array<{ label: string; path: string; kind: 'listing' | 'source' }> = [];
      const pushUnique = (entryPath: string, kind: 'listing' | 'source'): void => {
        if (seen.has(entryPath)) {
          return;
        }
        entries.push({ label: path.basename(entryPath), path: entryPath, kind });
        seen.add(entryPath);
      };

      pushUnique(listingPath, 'listing');
      const sourcePath = resolveListingSourcePath(listingPath);
      if (typeof sourcePath === 'string' && sourcePath.length > 0) {
        pushUnique(sourcePath, 'source');
      }
      return entries;
    });
  }

  protected scopesRequest(
    response: DebugProtocol.ScopesResponse,
    _args: DebugProtocol.ScopesArguments
  ): void {
    const registersRef = this.variableHandles.create('registers');
    response.body = {
      scopes: [new Scope('Registers', registersRef, false)],
    };
    this.sendResponse(response);
  }

  protected variablesRequest(
    response: DebugProtocol.VariablesResponse,
    args: DebugProtocol.VariablesArguments
  ): void {
    const scopeType = this.variableHandles.get(args.variablesReference);

    if (scopeType === 'registers' && this.runtime !== undefined) {
      const regs = this.runtime.getRegisters();
      const flagByte =
        (regs.flags.S << 7) |
        (regs.flags.Z << 6) |
        (regs.flags.Y << 5) |
        (regs.flags.H << 4) |
        (regs.flags.X << 3) |
        (regs.flags.P << 2) |
        (regs.flags.N << 1) |
        regs.flags.C;
      const flagBytePrime =
        (regs.flags_prime.S << 7) |
        (regs.flags_prime.Z << 6) |
        (regs.flags_prime.Y << 5) |
        (regs.flags_prime.H << 4) |
        (regs.flags_prime.X << 3) |
        (regs.flags_prime.P << 2) |
        (regs.flags_prime.N << 1) |
        regs.flags_prime.C;

      const fmt16 = (v: number): string => `0x${v.toString(16).padStart(4, '0')}`;
      const fmt8 = (v: number): string => `0x${v.toString(16).padStart(2, '0')}`;
      const flagsStr = (f: {
        S: number;
        Z: number;
        Y: number;
        H: number;
        X: number;
        P: number;
        N: number;
        C: number;
      }): string => {
        const letters: [keyof typeof f, string][] = [
          ['S', 's'],
          ['Z', 'z'],
          ['Y', 'y'],
          ['H', 'h'],
          ['X', 'x'],
          ['P', 'p'],
          ['N', 'n'],
          ['C', 'c'],
        ];
        return letters.map(([k, ch]) => (f[k] ? ch.toUpperCase() : ch)).join('');
      };

      const af = ((regs.a & 0xff) << 8) | (flagByte & 0xff);
      const bc = ((regs.b & 0xff) << 8) | (regs.c & 0xff);
      const de = ((regs.d & 0xff) << 8) | (regs.e & 0xff);
      const hl = ((regs.h & 0xff) << 8) | (regs.l & 0xff);
      const afp = ((regs.a_prime & 0xff) << 8) | (flagBytePrime & 0xff);
      const bcp = ((regs.b_prime & 0xff) << 8) | (regs.c_prime & 0xff);
      const dep = ((regs.d_prime & 0xff) << 8) | (regs.e_prime & 0xff);
      const hlp = ((regs.h_prime & 0xff) << 8) | (regs.l_prime & 0xff);

      response.body = {
        variables: [
          { name: 'Flags', value: flagsStr(regs.flags), variablesReference: 0 },
          { name: 'PC', value: fmt16(this.runtime.getPC()), variablesReference: 0 },
          { name: 'SP', value: fmt16(regs.sp), variablesReference: 0 },

          { name: 'AF', value: fmt16(af), variablesReference: 0 },
          { name: 'BC', value: fmt16(bc), variablesReference: 0 },
          { name: 'DE', value: fmt16(de), variablesReference: 0 },
          { name: 'HL', value: fmt16(hl), variablesReference: 0 },

          { name: "AF'", value: fmt16(afp), variablesReference: 0 },
          { name: "BC'", value: fmt16(bcp), variablesReference: 0 },
          { name: "DE'", value: fmt16(dep), variablesReference: 0 },
          { name: "HL'", value: fmt16(hlp), variablesReference: 0 },

          { name: 'IX', value: fmt16(regs.ix), variablesReference: 0 },
          { name: 'IY', value: fmt16(regs.iy), variablesReference: 0 },

          { name: 'I', value: fmt8(regs.i), variablesReference: 0 },
          { name: 'R', value: fmt8(regs.r), variablesReference: 0 },
        ],
      };
    } else {
      response.body = { variables: [] };
    }

    this.sendResponse(response);
  }

  protected disconnectRequest(
    response: DebugProtocol.DisconnectResponse,
    _args: DebugProtocol.DisconnectArguments
  ): void {
    this.tec1Runtime?.silenceSpeaker();
    this.tec1gRuntime?.silenceSpeaker();
    this.runtime = undefined;
    this.haltNotified = false;
    this.terminalState = undefined;
    this.tec1Runtime = undefined;
    this.tec1gRuntime = undefined;
    this.loadedProgram = undefined;
    this.loadedEntry = undefined;
    this.sendResponse(response);
  }

  protected customRequest(command: string, response: DebugProtocol.Response, args: unknown): void {
    if (command === 'debug80/terminalInput') {
      if (this.terminalState === undefined) {
        this.sendErrorResponse(response, 1, 'Debug80: Terminal not configured.');
        return;
      }
      const textValue = extractTerminalText(args);
      const bytes = Array.from(textValue, (ch) => ch.charCodeAt(0) & 0xff);
      this.terminalState.input.push(...bytes);
      this.sendResponse(response);
      return;
    }
    if (command === 'debug80/terminalBreak') {
      if (this.terminalState === undefined) {
        this.sendErrorResponse(response, 1, 'Debug80: Terminal not configured.');
        return;
      }
      this.terminalState.breakRequested = true;
      this.sendResponse(response);
      return;
    }
    if (command === 'debug80/tec1Key') {
      if (this.tec1Runtime === undefined) {
        this.sendErrorResponse(response, 1, 'Debug80: TEC-1 platform not active.');
        return;
      }
      const code = extractKeyCode(args);
      if (code === undefined) {
        this.sendErrorResponse(response, 1, 'Debug80: Missing key code.');
        return;
      }
      if (code === KEY_RESET) {
        this.tec1Runtime.silenceSpeaker();
        this.tec1gRuntime?.silenceSpeaker();
      }
      this.tec1Runtime.applyKey(code);
      this.sendResponse(response);
      return;
    }
    if (command === 'debug80/tec1gKey') {
      if (this.tec1gRuntime === undefined) {
        this.sendErrorResponse(response, 1, 'Debug80: TEC-1G platform not active.');
        return;
      }
      const code = extractKeyCode(args);
      if (code === undefined) {
        this.sendErrorResponse(response, 1, 'Debug80: Missing key code.');
        return;
      }
      if (code === KEY_RESET) {
        this.tec1gRuntime.silenceSpeaker();
      }
      this.tec1gRuntime.applyKey(code);
      this.sendResponse(response);
      return;
    }
    if (command === 'debug80/tec1Reset') {
      if (this.runtime === undefined || this.loadedProgram === undefined) {
        this.sendErrorResponse(response, 1, 'Debug80: No program loaded.');
        return;
      }
      this.runtime.reset(this.loadedProgram, this.loadedEntry);
      this.tec1Runtime?.resetState();
      this.sendResponse(response);
      return;
    }
    if (command === 'debug80/tec1gReset') {
      if (this.runtime === undefined || this.loadedProgram === undefined) {
        this.sendErrorResponse(response, 1, 'Debug80: No program loaded.');
        return;
      }
      this.runtime.reset(this.loadedProgram, this.loadedEntry);
      this.tec1gRuntime?.resetState();
      this.sendResponse(response);
      return;
    }
    if (command === 'debug80/tec1Speed') {
      if (this.tec1Runtime === undefined) {
        this.sendErrorResponse(response, 1, 'Debug80: TEC-1 platform not active.');
        return;
      }
      const mode = extractSpeedMode(args);
      if (mode === undefined) {
        this.sendErrorResponse(response, 1, 'Debug80: Missing speed mode.');
        return;
      }
      this.tec1Runtime.setSpeed(mode);
      this.sendResponse(response);
      return;
    }
    if (command === 'debug80/tec1gSpeed') {
      if (this.tec1gRuntime === undefined) {
        this.sendErrorResponse(response, 1, 'Debug80: TEC-1G platform not active.');
        return;
      }
      const mode = extractSpeedMode(args);
      if (mode === undefined) {
        this.sendErrorResponse(response, 1, 'Debug80: Missing speed mode.');
        return;
      }
      this.tec1gRuntime.setSpeed(mode);
      this.sendResponse(response);
      return;
    }
    if (command === 'debug80/tec1SerialInput') {
      if (this.tec1Runtime === undefined) {
        this.sendErrorResponse(response, 1, 'Debug80: TEC-1 platform not active.');
        return;
      }
      const textValue = extractSerialText(args);
      const bytes = Array.from(textValue, (ch) => ch.charCodeAt(0) & 0xff);
      this.tec1Runtime.queueSerial(bytes);
      this.sendResponse(response);
      return;
    }
    if (command === 'debug80/tec1gSerialInput') {
      if (this.tec1gRuntime === undefined) {
        this.sendErrorResponse(response, 1, 'Debug80: TEC-1G platform not active.');
        return;
      }
      const textValue = extractSerialText(args);
      const bytes = Array.from(textValue, (ch) => ch.charCodeAt(0) & 0xff);
      this.tec1gRuntime.queueSerial(bytes);
      this.sendResponse(response);
      return;
    }
    if (command === 'debug80/tec1MemorySnapshot') {
      if (this.runtime === undefined) {
        this.sendErrorResponse(response, 1, 'Debug80: No program loaded.');
        return;
      }
      const payload = extractMemorySnapshotPayload(args);
      const before = this.clampMemoryWindow(payload.before, 16);
      const rowSize = payload.rowSize === 8 ? 8 : 16;
      const regs = this.runtime.getRegisters();
      const pc = regs.pc & 0xffff;
      const sp = regs.sp & 0xffff;
      const bc = ((regs.b & 0xff) << 8) | (regs.c & 0xff);
      const de = ((regs.d & 0xff) << 8) | (regs.e & 0xff);
      const hl = ((regs.h & 0xff) << 8) | (regs.l & 0xff);
      const ix = regs.ix & 0xffff;
      const iy = regs.iy & 0xffff;
      const memRead =
        this.runtime.hardware.memRead ??
        ((addr: number): number => this.runtime?.hardware.memory[addr & 0xffff] ?? 0);
      const pickAddress = (viewValue: string, addressValue: number | null): number => {
        switch (viewValue) {
          case 'pc':
            return pc;
          case 'sp':
            return sp;
          case 'bc':
            return bc;
          case 'de':
            return de;
          case 'hl':
            return hl;
          case 'ix':
            return ix;
          case 'iy':
            return iy;
          case 'absolute':
            return addressValue ?? hl;
          default:
            return hl;
        }
      };
      const viewRequests = payload.views ?? [];
      const views = viewRequests.map((entry) => {
        const {
          id,
          view: viewValue,
          after: afterValue,
          address: addressValue,
        } = extractViewEntry(entry, this.clampMemoryWindow.bind(this));
        const target = pickAddress(viewValue, addressValue);
        const window = this.readMemoryWindow(target, before, afterValue, rowSize, memRead);
        const nearest = findNearestSymbol(target, {
          anchors: this.symbolAnchors,
          lookupAnchors: this.symbolLookupAnchors,
        });
        return {
          id,
          view: viewValue,
          address: target,
          start: window.start,
          bytes: window.bytes,
          focus: window.focus,
          after: afterValue,
          symbol: nearest?.name ?? null,
          symbolOffset: nearest ? (target - nearest.address) & 0xffff : null,
        };
      });
      response.body = { before, rowSize, views, symbols: this.symbolList };
      this.sendResponse(response);
      return;
    }
    if (command === 'debug80/tec1gMemorySnapshot') {
      if (this.runtime === undefined) {
        this.sendErrorResponse(response, 1, 'Debug80: No program loaded.');
        return;
      }
      const payload = extractMemorySnapshotPayload(args);
      const before = this.clampMemoryWindow(payload.before, 16);
      const rowSize = payload.rowSize === 8 ? 8 : 16;
      const regs = this.runtime.getRegisters();
      const pc = regs.pc & 0xffff;
      const sp = regs.sp & 0xffff;
      const bc = ((regs.b & 0xff) << 8) | (regs.c & 0xff);
      const de = ((regs.d & 0xff) << 8) | (regs.e & 0xff);
      const hl = ((regs.h & 0xff) << 8) | (regs.l & 0xff);
      const ix = regs.ix & 0xffff;
      const iy = regs.iy & 0xffff;
      const memRead =
        this.runtime.hardware.memRead ??
        ((addr: number): number => this.runtime?.hardware.memory[addr & 0xffff] ?? 0);
      const pickAddress = (viewValue: string, addressValue: number | null): number => {
        switch (viewValue) {
          case 'pc':
            return pc;
          case 'sp':
            return sp;
          case 'bc':
            return bc;
          case 'de':
            return de;
          case 'hl':
            return hl;
          case 'ix':
            return ix;
          case 'iy':
            return iy;
          case 'absolute':
            return addressValue ?? hl;
          default:
            return hl;
        }
      };
      const viewRequests = payload.views ?? [];
      const views = viewRequests.map((entry) => {
        const {
          id,
          view: viewValue,
          after: afterValue,
          address: addressValue,
        } = extractViewEntry(entry, this.clampMemoryWindow.bind(this));
        const target = pickAddress(viewValue, addressValue);
        const window = this.readMemoryWindow(target, before, afterValue, rowSize, memRead);
        const nearest = findNearestSymbol(target, {
          anchors: this.symbolAnchors,
          lookupAnchors: this.symbolLookupAnchors,
        });
        return {
          id,
          view: viewValue,
          address: target,
          start: window.start,
          bytes: window.bytes,
          focus: window.focus,
          after: afterValue,
          symbol: nearest?.name ?? null,
          symbolOffset: nearest ? (target - nearest.address) & 0xffff : null,
        };
      });
      response.body = { views };
      this.sendResponse(response);
      return;
    }
    if (command === 'debug80/romSources') {
      response.body = { sources: this.collectRomSources() };
      this.sendResponse(response);
      return;
    }
    super.customRequest(command, response, args);
  }

  private continueExecution(response: DebugProtocol.Response): void {
    if (this.runtime === undefined) {
      this.sendErrorResponse(response, 1, 'No program loaded');
      return;
    }

    this.sendResponse(response);
    this.pauseRequested = false;
    if (
      this.lastStopReason === 'breakpoint' &&
      this.runtime.getPC() === this.lastBreakpointAddress &&
      this.lastBreakpointAddress !== null &&
      this.isBreakpointAddress(this.lastBreakpointAddress)
    ) {
      this.skipBreakpointOnce = this.lastBreakpointAddress;
    } else {
      this.skipBreakpointOnce = null;
    }
    this.runUntilStop();
  }

  private runUntilStop(
    extraBreakpoints?: Set<number>,
    maxInstructions?: number,
    limitLabel = 'step'
  ): void {
    void this.runUntilStopAsync(extraBreakpoints, maxInstructions, limitLabel);
  }

  private handleHaltStop(): void {
    if (!this.haltNotified) {
      this.haltNotified = true;
      this.lastStopReason = 'halt';
      this.lastBreakpointAddress = null;
      this.sendEvent(new StoppedEvent('halt', THREAD_ID));
      return;
    }

    this.tec1Runtime?.silenceSpeaker();
    this.tec1gRuntime?.silenceSpeaker();
    this.sendEvent(new TerminatedEvent());
  }

  private applyStepInfo(trace: StepInfo): void {
    if (!trace.kind || !trace.taken) {
      return;
    }
    if (trace.kind === 'call' || trace.kind === 'rst') {
      this.callDepth += 1;
      return;
    }
    if (trace.kind === 'ret') {
      this.callDepth = Math.max(0, this.callDepth - 1);
    }
  }

  private getUnmappedCallReturnAddress(): number | null {
    if (this.runtime === undefined || this.mappingIndex === undefined) {
      return null;
    }
    const cpu = this.runtime.getRegisters();
    const memRead =
      this.runtime.hardware.memRead ??
      ((addr: number): number => this.runtime?.hardware.memory[addr & 0xffff] ?? 0);
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

    const segment = findSegmentForAddress(this.mappingIndex, target);
    if (segment && segment.loc.file !== null) {
      return null;
    }

    return returnAddress;
  }

  private async runUntilStopAsync(
    extraBreakpoints?: Set<number>,
    maxInstructions?: number,
    limitLabel = 'step'
  ): Promise<void> {
    if (this.runtime === undefined) {
      return;
    }
    const CHUNK = 1000;
    const trace: StepInfo = { taken: false };
    let executed = 0;
    let cyclesSinceThrottle = 0;
    let lastThrottleMs = Date.now();
    const yieldMs =
      this.activePlatform === 'tec1'
        ? (this.tec1Runtime?.state.yieldMs ?? 0)
        : this.activePlatform === 'tec1g'
          ? (this.tec1gRuntime?.state.yieldMs ?? 0)
          : 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      for (let i = 0; i < CHUNK; i += 1) {
        if (this.runtime === undefined) {
          return;
        }
        if (this.pauseRequested) {
          this.pauseRequested = false;
          this.haltNotified = false;
          this.lastStopReason = 'pause';
          this.lastBreakpointAddress = null;
          this.tec1Runtime?.silenceSpeaker();
          this.tec1gRuntime?.silenceSpeaker();
          this.sendEvent(new StoppedEvent('pause', THREAD_ID));
          return;
        }
        if (this.skipBreakpointOnce !== null && this.runtime.getPC() === this.skipBreakpointOnce) {
          this.skipBreakpointOnce = null;
          const stepped = this.runtime.step({ trace });
          this.applyStepInfo(trace);
          executed += 1;
          cyclesSinceThrottle += stepped.cycles ?? 0;
          this.tec1Runtime?.recordCycles(stepped.cycles ?? 0);
          this.tec1gRuntime?.recordCycles(stepped.cycles ?? 0);
          if (stepped.halted) {
            this.handleHaltStop();
            return;
          }
          continue;
        }
        const pc = this.runtime.getPC();
        if (this.isBreakpointAddress(pc)) {
          this.haltNotified = false;
          this.lastStopReason = 'breakpoint';
          this.lastBreakpointAddress = pc;
          this.sendEvent(new StoppedEvent('breakpoint', THREAD_ID));
          return;
        }
        if (extraBreakpoints !== undefined && extraBreakpoints.has(pc)) {
          this.haltNotified = false;
          this.lastStopReason = 'step';
          this.lastBreakpointAddress = null;
          this.sendEvent(new StoppedEvent('step', THREAD_ID));
          return;
        }
        const result = this.runtime.step({ trace });
        this.applyStepInfo(trace);
        executed += 1;
        cyclesSinceThrottle += result.cycles ?? 0;
        this.tec1Runtime?.recordCycles(result.cycles ?? 0);
        this.tec1gRuntime?.recordCycles(result.cycles ?? 0);
        if (result.halted) {
          this.handleHaltStop();
          return;
        }
        if (maxInstructions !== undefined && maxInstructions > 0 && executed >= maxInstructions) {
          this.haltNotified = false;
          this.lastStopReason = 'step';
          this.lastBreakpointAddress = null;
          this.sendEvent(
            new OutputEvent(
              `Debug80: ${limitLabel} stopped after ${maxInstructions} instructions (target not reached).\n`
            )
          );
          this.sendEvent(new StoppedEvent('step', THREAD_ID));
          return;
        }
      }
      if (this.activePlatform === 'tec1' || this.activePlatform === 'tec1g') {
        const clockHz =
          this.activePlatform === 'tec1'
            ? (this.tec1Runtime?.state.clockHz ?? 0)
            : (this.tec1gRuntime?.state.clockHz ?? 0);
        if (clockHz > 0) {
          const targetMs = (cyclesSinceThrottle / clockHz) * 1000;
          const now = Date.now();
          const elapsed = now - lastThrottleMs;
          const waitMs = targetMs - elapsed;
          if (waitMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, waitMs));
          } else if (yieldMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, yieldMs));
          } else {
            await new Promise((resolve) => setImmediate(resolve));
          }
          lastThrottleMs = Date.now();
          cyclesSinceThrottle = 0;
          continue;
        }
      }
      cyclesSinceThrottle = 0;
      lastThrottleMs = Date.now();
      if (yieldMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, yieldMs));
      } else {
        await new Promise((resolve) => setImmediate(resolve));
      }
    }
  }

  private async runUntilReturnAsync(baselineDepth: number): Promise<void> {
    if (this.runtime === undefined) {
      return;
    }
    const CHUNK = 1000;
    const maxInstructions = this.stepOutMaxInstructions;
    const trace: StepInfo = { taken: false };
    let executed = 0;
    let cyclesSinceThrottle = 0;
    let lastThrottleMs = Date.now();
    const yieldMs =
      this.activePlatform === 'tec1'
        ? (this.tec1Runtime?.state.yieldMs ?? 0)
        : this.activePlatform === 'tec1g'
          ? (this.tec1gRuntime?.state.yieldMs ?? 0)
          : 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      for (let i = 0; i < CHUNK; i += 1) {
        if (this.runtime === undefined) {
          return;
        }
        if (this.pauseRequested) {
          this.pauseRequested = false;
          this.haltNotified = false;
          this.lastStopReason = 'pause';
          this.lastBreakpointAddress = null;
          this.tec1Runtime?.silenceSpeaker();
          this.tec1gRuntime?.silenceSpeaker();
          this.sendEvent(new StoppedEvent('pause', THREAD_ID));
          return;
        }
        if (this.skipBreakpointOnce !== null && this.runtime.getPC() === this.skipBreakpointOnce) {
          this.skipBreakpointOnce = null;
          const stepped = this.runtime.step({ trace });
          this.applyStepInfo(trace);
          executed += 1;
          cyclesSinceThrottle += stepped.cycles ?? 0;
          if (stepped.halted) {
            this.handleHaltStop();
            return;
          }
        } else {
          const pc = this.runtime.getPC();
          if (this.isBreakpointAddress(pc)) {
            this.haltNotified = false;
            this.lastStopReason = 'breakpoint';
            this.lastBreakpointAddress = pc;
            this.sendEvent(new StoppedEvent('breakpoint', THREAD_ID));
            return;
          }
          const result = this.runtime.step({ trace });
          this.applyStepInfo(trace);
          executed += 1;
          cyclesSinceThrottle += result.cycles ?? 0;
          this.tec1Runtime?.recordCycles(result.cycles ?? 0);
          this.tec1gRuntime?.recordCycles(result.cycles ?? 0);
          if (result.halted) {
            this.handleHaltStop();
            return;
          }
        }

        if (trace.kind === 'ret' && trace.taken) {
          if (baselineDepth === 0 || this.callDepth < baselineDepth) {
            this.haltNotified = false;
            this.lastStopReason = 'step';
            this.lastBreakpointAddress = null;
            this.sendEvent(new StoppedEvent('step', THREAD_ID));
            return;
          }
        }

        if (maxInstructions > 0 && executed >= maxInstructions) {
          this.haltNotified = false;
          this.lastStopReason = 'step';
          this.lastBreakpointAddress = null;
          this.sendEvent(
            new OutputEvent(
              `Debug80: step out stopped after ${maxInstructions} instructions (return not observed).\n`
            )
          );
          this.sendEvent(new StoppedEvent('step', THREAD_ID));
          return;
        }
      }
      if (this.activePlatform === 'tec1' || this.activePlatform === 'tec1g') {
        const clockHz =
          this.activePlatform === 'tec1'
            ? (this.tec1Runtime?.state.clockHz ?? 0)
            : (this.tec1gRuntime?.state.clockHz ?? 0);
        if (clockHz > 0) {
          const targetMs = (cyclesSinceThrottle / clockHz) * 1000;
          const now = Date.now();
          const elapsed = now - lastThrottleMs;
          const waitMs = targetMs - elapsed;
          if (waitMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, waitMs));
          } else if (yieldMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, yieldMs));
          } else {
            await new Promise((resolve) => setImmediate(resolve));
          }
          lastThrottleMs = Date.now();
          cyclesSinceThrottle = 0;
          continue;
        }
      }
      cyclesSinceThrottle = 0;
      lastThrottleMs = Date.now();
      if (yieldMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, yieldMs));
      } else {
        await new Promise((resolve) => setImmediate(resolve));
      }
    }
  }

  private populateFromConfig(args: LaunchRequestArguments): LaunchRequestArguments {
    const configCandidates: string[] = [];

    if (args.projectConfig !== undefined && args.projectConfig !== '') {
      configCandidates.push(args.projectConfig);
    }
    configCandidates.push('debug80.json');
    configCandidates.push('.debug80.json');
    configCandidates.push(path.join('.vscode', 'debug80.json'));

    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const startDir =
      args.asm !== undefined && args.asm !== ''
        ? path.dirname(args.asm)
        : args.sourceFile !== undefined && args.sourceFile !== ''
          ? path.dirname(args.sourceFile)
          : (workspaceRoot ?? process.cwd());

    const dirsToCheck: string[] = [];
    for (let dir = startDir; ; ) {
      dirsToCheck.push(dir);
      const parent = path.dirname(dir);
      if (parent === dir) {
        break;
      }
      dir = parent;
    }

    let configPath: string | undefined;
    for (const dir of dirsToCheck) {
      for (const candidate of configCandidates) {
        const full = path.isAbsolute(candidate) ? candidate : path.join(dir, candidate);
        if (fs.existsSync(full)) {
          configPath = full;
          break;
        }
      }
      if (configPath !== undefined) {
        break;
      }
      const pkgPath = path.join(dir, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const pkgRaw = fs.readFileSync(pkgPath, 'utf-8');
          const pkg = JSON.parse(pkgRaw) as { debug80?: unknown };
          if (pkg.debug80 !== undefined) {
            configPath = pkgPath;
            break;
          }
        } catch {
          /* ignore */
        }
      }
    }

    if (configPath === undefined) {
      return args;
    }

    try {
      let cfg: {
        defaultTarget?: string;
        targets?: Record<
          string,
          Partial<LaunchRequestArguments> & { sourceFile?: string; source?: string }
        >;
      } & (Partial<LaunchRequestArguments> & { sourceFile?: string; source?: string });

      if (configPath.endsWith('package.json')) {
        const pkgRaw = fs.readFileSync(configPath, 'utf-8');
        const pkg = JSON.parse(pkgRaw) as { debug80?: unknown };
        cfg =
          (pkg.debug80 as typeof cfg) ??
          ({
            targets: {},
          } as typeof cfg);
      } else {
        const raw = fs.readFileSync(configPath, 'utf-8');
        cfg = JSON.parse(raw) as typeof cfg;
      }

      const targets = cfg.targets ?? {};
      const targetName = args.target ?? cfg.target ?? cfg.defaultTarget ?? Object.keys(targets)[0];
      const targetCfg = (targetName !== undefined ? targets[targetName] : undefined) ?? undefined;

      const merged: LaunchRequestArguments = {
        ...cfg,
        ...targetCfg,
        ...args,
      };

      const asmResolved =
        args.asm ??
        args.sourceFile ??
        targetCfg?.asm ??
        targetCfg?.sourceFile ??
        targetCfg?.source ??
        cfg.asm ??
        cfg.sourceFile ??
        cfg.source;
      if (asmResolved !== undefined) {
        merged.asm = asmResolved;
      }

      const sourceResolved =
        args.sourceFile ??
        args.asm ??
        targetCfg?.sourceFile ??
        targetCfg?.asm ??
        targetCfg?.source ??
        cfg.sourceFile ??
        cfg.asm ??
        cfg.source;
      if (sourceResolved !== undefined) {
        merged.sourceFile = sourceResolved;
      }

      const hexResolved = args.hex ?? targetCfg?.hex ?? cfg.hex;
      if (hexResolved !== undefined) {
        merged.hex = hexResolved;
      }

      const listingResolved = args.listing ?? targetCfg?.listing ?? cfg.listing;
      if (listingResolved !== undefined) {
        merged.listing = listingResolved;
      }

      const outputDirResolved = args.outputDir ?? targetCfg?.outputDir ?? cfg.outputDir;
      if (outputDirResolved !== undefined) {
        merged.outputDir = outputDirResolved;
      }

      const artifactResolved = args.artifactBase ?? targetCfg?.artifactBase ?? cfg.artifactBase;
      if (artifactResolved !== undefined) {
        merged.artifactBase = artifactResolved;
      }

      const entryResolved = args.entry ?? targetCfg?.entry ?? cfg.entry;
      if (entryResolved !== undefined) {
        merged.entry = entryResolved;
      }

      const platformResolved = args.platform ?? targetCfg?.platform ?? cfg.platform;
      if (platformResolved !== undefined) {
        merged.platform = platformResolved;
      }

      const simpleResolved = args.simple ?? targetCfg?.simple ?? cfg.simple;
      if (simpleResolved !== undefined) {
        merged.simple = simpleResolved;
      }

      const stopOnEntryResolved = args.stopOnEntry ?? targetCfg?.stopOnEntry ?? cfg.stopOnEntry;
      if (stopOnEntryResolved !== undefined) {
        merged.stopOnEntry = stopOnEntryResolved;
      }

      const assembleResolved = args.assemble ?? targetCfg?.assemble ?? cfg.assemble;
      if (assembleResolved !== undefined) {
        merged.assemble = assembleResolved;
      }

      const sourceRootsResolved = args.sourceRoots ?? targetCfg?.sourceRoots ?? cfg.sourceRoots;
      if (sourceRootsResolved !== undefined) {
        merged.sourceRoots = sourceRootsResolved;
      }

      const stepOverResolved =
        args.stepOverMaxInstructions ??
        targetCfg?.stepOverMaxInstructions ??
        cfg.stepOverMaxInstructions;
      if (stepOverResolved !== undefined) {
        merged.stepOverMaxInstructions = stepOverResolved;
      }

      const stepOutResolved =
        args.stepOutMaxInstructions ??
        targetCfg?.stepOutMaxInstructions ??
        cfg.stepOutMaxInstructions;
      if (stepOutResolved !== undefined) {
        merged.stepOutMaxInstructions = stepOutResolved;
      }

      const targetResolved = targetName ?? args.target;
      if (targetResolved !== undefined) {
        merged.target = targetResolved;
      }

      return merged;
    } catch {
      return args;
    }
  }

  private normalizePlatformName(args: LaunchRequestArguments): PlatformKind {
    const raw = args.platform ?? 'simple';
    const name = raw.trim().toLowerCase();
    if (name === '') {
      return 'simple';
    }
    if (name !== 'simple' && name !== 'tec1' && name !== 'tec1g') {
      throw new Error(`Unsupported platform "${raw}".`);
    }
    return name;
  }

  private assembleIfRequested(
    args: LaunchRequestArguments,
    asmPath: string | undefined,
    hexPath: string,
    listingPath: string,
    platform: string,
    simpleConfig?: SimplePlatformConfigNormalized
  ): void {
    if (asmPath === undefined || asmPath === '' || args.assemble === false) {
      return;
    }

    const result = runAssembler(asmPath, hexPath, listingPath, (message) => {
      this.sendEvent(new OutputEvent(message, 'console'));
    });
    if (!result.success) {
      throw new Error(result.error ?? 'asm80 failed to assemble');
    }

    if (
      platform === 'simple' &&
      simpleConfig?.binFrom !== undefined &&
      simpleConfig.binTo !== undefined
    ) {
      const binResult = runAssemblerBin(
        asmPath,
        hexPath,
        simpleConfig.binFrom,
        simpleConfig.binTo,
        (message) => {
          this.sendEvent(new OutputEvent(message, 'console'));
        }
      );
      if (!binResult.success) {
        throw new Error(binResult.error ?? 'asm80 failed to build binary');
      }
    }
  }

  private normalizeStepLimit(value: number | undefined, fallback: number): number {
    if (value === undefined) {
      return fallback;
    }
    if (!Number.isFinite(value)) {
      return fallback;
    }
    if (value <= 0) {
      return 0;
    }
    return Math.floor(value);
  }

  private clampMemoryWindow(value: unknown, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return fallback;
    }
    if (value <= 0) {
      return fallback;
    }
    return Math.min(1024, Math.floor(value));
  }

  private readMemoryWindow(
    center: number,
    before: number,
    after: number,
    rowSize: number,
    memRead: (addr: number) => number
  ): { start: number; bytes: number[]; focus: number } {
    const centerAddr = center & 0xffff;
    const rawStart = (centerAddr - before) & 0xffff;
    const alignedStart = rawStart - (rawStart % rowSize);
    const windowSize = before + after + 1;
    const paddedSize = Math.ceil(windowSize / rowSize) * rowSize;
    const bytes = new Array<number>(paddedSize);
    for (let i = 0; i < paddedSize; i += 1) {
      bytes[i] = memRead((alignedStart + i) & 0xffff) & 0xff;
    }
    const focus = (centerAddr - alignedStart) & 0xffff;
    return { start: alignedStart & 0xffff, bytes, focus };
  }

  private async promptForConfigCreation(_args: LaunchRequestArguments): Promise<boolean> {
    const created = await vscode.commands.executeCommand<boolean>('debug80.createProject');
    return Boolean(created);
  }

  private normalizeSourcePath(sourcePath: string): string {
    if (path.isAbsolute(sourcePath)) {
      return path.resolve(sourcePath);
    }
    return path.resolve(this.baseDir, sourcePath);
  }

  private resolveSourceRoots(args: LaunchRequestArguments, baseDir: string): string[] {
    const roots = args.sourceRoots ?? [];
    return roots.map((root) => this.resolveRelative(root, baseDir));
  }

  private resolveDebugMapPath(
    args: LaunchRequestArguments,
    baseDir: string,
    asmPath: string | undefined,
    listingPath: string
  ): string {
    const artifactBase =
      args.artifactBase ??
      (asmPath === undefined
        ? path.basename(listingPath, '.lst')
        : path.basename(asmPath, path.extname(asmPath)));
    const cacheDir = this.resolveCacheDir(baseDir);
    if (cacheDir !== undefined && cacheDir.length > 0) {
      const key = this.buildListingCacheKey(listingPath);
      return path.join(cacheDir, `${artifactBase}.${key}.d8dbg.json`);
    }
    const outDirRaw = args.outputDir ?? path.dirname(listingPath);
    const outDir = this.resolveRelative(outDirRaw, baseDir);
    return path.join(outDir, `${artifactBase}.d8dbg.json`);
  }

  private resolveExtraDebugMapPath(listingPath: string): string {
    const base = path.basename(listingPath, path.extname(listingPath));
    const cacheDir = this.resolveCacheDir(this.baseDir);
    if (cacheDir !== undefined && cacheDir.length > 0) {
      const key = this.buildListingCacheKey(listingPath);
      return path.join(cacheDir, `${base}.${key}.d8dbg.json`);
    }
    const dir = path.dirname(listingPath);
    return path.join(dir, `${base}.d8dbg.json`);
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

  private relativeIfPossible(filePath: string, baseDir: string): string {
    const normalizedBase = path.resolve(baseDir);
    const normalizedPath = path.resolve(filePath);
    if (isPathWithin(normalizedPath, normalizedBase)) {
      return path.relative(normalizedBase, normalizedPath) || normalizedPath;
    }
    return normalizedPath;
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

  private resolveAsmPath(asm: string | undefined, baseDir: string): string | undefined {
    if (asm === undefined || asm === '') {
      return undefined;
    }
    if (path.isAbsolute(asm)) {
      return asm;
    }
    return path.resolve(baseDir, asm);
  }

  private resolveRelative(p: string, baseDir: string): string {
    if (path.isAbsolute(p)) {
      return p;
    }
    return path.resolve(baseDir, p);
  }

  private resolveArtifacts(
    args: LaunchRequestArguments,
    baseDir: string
  ): { hexPath: string; listingPath: string; asmPath?: string | undefined } {
    const asmPath = this.resolveAsmPath(args.asm, baseDir);

    let hexPath = args.hex;
    let listingPath = args.listing;

    const hexMissing = hexPath === undefined || hexPath === '';
    const listingMissing = listingPath === undefined || listingPath === '';

    if (hexMissing || listingMissing) {
      if (asmPath === undefined || asmPath === '') {
        throw new Error(
          'Z80 runtime requires "asm" (root asm file) or explicit "hex" and "listing" paths.'
        );
      }
      const artifactBase = args.artifactBase ?? path.basename(asmPath, path.extname(asmPath));
      const outDirRaw = args.outputDir ?? path.dirname(asmPath);
      const outDir = this.resolveRelative(outDirRaw, baseDir);
      hexPath = path.join(outDir, `${artifactBase}.hex`);
      listingPath = path.join(outDir, `${artifactBase}.lst`);
    }

    if (
      hexPath === undefined ||
      listingPath === undefined ||
      hexPath === '' ||
      listingPath === ''
    ) {
      throw new Error('Z80 runtime requires resolvable HEX and LST paths.');
    }

    const hexAbs = this.resolveRelative(hexPath, baseDir);
    const listingAbs = this.resolveRelative(listingPath, baseDir);

    return { hexPath: hexAbs, listingPath: listingAbs, asmPath };
  }
}

export class Z80DebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {
  createDebugAdapterDescriptor(
    _session: vscode.DebugSession
  ): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
    return new vscode.DebugAdapterInlineImplementation(new Z80DebugSession());
  }
}
