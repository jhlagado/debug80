/**
 * @fileoverview Session state defaults and reset helpers for the debug adapter.
 */

import type { ListingInfo, HexProgram } from '../z80/loaders';
import type { MappingParseResult, SourceMapAnchor } from '../mapping/parser';
import type { SourceMapIndex } from '../mapping/source-map';
import type { Z80Runtime } from '../z80/runtime';
import type { TerminalState } from './types';
import type { Tec1Runtime } from '../platforms/tec1/runtime';
import type { Tec1gRuntime } from '../platforms/tec1g/runtime';
import type { Tec1gPlatformConfigNormalized } from '../platforms/types';

/**
 * Reasons a debug session can stop.
 */
export type StopReason = 'breakpoint' | 'step' | 'halt' | 'entry' | 'pause';

/**
 * Subset of Z80DebugSession fields that are reset per launch.
 */
export interface SessionStateShape {
  haltNotified: boolean;
  breakpoints: Set<number>;
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
  tec1gConfig: Tec1gPlatformConfigNormalized | undefined;
  loadedProgram: HexProgram | undefined;
  loadedEntry: number | undefined;
  extraListingPaths: string[];
  lastStopReason: StopReason | undefined;
  lastBreakpointAddress: number | null;
  skipBreakpointOnce: number | null;
  pauseRequested: boolean;
  stepOverMaxInstructions: number;
  stepOutMaxInstructions: number;
}

/**
 * Creates a fresh session state object with default values.
 */
export function createSessionState(): SessionStateShape {
  return {
    haltNotified: false,
    breakpoints: new Set<number>(),
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
    tec1gConfig: undefined,
    loadedProgram: undefined,
    loadedEntry: undefined,
    extraListingPaths: [],
    lastStopReason: undefined,
    lastBreakpointAddress: null,
    skipBreakpointOnce: null,
    pauseRequested: false,
    stepOverMaxInstructions: 0,
    stepOutMaxInstructions: 0,
  };
}

/**
 * Applies default state values to an existing session object.
 *
 * @param target - Session state to reset
 */
export function resetSessionState(target: SessionStateShape): void {
  Object.assign(target, createSessionState());
}
