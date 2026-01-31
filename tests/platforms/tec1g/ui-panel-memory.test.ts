/**
 * @file TEC-1G UI panel memory view tests.
 */

import { describe, it, expect } from 'vitest';
import { applyMemoryViews, createMemoryViewState } from '../../../src/platforms/tec1g/ui-panel-memory';

describe('tec1g ui-panel-memory', () => {
  it('creates default memory view state', () => {
    const state = createMemoryViewState();
    expect(state.viewModes.a).toBe('pc');
    expect(state.viewAfter.d).toBe(16);
    expect(state.viewAddress.b).toBeUndefined();
  });

  it('applies view changes with clamping and defaults', () => {
    const state = createMemoryViewState();
    applyMemoryViews(state, [
      { id: 'a', view: 'sp', after: 32, address: 0x1234 },
      { id: 'b', after: -1 },
      { id: 'x', view: 'pc' },
      { id: 'c', view: undefined, after: 2048, address: NaN },
    ]);

    expect(state.viewModes.a).toBe('sp');
    expect(state.viewAfter.a).toBe(32);
    expect(state.viewAddress.a).toBe(0x1234);

    expect(state.viewAfter.b).toBe(16);
    expect(state.viewModes.b).toBe('sp');

    expect(state.viewAfter.c).toBe(1024);
    expect(state.viewAddress.c).toBeUndefined();
    expect(state.viewModes.c).toBe('hl');
  });
});
