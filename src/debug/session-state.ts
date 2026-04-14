/**
 * @fileoverview Session state defaults and reset helpers for the debug adapter.
 */

import type { ListingInfo, HexProgram } from '../z80/loaders';
import type { MappingParseResult, SourceMapAnchor } from '../mapping/parser';
import type { SourceMapIndex } from '../mapping/source-map';
import type { CpuStateSnapshot, Z80Runtime } from '../z80/runtime';
import type { LaunchRequestArguments } from './types';
import type { TerminalState } from './terminal-types';
import type { Tec1Runtime } from '../platforms/tec1/runtime';
import type { Tec1gRuntime } from '../platforms/tec1g/runtime';
import type { TecBaseRuntime, TecBaseState } from '../platforms/tec-common';
import type { Tec1gPlatformConfigNormalized } from '../platforms/types';

/**
 * Reasons a debug session can stop.
 */
export type StopReason = 'breakpoint' | 'step' | 'halt' | 'entry' | 'pause';

export type ActivePlatformRuntime = Pick<
  TecBaseRuntime<TecBaseState>,
  'recordCycles' | 'silenceSpeaker'
>;

export interface SessionSourceState {
  listing: ListingInfo | undefined;
  listingPath: string | undefined;
  mapping: MappingParseResult | undefined;
  mappingIndex: SourceMapIndex | undefined;
  symbolAnchors: SourceMapAnchor[];
  symbolList: Array<{ name: string; address: number }>;
  sourceRoots: string[];
  extraListingPaths: string[];
}

export interface SessionLaunchState {
  baseDir: string;
  loadedProgram: HexProgram | undefined;
  loadedEntry: number | undefined;
  restartCaptureAddress: number | undefined;
  entryCpuState: CpuStateSnapshot | undefined;
  launchArgs: LaunchRequestArguments | undefined;
}

export interface SessionRuntimeState {
  execution: Z80Runtime | undefined;
}

export interface SessionPlatformState {
  tec1Runtime: Tec1Runtime | undefined;
  tec1gRuntime: Tec1gRuntime | undefined;
  platformRuntime: ActivePlatformRuntime | undefined;
  tec1gConfig: Tec1gPlatformConfigNormalized | undefined;
}

export interface SessionUiState {
  terminalState: TerminalState | undefined;
}

/**
 * Subset of Z80DebugSession fields that are reset per launch.
 */
export interface SessionStateShape {
  runtime: Z80Runtime | undefined;
  listing: ListingInfo | undefined;
  listingPath: string | undefined;
  mapping: MappingParseResult | undefined;
  mappingIndex: SourceMapIndex | undefined;
  symbolAnchors: SourceMapAnchor[];
  symbolList: Array<{ name: string; address: number }>;
  sourceRoots: string[];
  baseDir: string;
  terminalState: TerminalState | undefined;
  tec1Runtime: Tec1Runtime | undefined;
  tec1gRuntime: Tec1gRuntime | undefined;
  platformRuntime: ActivePlatformRuntime | undefined;
  tec1gConfig: Tec1gPlatformConfigNormalized | undefined;
  loadedProgram: HexProgram | undefined;
  loadedEntry: number | undefined;
  restartCaptureAddress: number | undefined;
  entryCpuState: CpuStateSnapshot | undefined;
  launchArgs: LaunchRequestArguments | undefined;
  extraListingPaths: string[];
  /**
   * Domain-scoped mutable views over the same backing fields.
   * New code should prefer these grouped objects to reduce coupling.
   */
  source: SessionSourceState;
  launch: SessionLaunchState;
  runtimeState: SessionRuntimeState;
  platform: SessionPlatformState;
  ui: SessionUiState;
  runState: RunState;
}

/**
 * Runtime control state for stepping/breakpoint flow.
 */
export interface RunState {
  stopOnEntry: boolean;
  launchComplete: boolean;
  configurationDone: boolean;
  isRunning: boolean;
  haltNotified: boolean;
  lastStopReason: StopReason | undefined;
  lastBreakpointAddress: number | null;
  skipBreakpointOnce: number | null;
  callDepth: number;
  stepOverMaxInstructions: number;
  stepOutMaxInstructions: number;
  pauseRequested: boolean;
}

/**
 * Creates a fresh session state object with default values.
 */
export function createSessionState(): SessionStateShape {
  const state = {
    runtime: undefined,
    listing: undefined,
    listingPath: undefined,
    mapping: undefined,
    mappingIndex: undefined,
    symbolAnchors: [],
    symbolList: [],
    sourceRoots: [],
    baseDir: process.cwd(),
    terminalState: undefined,
    tec1Runtime: undefined,
    tec1gRuntime: undefined,
    platformRuntime: undefined,
    tec1gConfig: undefined,
    loadedProgram: undefined,
    loadedEntry: undefined,
    restartCaptureAddress: undefined,
    entryCpuState: undefined,
    launchArgs: undefined,
    extraListingPaths: [],
    source: undefined as unknown as SessionSourceState,
    launch: undefined as unknown as SessionLaunchState,
    runtimeState: undefined as unknown as SessionRuntimeState,
    platform: undefined as unknown as SessionPlatformState,
    ui: undefined as unknown as SessionUiState,
    runState: {
      stopOnEntry: false,
      launchComplete: false,
      configurationDone: false,
      isRunning: false,
      haltNotified: false,
      lastStopReason: undefined,
      lastBreakpointAddress: null,
      skipBreakpointOnce: null,
      callDepth: 0,
      stepOverMaxInstructions: 0,
      stepOutMaxInstructions: 0,
      pauseRequested: false,
    },
  } as SessionStateShape;

  state.source = {
    get listing(): ListingInfo | undefined {
      return state.listing;
    },
    set listing(value) {
      state.listing = value;
    },
    get listingPath(): string | undefined {
      return state.listingPath;
    },
    set listingPath(value) {
      state.listingPath = value;
    },
    get mapping(): MappingParseResult | undefined {
      return state.mapping;
    },
    set mapping(value) {
      state.mapping = value;
    },
    get mappingIndex(): SourceMapIndex | undefined {
      return state.mappingIndex;
    },
    set mappingIndex(value) {
      state.mappingIndex = value;
    },
    get symbolAnchors(): SourceMapAnchor[] {
      return state.symbolAnchors;
    },
    set symbolAnchors(value) {
      state.symbolAnchors = value;
    },
    get symbolList(): Array<{ name: string; address: number }> {
      return state.symbolList;
    },
    set symbolList(value) {
      state.symbolList = value;
    },
    get sourceRoots(): string[] {
      return state.sourceRoots;
    },
    set sourceRoots(value) {
      state.sourceRoots = value;
    },
    get extraListingPaths(): string[] {
      return state.extraListingPaths;
    },
    set extraListingPaths(value) {
      state.extraListingPaths = value;
    },
  };

  state.launch = {
    get baseDir(): string {
      return state.baseDir;
    },
    set baseDir(value) {
      state.baseDir = value;
    },
    get loadedProgram(): HexProgram | undefined {
      return state.loadedProgram;
    },
    set loadedProgram(value) {
      state.loadedProgram = value;
    },
    get loadedEntry(): number | undefined {
      return state.loadedEntry;
    },
    set loadedEntry(value) {
      state.loadedEntry = value;
    },
    get restartCaptureAddress(): number | undefined {
      return state.restartCaptureAddress;
    },
    set restartCaptureAddress(value) {
      state.restartCaptureAddress = value;
    },
    get entryCpuState(): CpuStateSnapshot | undefined {
      return state.entryCpuState;
    },
    set entryCpuState(value) {
      state.entryCpuState = value;
    },
    get launchArgs(): LaunchRequestArguments | undefined {
      return state.launchArgs;
    },
    set launchArgs(value) {
      state.launchArgs = value;
    },
  };

  state.runtimeState = {
    get execution(): Z80Runtime | undefined {
      return state.runtime;
    },
    set execution(value) {
      state.runtime = value;
    },
  };

  state.platform = {
    get tec1Runtime(): Tec1Runtime | undefined {
      return state.tec1Runtime;
    },
    set tec1Runtime(value) {
      state.tec1Runtime = value;
    },
    get tec1gRuntime(): Tec1gRuntime | undefined {
      return state.tec1gRuntime;
    },
    set tec1gRuntime(value) {
      state.tec1gRuntime = value;
    },
    get platformRuntime(): ActivePlatformRuntime | undefined {
      return state.platformRuntime;
    },
    set platformRuntime(value) {
      state.platformRuntime = value;
    },
    get tec1gConfig(): Tec1gPlatformConfigNormalized | undefined {
      return state.tec1gConfig;
    },
    set tec1gConfig(value) {
      state.tec1gConfig = value;
    },
  };

  state.ui = {
    get terminalState(): TerminalState | undefined {
      return state.terminalState;
    },
    set terminalState(value) {
      state.terminalState = value;
    },
  };

  return state;
}

/**
 * Applies default state values to an existing session object.
 *
 * @param target - Session state to reset
 */
export function resetSessionState(target: SessionStateShape): void {
  const next = createSessionState();
  target.runtime = next.runtime;
  target.listing = next.listing;
  target.listingPath = next.listingPath;
  target.mapping = next.mapping;
  target.mappingIndex = next.mappingIndex;
  target.symbolAnchors = next.symbolAnchors;
  target.symbolList = next.symbolList;
  target.sourceRoots = next.sourceRoots;
  target.baseDir = next.baseDir;
  target.terminalState = next.terminalState;
  target.tec1Runtime = next.tec1Runtime;
  target.tec1gRuntime = next.tec1gRuntime;
  target.platformRuntime = next.platformRuntime;
  target.tec1gConfig = next.tec1gConfig;
  target.loadedProgram = next.loadedProgram;
  target.loadedEntry = next.loadedEntry;
  target.restartCaptureAddress = next.restartCaptureAddress;
  target.entryCpuState = next.entryCpuState;
  target.launchArgs = next.launchArgs;
  target.extraListingPaths = next.extraListingPaths;
  target.runState.stopOnEntry = next.runState.stopOnEntry;
  target.runState.launchComplete = next.runState.launchComplete;
  target.runState.configurationDone = next.runState.configurationDone;
  target.runState.isRunning = next.runState.isRunning;
  target.runState.haltNotified = next.runState.haltNotified;
  target.runState.lastStopReason = next.runState.lastStopReason;
  target.runState.lastBreakpointAddress = next.runState.lastBreakpointAddress;
  target.runState.skipBreakpointOnce = next.runState.skipBreakpointOnce;
  target.runState.callDepth = next.runState.callDepth;
  target.runState.stepOverMaxInstructions = next.runState.stepOverMaxInstructions;
  target.runState.stepOutMaxInstructions = next.runState.stepOutMaxInstructions;
  target.runState.pauseRequested = next.runState.pauseRequested;
}
