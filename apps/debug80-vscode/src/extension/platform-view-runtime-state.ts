/**
 * @file Runtime UI state helpers for the Debug80 platform view.
 */

import type { MemoryViewState } from '../platforms/panel-memory';
import type { PlatformUiModules } from './platform-view-manifest';
import { clearPlatformSerial, type SerialBuffer } from './platform-view-serial-state';

export interface PlatformRuntimeState {
  uiState: unknown;
  hasPostedRuntimeUpdate: boolean;
  serialBuffer: SerialBuffer;
  memoryViews: MemoryViewState;
}

/**
 * Applies an adapter update and returns the message payload for the webview.
 */
export function applyPlatformRuntimeUpdate(
  modules: PlatformUiModules,
  state: PlatformRuntimeState,
  payload: unknown,
  uiRevision: number
): Record<string, unknown> {
  const updateFields = modules.applyUpdate(state.uiState, payload);
  state.hasPostedRuntimeUpdate = true;
  return { type: 'update', uiRevision, ...updateFields };
}

/**
 * Builds a render-time update message for the current runtime state.
 */
export function buildPlatformRuntimeUpdateMessage(
  modules: PlatformUiModules,
  state: Pick<PlatformRuntimeState, 'uiState'>,
  uiRevision: number
): Record<string, unknown> {
  return modules.buildUpdateMessage(state.uiState, uiRevision);
}

/**
 * Resets one platform's runtime UI, memory, and serial state.
 */
export function clearPlatformRuntimeState(
  modules: PlatformUiModules,
  state: PlatformRuntimeState
): void {
  modules.resetUiState(state.uiState);
  state.memoryViews = modules.createMemoryViewState();
  state.hasPostedRuntimeUpdate = false;
  clearPlatformSerial(state.serialBuffer);
}

/**
 * Builds a clear message for a platform after its state has been reset.
 */
export function buildPlatformRuntimeClearMessage(
  modules: PlatformUiModules,
  state: Pick<PlatformRuntimeState, 'uiState'>,
  uiRevision: number
): Record<string, unknown> {
  return modules.buildClearMessage(state.uiState, uiRevision);
}
