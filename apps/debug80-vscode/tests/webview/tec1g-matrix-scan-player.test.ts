import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMatrixScanPlayer } from '../../webview/tec1g/matrix-scan-player';
import type { Tec1gMatrixScanCycle } from '@jhlagado/debug80-runtime/platforms/tec1g/types';

type FakeGradient = { stops: string[]; addColorStop: (offset: number, color: string) => void };
type FakeFill = { stops: string[]; alpha: number };
type FakeContext = {
  fillStyle: string | FakeGradient;
  globalAlpha: number;
  shadowColor: string;
  shadowBlur: number;
  fills: FakeFill[];
  clearRect: ReturnType<typeof vi.fn>;
  beginPath: ReturnType<typeof vi.fn>;
  arc: ReturnType<typeof vi.fn>;
  fill: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  createRadialGradient: ReturnType<typeof vi.fn>;
};

function makeCycle(id: number, startCycle: number, spanCycles = 80): Tec1gMatrixScanCycle {
  const dwell = spanCycles / 8;
  return {
    id,
    startCycle,
    endCycle: startCycle + spanCycles,
    rows: Array.from({ length: 8 }, (_, row) => ({
      row,
      red: row === 0 ? 0xff : 0,
      green: row === 1 ? 0xff : 0,
      blue: row === 2 ? 0xff : 0,
      dwellCycles: dwell,
    })),
  };
}

function createFakeCanvas(): HTMLCanvasElement & { __ctx: FakeContext } {
  const canvas = document.createElement('canvas') as HTMLCanvasElement & { __ctx: FakeContext };
  canvas.width = 256;
  canvas.height = 256;
  const ctx: FakeContext = {
    fillStyle: '',
    globalAlpha: 1,
    shadowColor: '',
    shadowBlur: 0,
    fills: [],
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(() => {
      const style = ctx.fillStyle;
      ctx.fills.push({
        stops: typeof style === 'string' ? [style] : style.stops,
        alpha: ctx.globalAlpha,
      });
    }),
    save: vi.fn(),
    restore: vi.fn(() => {
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }),
    createRadialGradient: vi.fn((): FakeGradient => {
      const gradient: FakeGradient = {
        stops: [],
        addColorStop: (_offset: number, color: string) => {
          gradient.stops.push(color);
        },
      };
      return gradient;
    }),
  };
  canvas.__ctx = ctx;
  canvas.getContext = vi.fn(() => ctx) as unknown as HTMLCanvasElement['getContext'];
  return canvas;
}

function litFills(ctx: FakeContext, hotCentre: string): FakeFill[] {
  return ctx.fills.filter((f) => f.stops.includes(hotCentre));
}

describe('TEC-1G matrix scan player', () => {
  let rafCallbacks: FrameRequestCallback[];

  beforeEach(() => {
    rafCallbacks = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      rafCallbacks.push(callback);
      return rafCallbacks.length;
    });
  });

  it('renders a full-brightness integrated frame for a clean 1/8-duty scan', () => {
    const canvas = createFakeCanvas();
    const stats = document.createElement('div');
    const player = createMatrixScanPlayer(canvas, stats);

    player.enqueue([makeCycle(7, 700)], 0, 4_000_000);
    expect(rafCallbacks).toHaveLength(1);

    rafCallbacks.shift()?.(0);
    expect(canvas.__ctx.fills).toHaveLength(0);

    rafCallbacks.shift()?.(16);
    // 64 diffuser bases plus one lit overlay per LED in rows 0-2.
    expect(canvas.__ctx.fills).toHaveLength(88);
    expect(litFills(canvas.__ctx, 'rgb(255, 70, 70)')).not.toHaveLength(0);
    expect(litFills(canvas.__ctx, 'rgb(70, 255, 70)')).not.toHaveLength(0);
    expect(litFills(canvas.__ctx, 'rgb(70, 70, 255)')).not.toHaveLength(0);
    expect(litFills(canvas.__ctx, 'rgb(255, 70, 70)')[0]?.alpha).toBe(1);
    expect(canvas.__ctx.fills[0]?.stops).toContain('rgba(255, 255, 255, 0.2)');
    expect(stats.textContent).toContain('SCAN 50000.0 Hz');
    expect(stats.textContent).toContain('dropped 0');
  });

  it('renders reduced intensity when rows are duty-starved', () => {
    const canvas = createFakeCanvas();
    const player = createMatrixScanPlayer(canvas, null);

    // Rows lit 1/16th of the cycle: half of clean-scan duty.
    const cycle = makeCycle(0, 0, 160);
    cycle.rows.forEach((row) => {
      row.dwellCycles = 10;
    });
    player.enqueue([cycle], 0, 4_000_000);
    rafCallbacks.shift()?.(0);
    rafCallbacks.shift()?.(16);

    // normalized duty 0.5 -> gamma 1/2.2 -> intensity ~0.7297
    const red = litFills(canvas.__ctx, 'rgb(255, 70, 70)');
    expect(red).not.toHaveLength(0);
    expect(red[0]?.alpha).toBeCloseTo(0.7297, 3);
  });

  it('jumps the playhead and counts drops when the backlog exceeds max lag', () => {
    const canvas = createFakeCanvas();
    const stats = document.createElement('div');
    const player = createMatrixScanPlayer(canvas, stats);

    // 1 kHz clock so cycle spans are large in wall-clock terms.
    player.enqueue([makeCycle(0, 0)], 0, 1000);
    rafCallbacks.shift()?.(0);
    rafCallbacks.shift()?.(16);

    player.enqueue([makeCycle(1, 1000), makeCycle(2, 2000)], 0, 1000);
    rafCallbacks.shift()?.(32);

    expect(stats.textContent).toContain('dropped 2');
  });

  it('suppresses the latch-state view while scan playback is active', () => {
    const canvas = createFakeCanvas();
    const player = createMatrixScanPlayer(canvas, null);

    player.renderStaticRows([0xff, 0, 0, 0, 0, 0, 0, 0]);
    expect(litFills(canvas.__ctx, 'rgb(255, 70, 70)')).toHaveLength(8);

    canvas.__ctx.fills.length = 0;
    player.enqueue([makeCycle(0, 0)], 0, 4_000_000);
    player.renderStaticRows([0, 0xff, 0, 0, 0, 0, 0, 0]);
    expect(canvas.__ctx.fills).toHaveLength(0);
  });

  it('accumulates runtime drop counts into the stats line', () => {
    const canvas = createFakeCanvas();
    const stats = document.createElement('div');
    const player = createMatrixScanPlayer(canvas, stats);

    player.enqueue([], 5, 4_000_000);
    expect(stats.textContent).toContain('dropped 5');
  });
});
