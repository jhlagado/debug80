/**
 * @file Debug addressing helpers tests.
 */

import { describe, it, expect } from 'vitest';
import type { Tec1gRuntime } from '../../src/platforms/tec1g/runtime';
import { ADDR_MASK, TEC1G_SHADOW_START, TEC1G_SHADOW_SIZE } from '../../src/platforms/tec-common';
import { getShadowAlias, isBreakpointAddress } from '../../src/debug/debug-addressing';

const makeRuntime = (shadowEnabled: boolean): Tec1gRuntime =>
  ({
    state: {
      sysCtrl: 0,
      shadowEnabled,
      protectEnabled: false,
      expandEnabled: false,
    },
    ioHandlers: {},
    applyKey: () => {},
    queueSerial: () => {},
    recordCycles: () => {},
    silenceSpeaker: () => {},
    setSpeed: () => {},
    resetState: () => {},
    queueUpdate: () => {},
  }) as Tec1gRuntime;

describe('debug-addressing', () => {
  it('returns null when not on tec1g', () => {
    const alias = getShadowAlias(0x10, { activePlatform: 'simple', tec1gRuntime: undefined });
    expect(alias).toBeNull();
  });

  it('returns null when shadow is disabled', () => {
    const alias = getShadowAlias(0x10, { activePlatform: 'tec1g', tec1gRuntime: makeRuntime(false) });
    expect(alias).toBeNull();
  });

  it('returns shadow alias within range', () => {
    const alias = getShadowAlias(0x10, { activePlatform: 'tec1g', tec1gRuntime: makeRuntime(true) });
    const expected = (TEC1G_SHADOW_START + 0x10) & ADDR_MASK;
    expect(alias).toBe(expected);
  });

  it('returns null for out-of-range shadow address', () => {
    const alias = getShadowAlias(TEC1G_SHADOW_SIZE, {
      activePlatform: 'tec1g',
      tec1gRuntime: makeRuntime(true),
    });
    expect(alias).toBeNull();
  });

  it('matches breakpoints at shadow aliases', () => {
    const runtime = makeRuntime(true);
    const hasBreakpoint = (addr: number) =>
      addr === ((TEC1G_SHADOW_START + 0x20) & ADDR_MASK);
    const hit = isBreakpointAddress(0x20, {
      hasBreakpoint,
      activePlatform: 'tec1g',
      tec1gRuntime: runtime,
    });
    expect(hit).toBe(true);
  });
});
