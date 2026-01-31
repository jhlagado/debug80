/**
 * @file TEC-1G panel memory view helpers.
 */

export type MemoryViewState = {
  viewModes: Record<string, string>;
  viewAfter: Record<string, number>;
  viewAddress: Record<string, number | undefined>;
};

/**
 * Creates default memory view state for the TEC-1G panel.
 */
export function createMemoryViewState(): MemoryViewState {
  return {
    viewModes: { a: 'pc', b: 'sp', c: 'hl', d: 'de' },
    viewAfter: { a: 16, b: 16, c: 16, d: 16 },
    viewAddress: { a: undefined, b: undefined, c: undefined, d: undefined },
  };
}

/**
 * Applies updated memory view selections from the webview.
 */
export function applyMemoryViews(
  state: MemoryViewState,
  views: Array<{ id?: string; view?: string; after?: number; address?: number }>
): void {
  for (const entry of views) {
    const id = typeof entry.id === 'string' ? entry.id : '';
    if (id !== 'a' && id !== 'b' && id !== 'c' && id !== 'd') {
      continue;
    }
    const currentAfter = state.viewAfter[id] ?? 16;
    const afterSize = Number.isFinite(entry.after) ? (entry.after as number) : currentAfter;
    state.viewAfter[id] = clampWindow(afterSize);
    const currentView = state.viewModes[id] ?? 'hl';
    state.viewModes[id] = typeof entry.view === 'string' ? entry.view : currentView;
    state.viewAddress[id] =
      typeof entry.address === 'number' && Number.isFinite(entry.address)
        ? (entry.address & 0xffff)
        : undefined;
  }
}

/**
 * Clamps memory window size to a safe range.
 */
function clampWindow(value: number): number {
  if (!Number.isFinite(value) || value < 1) {
    return 16;
  }
  return Math.min(1024, Math.max(1, Math.floor(value)));
}
