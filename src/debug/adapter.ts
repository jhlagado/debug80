import * as vscode from 'vscode';
import { DebugSession, InitializedEvent, StoppedEvent, TerminatedEvent, Thread, StackFrame, Scope, Source, Handles, BreakpointEvent, OutputEvent } from '@vscode/debugadapter';
import { DebugProtocol } from '@vscode/debugprotocol';
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import { Event as DapEvent } from '@vscode/debugadapter';
import { parseIntelHex, parseListing, ListingInfo, HexProgram } from '../z80/loaders';
import { parseMapping, MappingParseResult } from '../mapping/parser';
import { applyLayer2 } from '../mapping/layer2';
import { buildSourceMapIndex, findAnchorLine, findSegmentForAddress, resolveLocation, SourceMapIndex } from '../mapping/source-map';
import { buildD8DebugMap, buildMappingFromD8DebugMap, parseD8DebugMap } from '../mapping/d8-map';
import {
  createZ80Runtime,
  Z80Runtime,
  IoHandlers,
} from '../z80/runtime';
import { StepInfo } from '../z80/types';
import {
  SimplePlatformConfig,
  SimplePlatformConfigNormalized,
  Tec1PlatformConfig,
  Tec1PlatformConfigNormalized,
} from '../platforms/types';
import { normalizeSimpleConfig } from '../platforms/simple/runtime';
import { createTec1Runtime, normalizeTec1Config, Tec1Runtime } from '../platforms/tec1/runtime';

interface LaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
  asm?: string;
  sourceFile?: string;
  hex?: string;
  listing?: string;
  outputDir?: string;
  artifactBase?: string;
  entry?: number;
  stopOnEntry?: boolean;
  projectConfig?: string;
  target?: string;
  platform?: string;
  assemble?: boolean;
  sourceRoots?: string[];
  stepOverMaxInstructions?: number;
  stepOutMaxInstructions?: number;
  terminal?: TerminalConfig;
  simple?: SimplePlatformConfig;
  tec1?: Tec1PlatformConfig;
}

interface TerminalConfig {
  txPort?: number;
  rxPort?: number;
  statusPort?: number;
  interrupt?: boolean;
}

interface TerminalState {
  config: TerminalConfigNormalized;
  input: number[];
  breakRequested?: boolean;
}

interface TerminalConfigNormalized {
  txPort: number;
  rxPort: number;
  statusPort: number;
  interrupt: boolean;
}

const THREAD_ID = 1;

export class Z80DebugSession extends DebugSession {
  private runtime: Z80Runtime | undefined;
  private listing: ListingInfo | undefined;
  private listingPath: string | undefined;
  private mapping: MappingParseResult | undefined;
  private mappingIndex: SourceMapIndex | undefined;
  private pendingBreakpointsBySource: Map<string, DebugProtocol.SourceBreakpoint[]> = new Map();
  private sourceRoots: string[] = [];
  private baseDir = process.cwd();
  private sourceFile = '';
  private stopOnEntry = false;
  private haltNotified = false;
  private lastStopReason: 'breakpoint' | 'step' | 'halt' | 'entry' | 'pause' | undefined;
  private lastBreakpointAddress: number | null = null;
  private skipBreakpointOnce: number | null = null;
  private callDepth = 0;
  private stepOverMaxInstructions = 0;
  private stepOutMaxInstructions = 0;
  private pauseRequested = false;
  private variableHandles = new Handles<'registers'>();
  private breakpoints: Set<number> = new Set();
  private terminalState: TerminalState | undefined;
  private tec1Runtime: Tec1Runtime | undefined;
  private tec1Config: Tec1PlatformConfigNormalized | undefined;
  private activePlatform = 'simple';
  private loadedProgram: HexProgram | undefined;
  private loadedEntry: number | undefined;

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
    this.haltNotified = false;
    this.breakpoints.clear();
    this.runtime = undefined;
    this.listing = undefined;
    this.listingPath = undefined;
    this.mapping = undefined;
    this.mappingIndex = undefined;
    this.sourceRoots = [];
    this.baseDir = process.cwd();
    this.terminalState = undefined;
    this.tec1Runtime = undefined;
    this.loadedProgram = undefined;
    this.loadedEntry = undefined;
    this.lastStopReason = undefined;
    this.lastBreakpointAddress = null;
    this.skipBreakpointOnce = null;
    this.pauseRequested = false;
    this.stepOverMaxInstructions = 0;
    this.stepOutMaxInstructions = 0;

    try {
      const merged = this.populateFromConfig(args);
      this.stopOnEntry = merged.stopOnEntry !== false;

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
      const simpleConfig =
        platform === 'simple' ? normalizeSimpleConfig(merged.simple) : undefined;
      const tec1Config =
        platform === 'tec1' ? normalizeTec1Config(merged.tec1) : undefined;
      this.tec1Config = tec1Config;
      this.sendEvent(new DapEvent('debug80/platform', { id: platform }));

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

      const hexContent = fs.readFileSync(hexPath, 'utf-8');
      const program = parseIntelHex(hexContent);
      if (platform === 'tec1') {
        const memory = new Uint8Array(0x10000);
        memory.fill(0);
        const romPath = tec1Config?.romHex
          ? this.resolveRelative(tec1Config.romHex, baseDir)
          : this.resolveBundledTec1Rom();
        if (!romPath || !fs.existsSync(romPath)) {
          const target = romPath ?? '(missing bundled ROM)';
          this.sendEvent(
            new OutputEvent(`Debug80: TEC-1 ROM not found at "${target}".\n`, 'console')
          );
        } else {
          const binPath = this.resolveRomBinPath(romPath);
          if (binPath && fs.existsSync(binPath)) {
            this.applyBinaryToMemory(binPath, memory);
          } else {
            const romContent = fs.readFileSync(romPath, 'utf-8');
            const romHex = this.extractRomHex(romContent, romPath);
            this.applyIntelHexToMemory(romHex, memory);
          }
        }
        const ramInitPath = tec1Config?.ramInitHex
          ? this.resolveRelative(tec1Config.ramInitHex, baseDir)
          : undefined;
        if (ramInitPath) {
          if (!fs.existsSync(ramInitPath)) {
            this.sendEvent(
              new OutputEvent(
                `Debug80: TEC-1 RAM init not found at "${ramInitPath}".\n`,
                'console'
              )
            );
          } else {
            const ramInitContent = fs.readFileSync(ramInitPath, 'utf-8');
            const ramInitHex = this.extractRomHex(ramInitContent, ramInitPath);
            this.applyIntelHexToMemory(ramInitHex, memory);
          }
        }
        // Overlay user program after ROM/RAM init data.
        this.applyIntelHexToMemory(hexContent, memory);
        program.memory = memory;
      }

      const listingContent = fs.readFileSync(listingPath, 'utf-8');
      this.listing = parseListing(listingContent);
      this.listingPath = listingPath;
      const sourcePath =
        asmPath ??
        (merged.sourceFile ? this.resolveRelative(merged.sourceFile, baseDir) : undefined);
      this.sourceFile = sourcePath ?? listingPath;
      this.sourceRoots = this.resolveSourceRoots(merged, baseDir);

      const mapPath = this.resolveDebugMapPath(merged, baseDir, asmPath, listingPath);
      const mapStale = this.isDebugMapStale(mapPath, listingPath);
      if (mapStale) {
        this.sendEvent(
          new OutputEvent(
            `Debug80: D8 debug map is older than the LST. Regenerating from LST.\n`,
            'console'
          )
        );
      }
      let debugMap = mapStale ? undefined : this.loadDebugMap(mapPath);
      if (!debugMap) {
        const baseMapping = parseMapping(listingContent);
        this.applySourceFallback(baseMapping, merged.sourceFile, baseDir);
        const layer2 = applyLayer2(baseMapping, {
          resolvePath: (file) => this.resolveMappedPath(file),
        });
        if (layer2.missingSources.length > 0) {
          const unique = Array.from(new Set(layer2.missingSources));
          this.sendEvent(
            new OutputEvent(
              `Debug80: Missing source files for Layer 2 mapping: ${unique.join(', ')}\n`,
              'console'
            )
          );
        }
        debugMap = buildD8DebugMap(baseMapping, {
          arch: 'z80',
          addressWidth: 16,
          endianness: 'little',
          generator: {
            name: 'debug80',
          },
        });
        this.writeDebugMap(debugMap, mapPath, baseDir, listingPath);
      }

      this.mapping = buildMappingFromD8DebugMap(debugMap);
      this.mappingIndex = buildSourceMapIndex(this.mapping, (file) => this.resolveMappedPath(file));

      const ioHandlers = this.buildIoHandlers(platform, merged);
      const runtimeOptions =
        (platform === 'simple' && simpleConfig) || (platform === 'tec1' && tec1Config)
          ? { romRanges: (simpleConfig ?? tec1Config)?.romRanges ?? [] }
          : undefined;
      const entry =
        platform === 'simple'
          ? simpleConfig?.entry
          : platform === 'tec1'
            ? tec1Config?.entry
            : merged.entry;
      this.loadedProgram = program;
      this.loadedEntry = entry;
      this.runtime = createZ80Runtime(program, entry, ioHandlers, runtimeOptions);
      this.callDepth = 0;
      this.stepOverMaxInstructions = this.normalizeStepLimit(
        merged.stepOverMaxInstructions,
        0
      );
      this.stepOutMaxInstructions = this.normalizeStepLimit(
        merged.stepOutMaxInstructions,
        0
      );
      if (this.listing !== undefined) {
        const applied = this.applyAllBreakpoints();
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
    const normalized = sourcePath ? this.normalizeSourcePath(sourcePath) : undefined;

    if (normalized) {
      this.pendingBreakpointsBySource.set(normalized, breakpoints);
    }

    const verified =
      this.listing !== undefined && normalized
        ? this.applyBreakpointsForSource(normalized, breakpoints)
        : breakpoints.map((bp) => ({ line: bp.line, verified: false }));

    if (this.listing !== undefined) {
      this.rebuildBreakpoints();
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
      this.breakpoints.has(this.lastBreakpointAddress)
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
    const sourcePath = this.sourceFile || listingPath || '';
    const fallbackLine = listingPath && sourcePath === listingPath ? listingLine : 1;
    const fallback = { path: sourcePath, line: fallbackLine };

    const index = this.mappingIndex;
    if (!index) {
      return fallback;
    }
    const segment = findSegmentForAddress(index, address);
    if (!segment || segment.loc.file === null) {
      return fallback;
    }

    const resolvedPath = this.resolveMappedPath(segment.loc.file);
    if (!resolvedPath) {
      return fallback;
    }

    if (segment.loc.line !== null) {
      return { path: resolvedPath, line: segment.loc.line };
    }

    const anchorLine = findAnchorLine(index, resolvedPath, address);
    if (anchorLine !== null) {
      return { path: resolvedPath, line: anchorLine };
    }

    return fallback;
  }

  private resolveMappedPath(file: string): string | undefined {
    if (path.isAbsolute(file)) {
      return file;
    }
    const roots: string[] = [];
    if (this.listingPath) {
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

      const fmt16 = (v: number) => `0x${v.toString(16).padStart(4, '0')}`;
      const fmt8 = (v: number) => `0x${v.toString(16).padStart(2, '0')}`;
      const flagsStr = (f: { S: number; Z: number; Y: number; H: number; X: number; P: number; N: number; C: number }) => {
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
    this.runtime = undefined;
    this.haltNotified = false;
    this.terminalState = undefined;
    this.tec1Runtime = undefined;
    this.loadedProgram = undefined;
    this.loadedEntry = undefined;
    this.sendResponse(response);
  }

  protected customRequest(
    command: string,
    response: DebugProtocol.Response,
    args: unknown
  ): void {
    if (command === 'debug80/terminalInput') {
      if (this.terminalState === undefined) {
        this.sendErrorResponse(response, 1, 'Debug80: Terminal not configured.');
        return;
      }
      const payload = args as { text?: unknown };
      const textValue = typeof payload.text === 'string' ? payload.text : '';
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
      const payload = args as { code?: unknown };
      const code = Number.isFinite(payload.code as number)
        ? (payload.code as number)
        : undefined;
      if (code === undefined) {
        this.sendErrorResponse(response, 1, 'Debug80: Missing key code.');
        return;
      }
      if (code === 0x12) {
        this.tec1Runtime.silenceSpeaker();
      }
      this.tec1Runtime.applyKey(code);
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
    if (command === 'debug80/tec1Speed') {
      if (this.tec1Runtime === undefined) {
        this.sendErrorResponse(response, 1, 'Debug80: TEC-1 platform not active.');
        return;
      }
      const payload = args as { mode?: unknown };
      const mode = payload.mode === 'slow' || payload.mode === 'fast' ? payload.mode : undefined;
      if (!mode) {
        this.sendErrorResponse(response, 1, 'Debug80: Missing speed mode.');
        return;
      }
      this.tec1Runtime.setSpeed(mode);
      this.sendResponse(response);
      return;
    }
    if (command === 'debug80/tec1SerialInput') {
      if (this.tec1Runtime === undefined) {
        this.sendErrorResponse(response, 1, 'Debug80: TEC-1 platform not active.');
        return;
      }
      const payload = args as { text?: unknown };
      const textValue = typeof payload.text === 'string' ? payload.text : '';
      const bytes = Array.from(textValue, (ch) => ch.charCodeAt(0) & 0xff);
      this.tec1Runtime.queueSerial(bytes);
      this.sendResponse(response);
      return;
    }
    if (command === 'debug80/tec1MemorySnapshot') {
      if (this.runtime === undefined) {
        this.sendErrorResponse(response, 1, 'Debug80: No program loaded.');
        return;
      }
      const payload = args as {
        before?: unknown;
        after?: unknown;
        rowSize?: unknown;
        view?: unknown;
        address?: unknown;
      };
      const before = this.clampMemoryWindow(payload.before, 16);
      const after = this.clampMemoryWindow(payload.after, 16);
      const rowSize = payload.rowSize === 8 ? 8 : 16;
      const view = typeof payload.view === 'string' ? payload.view : 'hl';
      const address =
        Number.isFinite(payload.address as number) ? ((payload.address as number) & 0xffff) : null;
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
        ((addr: number) => this.runtime?.hardware.memory[addr & 0xffff] ?? 0);
      const pickMainAddress = (): number => {
        switch (view) {
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
            return address ?? hl;
          default:
            return hl;
        }
      };
      const mainAddress = pickMainAddress();
      const pcWindow = this.readMemoryWindow(pc, before, after, rowSize, memRead);
      const spWindow = this.readMemoryWindow(sp, before, after, rowSize, memRead);
      const mainWindow = this.readMemoryWindow(mainAddress, before, after, rowSize, memRead);
      response.body = {
        before,
        rowSize,
        pc,
        sp,
        pcStart: pcWindow.start,
        pcBytes: pcWindow.bytes,
        pcFocus: pcWindow.focus,
        spStart: spWindow.start,
        spBytes: spWindow.bytes,
        spFocus: spWindow.focus,
        mainAddress,
        mainStart: mainWindow.start,
        mainBytes: mainWindow.bytes,
        mainFocus: mainWindow.focus,
      };
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
      this.breakpoints.has(this.lastBreakpointAddress)
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
      ((addr: number) => this.runtime?.hardware.memory[addr & 0xffff] ?? 0);
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
      case 0xCD: // CALL nn
        taken = true;
        target = read16(pc + 1);
        returnAddress = (pc + 3) & 0xffff;
        break;
      case 0xC4: // CALL NZ
        taken = !cpu.flags.Z;
        target = read16(pc + 1);
        returnAddress = (pc + 3) & 0xffff;
        break;
      case 0xCC: // CALL Z
        taken = !!cpu.flags.Z;
        target = read16(pc + 1);
        returnAddress = (pc + 3) & 0xffff;
        break;
      case 0xD4: // CALL NC
        taken = !cpu.flags.C;
        target = read16(pc + 1);
        returnAddress = (pc + 3) & 0xffff;
        break;
      case 0xDC: // CALL C
        taken = !!cpu.flags.C;
        target = read16(pc + 1);
        returnAddress = (pc + 3) & 0xffff;
        break;
      case 0xE4: // CALL PO
        taken = !cpu.flags.P;
        target = read16(pc + 1);
        returnAddress = (pc + 3) & 0xffff;
        break;
      case 0xEC: // CALL PE
        taken = !!cpu.flags.P;
        target = read16(pc + 1);
        returnAddress = (pc + 3) & 0xffff;
        break;
      case 0xF4: // CALL P
        taken = !cpu.flags.S;
        target = read16(pc + 1);
        returnAddress = (pc + 3) & 0xffff;
        break;
      case 0xFC: // CALL M
        taken = !!cpu.flags.S;
        target = read16(pc + 1);
        returnAddress = (pc + 3) & 0xffff;
        break;
      case 0xC7:
      case 0xCF:
      case 0xD7:
      case 0xDF:
      case 0xE7:
      case 0xEF:
      case 0xF7:
      case 0xFF:
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
      this.activePlatform === 'tec1' ? this.tec1Runtime?.state.yieldMs ?? 0 : 0;
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
          this.sendEvent(new StoppedEvent('pause', THREAD_ID));
          return;
        }
        if (
          this.skipBreakpointOnce !== null &&
          this.runtime.getPC() === this.skipBreakpointOnce
        ) {
          this.skipBreakpointOnce = null;
          const stepped = this.runtime.step({ trace });
          this.applyStepInfo(trace);
          executed += 1;
          cyclesSinceThrottle += stepped.cycles ?? 0;
          this.tec1Runtime?.recordCycles(stepped.cycles ?? 0);
          if (stepped.halted) {
            this.handleHaltStop();
            return;
          }
          continue;
        }
        const pc = this.runtime.getPC();
        if (this.breakpoints.has(pc)) {
          this.haltNotified = false;
          this.lastStopReason = 'breakpoint';
          this.lastBreakpointAddress = pc;
          this.sendEvent(new StoppedEvent('breakpoint', THREAD_ID));
          return;
        }
        if (extraBreakpoints?.has(pc)) {
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
      if (this.activePlatform === 'tec1') {
        const clockHz = this.tec1Runtime?.state.clockHz ?? 0;
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
      this.activePlatform === 'tec1' ? this.tec1Runtime?.state.yieldMs ?? 0 : 0;
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
          this.sendEvent(new StoppedEvent('pause', THREAD_ID));
          return;
        }
        if (
          this.skipBreakpointOnce !== null &&
          this.runtime.getPC() === this.skipBreakpointOnce
        ) {
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
          if (this.breakpoints.has(pc)) {
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
      if (this.activePlatform === 'tec1') {
        const clockHz = this.tec1Runtime?.state.clockHz ?? 0;
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
        : workspaceRoot ?? process.cwd();

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
        targets?: Record<string, Partial<LaunchRequestArguments> & { sourceFile?: string; source?: string }>;
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
      const targetName =
        args.target ?? cfg.target ?? cfg.defaultTarget ?? Object.keys(targets)[0];
      const targetCfg =
        (targetName !== undefined ? targets[targetName] : undefined) ??
        undefined;

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

  private normalizePlatformName(args: LaunchRequestArguments): string {
    const raw = args.platform ?? 'simple';
    const name = raw.trim().toLowerCase();
    if (name === '') {
      return 'simple';
    }
    if (name !== 'simple' && name !== 'tec1') {
      throw new Error(`Unsupported platform "${raw}".`);
    }
    return name;
  }

  private assembleBin(
    asm80: { command: string; argsPrefix: string[] },
    asmDir: string,
    asmPath: string,
    hexPath: string,
    binFrom: number,
    binTo: number
  ): void {
    const outDir = path.dirname(hexPath);
    const binPath = path.join(outDir, `${path.basename(hexPath, path.extname(hexPath))}.bin`);
    const wrapperName = `.${path.basename(asmPath, path.extname(asmPath))}.bin.asm`;
    const wrapperPath = path.join(asmDir, wrapperName);
    const wrapper = `.BINFROM ${binFrom}\n.BINTO ${binTo}\n.INCLUDE "${path.basename(
      asmPath
    )}"\n`;
    fs.writeFileSync(wrapperPath, wrapper);

    const outArg = path.relative(asmDir, binPath);
    const wrapperArg = path.relative(asmDir, wrapperPath);
    const result = cp.spawnSync(
      asm80.command,
      [...asm80.argsPrefix, '-m', 'Z80', '-t', 'bin', '-o', outArg, wrapperArg],
      {
        cwd: asmDir,
        encoding: 'utf-8',
      }
    );

    try {
      fs.unlinkSync(wrapperPath);
    } catch {
      /* ignore */
    }

    if (result.error) {
      const message = `asm80 bin failed to start: ${result.error.message ?? String(result.error)}`;
      this.sendEvent(new OutputEvent(`${message}\n`, 'console'));
      throw new Error(message);
    }

    if (result.status !== 0) {
      if (result.stdout) {
        this.sendEvent(new OutputEvent(`asm80 stdout:\n${result.stdout}\n`, 'console'));
      }
      if (result.stderr) {
        this.sendEvent(new OutputEvent(`asm80 stderr:\n${result.stderr}\n`, 'console'));
      }
      const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
      const suffix = output.length > 0 ? `: ${output}` : '';
      throw new Error(`asm80 bin exited with code ${result.status}${suffix}`);
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

  private applyIntelHexToMemory(content: string, memory: Uint8Array): void {
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    for (const line of lines) {
      if (!line.startsWith(':') || line.length < 11) {
        continue;
      }
      const byteCount = parseInt(line.slice(1, 3), 16);
      const address = parseInt(line.slice(3, 7), 16);
      const recordType = parseInt(line.slice(7, 9), 16);
      const dataString = line.slice(9, 9 + byteCount * 2);

      if (recordType === 1) {
        break;
      }
      if (recordType !== 0) {
        continue;
      }
      for (let i = 0; i < byteCount; i += 1) {
        const byteHex = dataString.slice(i * 2, i * 2 + 2);
        const value = parseInt(byteHex, 16);
        const loc = address + i;
        if (loc >= 0 && loc < memory.length) {
          memory[loc] = value & 0xff;
        }
      }
    }
  }

  private applyBinaryToMemory(filePath: string, memory: Uint8Array): void {
    const data = fs.readFileSync(filePath);
    const length = Math.min(data.length, memory.length);
    for (let i = 0; i < length; i += 1) {
      memory[i] = data[i] ?? 0;
    }
  }

  private resolveRomBinPath(filePath: string): string | undefined {
    const lower = filePath.toLowerCase();
    if (lower.endsWith('.bin')) {
      return filePath;
    }
    const parsed = path.parse(filePath);
    if (parsed.ext === '') {
      return undefined;
    }
    return path.join(parsed.dir, `${parsed.name}.bin`);
  }

  private extractRomHex(content: string, filePath: string): string {
    const lower = filePath.toLowerCase();
    if (lower.endsWith('.ts') || lower.endsWith('.js')) {
      const match =
        content.match(/ROM\s*=\s*`([\s\S]*?)`/) ??
        content.match(/`([\s\S]*?)`/);
      if (match && match[1]) {
        return match[1];
      }
    }
    return content;
  }

  private async promptForConfigCreation(_args: LaunchRequestArguments): Promise<boolean> {
    const created = await vscode.commands.executeCommand<boolean>('debug80.createProject');
    return Boolean(created);
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

    const asmDir = path.dirname(asmPath);
    const outDir = path.dirname(hexPath);
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const asm80 = this.resolveAsm80Command(asmDir);
    const outArg = path.relative(asmDir, hexPath);
    const result = cp.spawnSync(
      asm80.command,
      [...asm80.argsPrefix, '-m', 'Z80', '-t', 'hex', '-o', outArg, path.basename(asmPath)],
      {
        cwd: asmDir,
        encoding: 'utf-8',
      }
    );

    if (result.error) {
      const enoent = (result.error as NodeJS.ErrnoException)?.code === 'ENOENT';
      const message = enoent
        ? 'asm80 not found. Install it with "npm install -D asm80" or ensure it is on PATH.'
        : `asm80 failed to start: ${result.error.message ?? String(result.error)}`;
      this.sendEvent(new OutputEvent(`${message}\n`, 'console'));
      throw new Error(message);
    }

    if (result.status !== 0) {
      if (result.stdout) {
        this.sendEvent(new OutputEvent(`asm80 stdout:\n${result.stdout}\n`, 'console'));
      }
      if (result.stderr) {
        this.sendEvent(new OutputEvent(`asm80 stderr:\n${result.stderr}\n`, 'console'));
      }
      const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
      const suffix = output.length > 0 ? `: ${output}` : '';
      throw new Error(`asm80 exited with code ${result.status}${suffix}`);
    }

    const producedListing = path.join(
      path.dirname(hexPath),
      `${path.basename(hexPath, path.extname(hexPath))}.lst`
    );
    if (listingPath !== producedListing && fs.existsSync(producedListing)) {
      const listingDir = path.dirname(listingPath);
      if (!fs.existsSync(listingDir)) {
        fs.mkdirSync(listingDir, { recursive: true });
      }
      fs.copyFileSync(producedListing, listingPath);
    }

    if (
      platform === 'simple' &&
      simpleConfig?.binFrom !== undefined &&
      simpleConfig.binTo !== undefined
    ) {
      this.assembleBin(
        asm80,
        asmDir,
        asmPath,
        hexPath,
        simpleConfig.binFrom,
        simpleConfig.binTo
      );
    }
  }

  private buildIoHandlers(
    platform: string,
    args: LaunchRequestArguments
  ): IoHandlers | undefined {
    if (platform === 'tec1') {
      if (!this.tec1Config) {
        return undefined;
      }
      this.tec1Runtime = createTec1Runtime(
        this.tec1Config,
        (payload) => {
          this.sendEvent(new DapEvent('debug80/tec1Update', payload));
        },
        (byte) => {
          const value = byte & 0xff;
          const text = String.fromCharCode(value);
          this.sendEvent(new DapEvent('debug80/tec1Serial', { byte: value, text }));
        }
      );
      return this.tec1Runtime.ioHandlers;
    }

    const cfg = args.terminal;
    if (cfg === undefined) {
      return undefined;
    }
    const config: TerminalConfigNormalized = {
      txPort: cfg.txPort ?? 0,
      rxPort: cfg.rxPort ?? 1,
      statusPort: cfg.statusPort ?? 2,
      interrupt: cfg.interrupt ?? false,
    };
    this.terminalState = { config, input: [] };
    const ioHandlers: IoHandlers = {
      read: (port: number): number => {
        const p = port & 0xff;
        const term = this.terminalState;
        if (term !== undefined) {
          if (p === term.config.rxPort) {
            const value = term.input.shift();
            return value ?? 0;
          }
          if (p === term.config.statusPort) {
            const rxAvail = term.input.length > 0 ? 1 : 0;
            const txReady = 0b10;
            return rxAvail | txReady;
          }
        }
        return 0;
      },
      write: (port: number, value: number): void => {
        const p = port & 0xff;
        const term = this.terminalState;
        if (term !== undefined && p === term.config.txPort) {
          const byte = value & 0xff;
          const ch = String.fromCharCode(byte);
          this.sendEvent(new DapEvent('debug80/terminalOutput', { text: ch }));
        }
      },
      tick: (): { interrupt?: { nonMaskable?: boolean; data?: number } } | void => {
        const term = this.terminalState;
        if (term !== undefined && term.breakRequested) {
          term.breakRequested = false;
          return { interrupt: { nonMaskable: false, data: 0x38 } };
        }
        return undefined;
      },
    };

    return ioHandlers;
  }

  private findAsm80Binary(startDir: string): string | undefined {
    const candidates =
      process.platform === 'win32'
        ? ['asm80.cmd', 'asm80.exe', 'asm80.ps1', 'asm80']
        : ['asm80'];

    for (let dir = startDir; ; ) {
      const binDir = path.join(dir, 'node_modules', '.bin');
      for (const name of candidates) {
        const candidate = path.join(binDir, name);
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }

      const parent = path.dirname(dir);
      if (parent === dir) {
        break;
      }
      dir = parent;
    }

    const bundled = this.resolveBundledAsm80();
    if (bundled !== undefined) {
      return bundled;
    }

    return undefined;
  }

  private resolveAsm80Command(
    asmDir: string
  ): {
    command: string;
    argsPrefix: string[];
  } {
    const resolved = this.findAsm80Binary(asmDir) ?? 'asm80';
    if (this.shouldInvokeWithNode(resolved)) {
      return { command: process.execPath, argsPrefix: [resolved] };
    }
    return { command: resolved, argsPrefix: [] };
  }

  private shouldInvokeWithNode(command: string): boolean {
    const lower = command.toLowerCase();
    if (
      process.platform === 'win32' &&
      (lower.endsWith('.cmd') || lower.endsWith('.exe') || lower.endsWith('.ps1'))
    ) {
      return false;
    }

    if (!(command.includes(path.sep) || command.includes('/'))) {
      return false;
    }

    const ext = path.extname(command).toLowerCase();
    if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
      return true;
    }

    try {
      const fd = fs.openSync(command, 'r');
      const buffer = Buffer.alloc(160);
      const bytes = fs.readSync(fd, buffer, 0, buffer.length, 0);
      fs.closeSync(fd);
      const firstLine = buffer.toString('utf-8', 0, bytes).split('\n')[0] ?? '';
      return firstLine.startsWith('#!') && firstLine.includes('node');
    } catch {
      return false;
    }
  }

  private applyAllBreakpoints(): DebugProtocol.Breakpoint[] {
    const applied: DebugProtocol.Breakpoint[] = [];
    for (const [source, breakpoints] of this.pendingBreakpointsBySource.entries()) {
      applied.push(...this.applyBreakpointsForSource(source, breakpoints));
    }
    this.rebuildBreakpoints();
    return applied;
  }

  private applyBreakpointsForSource(
    sourcePath: string,
    bps: DebugProtocol.SourceBreakpoint[]
  ): DebugProtocol.Breakpoint[] {
    const listing = this.listing;
    const listingPath = this.listingPath;
    const verified: DebugProtocol.Breakpoint[] = [];

    if (listing === undefined || listingPath === undefined) {
      for (const bp of bps) {
        verified.push({ line: bp.line, verified: false });
      }
      return verified;
    }

    if (this.isListingSource(sourcePath)) {
      for (const bp of bps) {
        const line = bp.line ?? 0;
        const address =
          listing.lineToAddress.get(line) ??
          listing.lineToAddress.get(line + 1); // tolerate 0-based incoming lines
        const ok = address !== undefined;
        verified.push({ line: bp.line, verified: ok });
      }
      return verified;
    }

    for (const bp of bps) {
      const line = bp.line ?? 0;
      const addresses = this.resolveSourceBreakpoint(sourcePath, line);
      const ok = addresses.length > 0;
      verified.push({ line: bp.line, verified: ok });
    }

    return verified;
  }

  private rebuildBreakpoints(): void {
    this.breakpoints.clear();
    if (this.listing === undefined || this.listingPath === undefined) {
      return;
    }

    for (const [source, bps] of this.pendingBreakpointsBySource.entries()) {
      if (this.isListingSource(source)) {
        for (const bp of bps) {
          const line = bp.line ?? 0;
          const address =
            this.listing.lineToAddress.get(line) ??
            this.listing.lineToAddress.get(line + 1);
          if (address !== undefined) {
            this.breakpoints.add(address);
          }
        }
        continue;
      }

      for (const bp of bps) {
        const line = bp.line ?? 0;
        const addresses = this.resolveSourceBreakpoint(source, line);
        const [first] = addresses;
        if (first !== undefined) {
          this.breakpoints.add(first);
        }
      }
    }
  }

  private resolveSourceBreakpoint(sourcePath: string, line: number): number[] {
    const index = this.mappingIndex;
    if (!index) {
      return [];
    }
    return resolveLocation(index, sourcePath, line);
  }

  private isListingSource(sourcePath: string): boolean {
    if (this.listingPath === undefined) {
      return path.extname(sourcePath).toLowerCase() === '.lst';
    }
    return path.resolve(sourcePath) === path.resolve(this.listingPath);
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

  private isDebugMapStale(mapPath: string, listingPath: string): boolean {
    if (!fs.existsSync(mapPath) || !fs.existsSync(listingPath)) {
      return false;
    }
    try {
      const mapStat = fs.statSync(mapPath);
      const listingStat = fs.statSync(listingPath);
      return listingStat.mtimeMs > mapStat.mtimeMs;
    } catch {
      return false;
    }
  }

  private applySourceFallback(
    mapping: MappingParseResult,
    sourceFile: string | undefined,
    baseDir: string
  ): void {
    if (!sourceFile) {
      return;
    }
    if (mapping.anchors.length > 0) {
      return;
    }
    const hasFile = mapping.segments.some((segment) => segment.loc.file !== null);
    if (hasFile) {
      return;
    }
    const fallback = this.resolveFallbackSourceFile(sourceFile, baseDir);
    if (!fallback) {
      return;
    }
    for (const segment of mapping.segments) {
      segment.loc.file = fallback;
    }
  }

  private resolveFallbackSourceFile(sourceFile: string, baseDir: string): string | undefined {
    const resolved = this.resolveRelative(sourceFile, baseDir);
    for (const root of this.sourceRoots) {
      const rel = path.relative(root, resolved);
      if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
        return rel;
      }
    }
    return resolved;
  }

  private loadDebugMap(mapPath: string): ReturnType<typeof buildD8DebugMap> | undefined {
    if (!fs.existsSync(mapPath)) {
      return undefined;
    }
    try {
      const raw = fs.readFileSync(mapPath, 'utf-8');
      const { map, error } = parseD8DebugMap(raw);
      if (!map) {
        this.sendEvent(
          new OutputEvent(
            `Debug80: Invalid D8 debug map at "${mapPath}". Regenerating from LST. (${error})\n`,
            'console'
          )
        );
        return undefined;
      }
      return map;
    } catch (err) {
      this.sendEvent(
        new OutputEvent(
          `Debug80: Failed to read D8 debug map at "${mapPath}". Regenerating from LST. (${String(err)})\n`,
          'console'
        )
      );
      return undefined;
    }
  }

  private writeDebugMap(
    map: ReturnType<typeof buildD8DebugMap>,
    mapPath: string,
    baseDir: string,
    listingPath: string
  ): void {
    try {
      fs.mkdirSync(path.dirname(mapPath), { recursive: true });
      const enriched = {
        ...map,
        generator: {
          ...map.generator,
          inputs: {
            listing: this.relativeIfPossible(listingPath, baseDir),
          },
        },
      };
      fs.writeFileSync(mapPath, JSON.stringify(enriched, null, 2));
    } catch (err) {
      this.sendEvent(
        new OutputEvent(`Debug80: Failed to write D8 debug map: ${String(err)}\n`, 'console')
      );
    }
  }

  private resolveDebugMapPath(
    args: LaunchRequestArguments,
    baseDir: string,
    asmPath: string | undefined,
    listingPath: string
  ): string {
    const artifactBase =
      args.artifactBase ??
      (asmPath ? path.basename(asmPath, path.extname(asmPath)) : path.basename(listingPath, '.lst'));
    const outDirRaw = args.outputDir ?? path.dirname(listingPath);
    const outDir = this.resolveRelative(outDirRaw, baseDir);
    return path.join(outDir, `${artifactBase}.d8dbg.json`);
  }

  private relativeIfPossible(filePath: string, baseDir: string): string {
    const normalizedBase = path.resolve(baseDir);
    const normalizedPath = path.resolve(filePath);
    if (normalizedPath.startsWith(normalizedBase)) {
      return path.relative(normalizedBase, normalizedPath) || normalizedPath;
    }
    return normalizedPath;
  }

  private resolveBundledAsm80(): string | undefined {
    const tryResolve = (id: string): string | undefined => {
      try {
        return require.resolve(id);
      } catch {
        return undefined;
      }
    };

    const direct = tryResolve('asm80/bin/asm80') ?? tryResolve('asm80/bin/asm80.js');
    if (direct !== undefined) {
      return direct;
    }

    const pkg = tryResolve('asm80/package.json');
    if (pkg !== undefined) {
      const root = path.dirname(pkg);
      const bin = path.join(root, 'bin', 'asm80');
      if (fs.existsSync(bin)) {
        return bin;
      }
      const binJs = `${bin}.js`;
      if (fs.existsSync(binJs)) {
        return binJs;
      }
    }

    return undefined;
  }

  private resolveBundledTec1Rom(): string | undefined {
    const extension = vscode.extensions.getExtension('jhlagado.debug80');
    if (!extension) {
      return undefined;
    }
    const candidate = path.join(
      extension.extensionPath,
      'roms',
      'tec1',
      'mon-1b',
      'mon-1b.hex'
    );
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    return undefined;
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
        throw new Error('Z80 runtime requires "asm" (root asm file) or explicit "hex" and "listing" paths.');
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
