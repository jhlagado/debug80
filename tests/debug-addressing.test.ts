/**
 * @file Debug addressing helpers tests.
 */

import { describe, it, expect } from 'vitest';
import { getShadowAlias, isBreakpointAddress } from '../src/debug/debug-addressing';
import type { Tec1gRuntime } from '../src/platforms/tec1g/runtime';
import { TEC1G_SHADOW_START } from '../src/platforms/tec-common';

const makeTec1gRuntime = (enabled: boolean): Tec1gRuntime =>
  ({
    state: { shadowEnabled: enabled },
  } as Tec1gRuntime);

describe('debug-addressing', () => {
  it('returns shadow alias only when enabled', () => {
    const runtime = makeTec1gRuntime(true);
    const alias = getShadowAlias(0x0002, { activePlatform: 'tec1g', tec1gRuntime: runtime });
    expect(alias).toBe(TEC1G_SHADOW_START + 0x0002);
    const none = getShadowAlias(0x0002, { activePlatform: 'simple', tec1gRuntime: runtime });
    expect(none).toBeNull();
  });

  it('checks breakpoints with shadow alias', () => {
    const runtime = makeTec1gRuntime(true);
    const hit = isBreakpointAddress(0x0001, {
      hasBreakpoint: (addr) => addr === TEC1G_SHADOW_START + 0x0001,
      activePlatform: 'tec1g',
      tec1gRuntime: runtime,
    });
    expect(hit).toBe(true);
  });
});
