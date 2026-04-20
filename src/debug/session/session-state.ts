/**
 * @fileoverview Session state defaults and reset helpers for the debug adapter.
 */

import type { ListingInfo, HexProgram } from '../../z80/loaders';
import type { MappingParseResult, SourceMapAnchor } from '../../mapping/parser';
import type { SourceMapIndex } from '../../mapping/source-map';
import type { CpuStateSnapshot, Z80Runtime } from '../../z80/runtime';
import type { LaunchRequestArguments } from './types';
import type { TerminalState } from './terminal-types';
import type { Tec1Runtime } from '../../platforms/tec1/runtime';
import type { Tec1gRuntime } from '../../platforms/tec1g/runtime';
import type { TecBaseRuntime, TecBaseState } from '../../platforms/tec-common';
import type { Tec1gPlatformConfigNormalized } from '../../platforms/types';

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
 *
 * Implementation note: the five domain-view proxy objects (source,
 * launch, runtimeState, platform, ui) must close over the same backing
 * store as the flat fields.  We therefore build the flat backing object
 * first, construct the proxies referencing it, then merge everything
 * with Object.assign so the returned state is a single object where
 * both the flat fields and the proxy views are present on the same
 * reference — no unsafe casts required.
 */
export function createSessionState(): SessionStateShape {
  // --- flat backing store -------------------------------------------
  // All mutable session fields live here.  The domain-view proxies
  // below are thin get/set facades over these same slots.
  const flat = {
    runtime: undefined as Z80Runtime | undefined,
    listing: undefined as ListingInfo | undefined,
    listingPath: undefined as string | undefined,
    mapping: undefined as MappingParseResult | undefined,
    mappingIndex: undefined as SourceMapIndex | undefined,
    symbolAnchors: [] as SourceMapAnchor[],
    symbolList: [] as Array<{ name: string; address: number }>,
    sourceRoots: [] as string[],
    baseDir: process.cwd(),
    terminalState: undefined as TerminalState | undefined,
    tec1Runtime: undefined as Tec1Runtime | undefined,
    tec1gRuntime: undefined as Tec1gRuntime | undefined,
    platformRuntime: undefined as ActivePlatformRuntime | undefined,
    tec1gConfig: undefined as Tec1gPlatformConfigNormalized | undefined,
    loadedProgram: undefined as HexProgram | undefined,
    loadedEntry: undefined as number | undefined,
    restartCaptureAddress: undefined as number | undefined,
    entryCpuState: undefined as CpuStateSnapshot | undefined,
    launchArgs: undefined as LaunchRequestArguments | undefined,
    extraListingPaths: [] as string[],
    runState: {
      stopOnEntry: false,
      launchComplete: false,
      configurationDone: false,
      isRunning: false,
      haltNotified: false,
      lastStopReason: undefined as StopReason | undefined,
      lastBreakpointAddress: null as number | null,
      skipBreakpointOnce: null as number | null,
      callDepth: 0,
      stepOverMaxInstructions: 0,
      stepOutMaxInstructions: 0,
      pauseRequested: false,
    },
  };

  // --- domain-view proxies -----------------------------------------
  // These close over `flat` so reads/writes go directly to the same
  // backing slots as the flat fields on the final merged state object.
  const source: SessionSourceState = {
    get listing() { return flat.listing; },
    set listing(v) { flat.listing = v; },
    get listingPath() { return flat.listingPath; },
    set listingPath(v) { flat.listingPath = v; },
    get mapping() { return flat.mapping; },
    set mapping(v) { flat.mapping = v; },
    get mappingIndex() { return flat.mappingIndex; },
    set mappingIndex(v) { flat.mappingIndex = v; },
    get symbolAnchors() { return flat.symbolAnchors; },
    set symbolAnchors(v) { flat.symbolAnchors = v; },
    get symbolList() { return flat.symbolList; },
    set symbolList(v) { flat.symbolList = v; },
    get sourceRoots() { return flat.sourceRoots; },
    set sourceRoots(v) { flat.sourceRoots = v; },
    get extraListingPaths() { return flat.extraListingPaths; },
    set extraListingPaths(v) { flat.extraListingPaths = v; },
  };

  const launch: SessionLaunchState = {
    get baseDir() { return flat.baseDir; },
    set baseDir(v) { flat.baseDir = v; },
    get loadedProgram() { return flat.loadedProgram; },
    set loadedProgram(v) { flat.loadedProgram = v; },
    get loadedEntry() { return flat.loadedEntry; },
    set loadedEntry(v) { flat.loadedEntry = v; },
    get restartCaptureAddress() { return flat.restartCaptureAddress; },
    set restartCaptureAddress(v) { flat.restartCaptureAddress = v; },
    get entryCpuState() { return flat.entryCpuState; },
    set entryCpuState(v) { flat.entryCpuState = v; },
    get launchArgs() { return flat.launchArgs; },
    set launchArgs(v) { flat.launchArgs = v; },
  };

  const runtimeState: SessionRuntimeState = {
    get execution() { return flat.runtime; },
    set execution(v) { flat.runtime = v; },
  };

  const platform: SessionPlatformState = {
    get tec1Runtime() { return flat.tec1Runtime; },
    set tec1Runtime(v) { flat.tec1Runtime = v; },
    get tec1gRuntime() { return flat.tec1gRuntime; },
    set tec1gRuntime(v) { flat.tec1gRuntime = v; },
    get platformRuntime() { return flat.platformRuntime; },
    set platformRuntime(v) { flat.platformRuntime = v; },
    get tec1gConfig() { return flat.tec1gConfig; },
    set tec1gConfig(v) { flat.tec1gConfig = v; },
  };

  const ui: SessionUiState = {
    get terminalState() { return flat.terminalState; },
    set terminalState(v) { flat.terminalState = v; },
  };

  // Merge flat backing store + proxy views into the returned state.
  return Object.assign(flat, { source, launch, runtimeState, platform, ui });
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
