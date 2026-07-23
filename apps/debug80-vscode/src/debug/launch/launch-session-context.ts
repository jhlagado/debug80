import type { MatrixKeyCombo } from '@jhlagado/debug80-runtime/platforms/tec1g/matrix-keymap';
import type { DebugProtocol } from '@vscode/debugprotocol';
import type { Logger } from '../../util/logger';
import type { BreakpointManager } from '../mapping/breakpoint-manager';
import type { SourceStateManager } from '../mapping/source-state-manager';
import { emitChangedBreakpoints } from '../session/runtime-events';
import type { PlatformRegistry } from '../session/platform-registry';
import type { SessionStateShape } from '../session/session-state';
import type { LaunchSequenceContext, LaunchSessionArtifacts } from './launch-sequence';

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
