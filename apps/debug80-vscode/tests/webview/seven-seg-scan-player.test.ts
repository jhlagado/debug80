import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SevenSegmentScanCycle } from '@jhlagado/debug80-runtime/platforms/tec-common';
import { createSevenSegmentScanPlayer } from '../../webview/common/seven-seg-scan-player';

function makeScan(id: number, startCycle: number, dwellCycles = 10): SevenSegmentScanCycle {
  return {
    id,
    startCycle,
    endCycle: startCycle + 60,
    phases: Array.from({ length: 6 }, (_, digit) => ({
      digitMask: 1 << digit,
      segments: 0x01,
      dwellCycles,
    })),
  };
}

describe('seven-segment scan player', () => {
  let rafCallbacks: FrameRequestCallback[];
  let display: {
    applyDigits: ReturnType<typeof vi.fn>;
    applySegmentIntensities: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    rafCallbacks = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    });
    display = {
      applyDigits: vi.fn(),
      applySegmentIntensities: vi.fn(),
    };
  });

  it('renders full brightness for a clean 1/6-duty scan', () => {
    const player = createSevenSegmentScanPlayer(display);

    player.enqueue([makeScan(0, 0)], 0, 1000);
    rafCallbacks.shift()?.(0);
    rafCallbacks.shift()?.(60);

    const intensities = display.applySegmentIntensities.mock.calls.at(-1)?.[0] as number[];
    expect(intensities).toHaveLength(48);
    for (let digit = 0; digit < 6; digit += 1) {
      expect(intensities[digit * 8]).toBe(1);
    }
  });

  it('preserves reduced brightness for duty-starved scans', () => {
    const player = createSevenSegmentScanPlayer(display);

    player.enqueue([makeScan(0, 0, 5)], 0, 1000);
    rafCallbacks.shift()?.(0);
    rafCallbacks.shift()?.(60);

    const intensities = display.applySegmentIntensities.mock.calls.at(-1)?.[0] as number[];
    expect(intensities[0]).toBeCloseTo(Math.pow(0.5, 1 / 2.2), 5);
  });

  it('suppresses static snapshots during playback and restores them after starvation', () => {
    const player = createSevenSegmentScanPlayer(display);
    const staticLevels = new Array(48).fill(0.25);

    player.enqueue([makeScan(0, 0)], 0, 1000);
    player.renderStatic([0xef], staticLevels);
    expect(display.applySegmentIntensities).not.toHaveBeenCalled();

    rafCallbacks.shift()?.(0);
    rafCallbacks.shift()?.(60);
    for (let frame = 0; frame < 15; frame += 1) {
      rafCallbacks.shift()?.(76 + frame * 16);
    }

    expect(display.applySegmentIntensities).toHaveBeenLastCalledWith(staticLevels);
  });

  it('uses direct digits for static programs without intensity snapshots', () => {
    const player = createSevenSegmentScanPlayer(display);

    player.renderStatic([0xef, 0x01]);

    expect(display.applyDigits).toHaveBeenCalledWith([0xef, 0x01]);
  });
});
