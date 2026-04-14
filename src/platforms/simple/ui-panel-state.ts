/**
 * @file Simple platform panel UI state.
 *
 * The simple platform has no hardware display or peripherals, so the UI
 * state is empty and all update/clear messages are no-ops.
 */

export type SimpleUiState = Record<string, never>;

export function createSimpleUiState(): SimpleUiState {
  return {} as SimpleUiState;
}

export function resetSimpleUiState(_state: SimpleUiState): void {
  // no hardware state to reset
}

export function applySimpleUpdate(
  _state: SimpleUiState,
  _payload: unknown
): Record<string, unknown> {
  return {};
}
