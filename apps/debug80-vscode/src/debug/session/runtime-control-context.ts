import type { DebugProtocol } from '@vscode/debugprotocol';
import type { CpuStateSnapshot, Z80Runtime } from '@jhlagado/debug80-runtime/z80/runtime';
import type { Tec1Runtime } from '@jhlagado/debug80-runtime/platforms/tec1/runtime';
import type { Tec1gRuntime } from '@jhlagado/debug80-runtime/platforms/tec1g/runtime';
import type { MatrixKeyCombo } from '@jhlagado/debug80-runtime/platforms/tec1g/matrix-keymap';
import type { Logger } from '../../util/logger';
import type { SourceAddressSpace } from '../../mapping/types';
import type { SourceStateManager } from '../mapping/source-state-manager';
import type { BreakpointManager } from '../mapping/breakpoint-manager';
import type { LaunchSequenceContext, LaunchSessionArtifacts } from '../launch/launch-sequence';
import type { PlatformRegistry } from './platform-registry';
import type { SessionStateShape, StopReason } from './session-state';
import { emitChangedBreakpoints } from './runtime-events';

export interface RuntimeControlContext {
  getRuntime: () => Z80Runtime | undefined;
  getRuntimeCapabilities: () => RuntimeControlCapabilities | undefined;
  getRestartCaptureAddress: () => number | undefined;
  getEntryCpuState: () => CpuStateSnapshot | undefined;
  setEntryCpuState: (snapshot: CpuStateSnapshot | undefined) => void;
  getActivePlatform: () => string;
  getCallDepth: () => number;
  setCallDepth: (value: number) => void;
  getPauseRequested: () => boolean;
  setPauseRequested: (value: boolean) => void;
  getRunning: () => boolean;
  setRunning: (value: boolean) => void;
  getSkipBreakpointOnce: () => number | null;
  setSkipBreakpointOnce: (value: number | null) => void;
  getSkipBreakpointAddressSpace: () => SourceAddressSpace | undefined;
  setSkipBreakpointAddressSpace: (value: SourceAddressSpace | undefined) => void;
  getHaltNotified: () => boolean;
  setHaltNotified: (value: boolean) => void;
  setLastStopReason: (reason: StopReason) => void;
  setLastBreakpointAddress: (address: number | null) => void;
  setLastBreakpointAddressSpace: (addressSpace: SourceAddressSpace | undefined) => void;
  getAddressSpace: (address: number) => SourceAddressSpace | undefined;
  getBreakpointAddressSpace: (address: number) => SourceAddressSpace | undefined;
  isBreakpointAddress: (address: number | null) => boolean;
  handleHaltStop: () => void;
  sendEvent: (event: unknown) => void;
  getLogger?: () => Logger;
}

export type RuntimeStopTarget = {
  address: number;
  addressSpace?: SourceAddressSpace;
};

export interface RuntimeControlCapabilities {
  recordCycles: (cycles: number) => void;
  silenceSpeaker: () => void;
  getClockHz: () => number;
  getYieldMs: () => number;
}

export interface RuntimeControlContextInput {
  sessionState: SessionStateShape;
  activePlatform: () => string;
  isBreakpointAddress: (address: number | null) => boolean;
  getAddressSpace?: (address: number) => SourceAddressSpace | undefined;
  getBreakpointAddressSpace?: (address: number) => SourceAddressSpace | undefined;
  handleHaltStop: () => void;
  sendEvent: (event: unknown) => void;
  logger: Logger;
}

export interface LaunchSequenceContextInput {
  logger: Logger;
  sessionState: SessionStateShape;
  sourceState: SourceStateManager;
  platformRegistry: PlatformRegistry;
  matrixHeldKeys: Map<string, MatrixKeyCombo[]>;
  emitEvent: (event: DebugProtocol.Event) => void;
  emitDapEvent: (name: string, payload: unknown) => void;
  sendResponse: (response: DebugProtocol.Response) => void;
  sendErrorResponse: (response: DebugProtocol.Response, id: number, message: string) => void;
}

export function createRuntimeControlContext(
  input: RuntimeControlContextInput
): RuntimeControlContext {
  const runState = input.sessionState.runState;
  return {
    getRuntime: () => input.sessionState.runtime,
    getRuntimeCapabilities: () =>
      createRuntimeControlCapabilities({
        activePlatform: input.activePlatform(),
        tec1Runtime: input.sessionState.tec1Runtime,
        tec1gRuntime: input.sessionState.tec1gRuntime,
      }),
    getRestartCaptureAddress: () => input.sessionState.restartCaptureAddress,
    getEntryCpuState: () => input.sessionState.entryCpuState,
    setEntryCpuState: (snapshot: CpuStateSnapshot | undefined): void => {
      input.sessionState.entryCpuState = snapshot;
    },
    getActivePlatform: () => input.activePlatform(),
    getCallDepth: () => runState.callDepth,
    setCallDepth: (value: number): void => {
      runState.callDepth = value;
    },
    getPauseRequested: () => runState.pauseRequested,
    setPauseRequested: (value: boolean): void => {
      runState.pauseRequested = value;
    },
    getRunning: () => runState.isRunning,
    setRunning: (value: boolean): void => {
      runState.isRunning = value;
    },
    getSkipBreakpointOnce: () => runState.skipBreakpointOnce,
    setSkipBreakpointOnce: (value: number | null): void => {
      runState.skipBreakpointOnce = value;
    },
    getSkipBreakpointAddressSpace: () => runState.skipBreakpointAddressSpace,
    setSkipBreakpointAddressSpace: (value: SourceAddressSpace | undefined): void => {
      runState.skipBreakpointAddressSpace = value;
    },
    getHaltNotified: () => runState.haltNotified,
    setHaltNotified: (value: boolean): void => {
      runState.haltNotified = value;
    },
    setLastStopReason: (reason: StopReason): void => {
      runState.lastStopReason = reason;
    },
    setLastBreakpointAddress: (address: number | null): void => {
      runState.lastBreakpointAddress = address;
    },
    setLastBreakpointAddressSpace: (addressSpace: SourceAddressSpace | undefined): void => {
      runState.lastBreakpointAddressSpace = addressSpace;
    },
    getAddressSpace: (address: number): SourceAddressSpace | undefined =>
      input.getAddressSpace?.(address),
    getBreakpointAddressSpace: (address: number): SourceAddressSpace | undefined =>
      input.getBreakpointAddressSpace?.(address),
    isBreakpointAddress: (address: number | null): boolean => input.isBreakpointAddress(address),
    handleHaltStop: (): void => input.handleHaltStop(),
    sendEvent: (event: unknown): void => input.sendEvent(event),
    getLogger: (): Logger => input.logger,
  };
}

function createRuntimeControlCapabilities(options: {
  activePlatform: string;
  tec1Runtime: Tec1Runtime | undefined;
  tec1gRuntime: Tec1gRuntime | undefined;
}): RuntimeControlCapabilities | undefined {
  if (options.activePlatform === 'tec1') {
    const runtime = options.tec1Runtime;
    if (runtime === undefined) {
      return undefined;
    }
    return createPlatformRuntimeCapabilities(
      (cycles) => runtime.recordCycles(cycles),
      () => runtime.silenceSpeaker(),
      () => runtime.state.clockHz,
      () => runtime.state.yieldMs
    );
  }
  if (options.activePlatform === 'tec1g') {
    const runtime = options.tec1gRuntime;
    if (runtime === undefined) {
      return undefined;
    }
    return createPlatformRuntimeCapabilities(
      (cycles) => runtime.recordCycles(cycles),
      () => runtime.silenceSpeaker(),
      () => runtime.state.timing.clockHz,
      () => runtime.state.timing.yieldMs
    );
  }
  return undefined;
}

function createPlatformRuntimeCapabilities(
  recordCycles: (cycles: number) => void,
  silenceSpeaker: () => void,
  getClockHz: () => number,
  getYieldMs: () => number
): RuntimeControlCapabilities {
  return { recordCycles, silenceSpeaker, getClockHz, getYieldMs };
}

export function createLaunchSequenceContext(
  input: LaunchSequenceContextInput
): LaunchSequenceContext {
  return input;
}

export interface LaunchArtifactsTarget {
  platformState: { active: string };
  sessionState: SessionStateShape;
}

export function applyLaunchSessionArtifacts(
  target: LaunchArtifactsTarget,
  artifacts: LaunchSessionArtifacts
): void {
  const source = target.sessionState.source;
  const runtimeState = target.sessionState.runtimeState;
  const platform = target.sessionState.platform;
  const launch = target.sessionState.launch;
  const ui = target.sessionState.ui;

  target.platformState.active = artifacts.platform;
  source.mapping = artifacts.mapping;
  source.mappingIndex = artifacts.mappingIndex;
  source.sourceRoots = artifacts.sourceRoots;
  source.symbolAnchors = artifacts.symbolAnchors;
  source.symbolList = artifacts.symbolList;
  source.sourceMapSymbols = artifacts.sourceMapSymbols;
  source.romSourcePaths = artifacts.romSourcePaths;
  source.autoOpenRomSourcePaths = artifacts.autoOpenRomSourcePaths;
  runtimeState.execution = artifacts.runtime;
  ui.terminalState = artifacts.terminalState;
  platform.tec1Runtime = artifacts.tec1Runtime;
  platform.tec1gRuntime = artifacts.tec1gRuntime;
  platform.platformRuntime = artifacts.platformRuntime;
  platform.tec1gConfig = artifacts.tec1gConfig;
  launch.loadedProgram = artifacts.loadedProgram;
  launch.loadedEntry = artifacts.loadedEntry;
  launch.restartCaptureAddress = artifacts.restartCaptureAddress;
  launch.entryCpuState = undefined;
  target.sessionState.runState.callDepth = 0;
  target.sessionState.runState.stepOverMaxInstructions = artifacts.stepOverMaxInstructions;
  target.sessionState.runState.stepOutMaxInstructions = artifacts.stepOutMaxInstructions;
}

export interface LaunchBreakpointsTarget {
  mappingIndex: LaunchSessionArtifacts['mappingIndex'] | undefined;
}

export function applyLaunchBreakpoints(
  breakpointManager: BreakpointManager,
  target: LaunchBreakpointsTarget,
  sendEvent: (event: DebugProtocol.Event) => void
): void {
  const applied = breakpointManager.applyAll(target.mappingIndex);
  emitChangedBreakpoints(sendEvent, applied);
}
