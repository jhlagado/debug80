/**
 * @file Memory view helpers tests.
 */

import { describe, it, expect } from 'vitest';
import { buildMemorySnapshotViews, clampMemoryWindow, readMemoryWindow } from '../../src/debug/memory-view';

describe('memory-view', () => {
  it('clamps memory window sizes', () => {
    expect(clampMemoryWindow(undefined, 16)).toBe(16);
    expect(clampMemoryWindow(-5, 16)).toBe(16);
    expect(clampMemoryWindow(2048, 16)).toBe(1024);
    expect(clampMemoryWindow(33.7, 16)).toBe(33);
  });

  it('reads aligned memory windows with focus offset', () => {
    const memRead = (addr: number): number => addr & 0xff;
    const window = readMemoryWindow(0x0010, 2, 3, 8, memRead);
    expect(window.start).toBe(0x0008);
    expect(window.bytes.length).toBe(8);
    expect(window.focus).toBe(0x0010 - 0x0008);
  });

  it('builds snapshot views and resolves symbols', () => {
    const memRead = (addr: number): number => addr & 0xff;
    const views = buildMemorySnapshotViews({
      before: 1,
      rowSize: 8,
      views: [{ id: 'a', view: 'pc', after: 1, address: null }],
      registers: {
        pc: 0x1000,
        sp: 0x2000,
        bc: 0x3000,
        de: 0x4000,
        hl: 0x5000,
        ix: 0x6000,
        iy: 0x7000,
      },
      memRead,
      findNearestSymbol: () => ({ name: 'START', address: 0x0ff0 }),
    });

    expect(views[0]?.address).toBe(0x1000);
    expect(views[0]?.symbol).toBe('START');
    expect(views[0]?.symbolOffset).toBe(0x10);
  });

  it('handles absolute/default views without symbols', () => {
    const memRead = (addr: number): number => addr & 0xff;
    const views = buildMemorySnapshotViews({
      before: 1,
      rowSize: 8,
      views: [
        { view: 'absolute', after: 1, address: null },
        { view: 'unknown', after: 1, address: 0x1234 },
      ],
      registers: {
        pc: 0x1000,
        sp: 0x2000,
        bc: 0x3000,
        de: 0x4000,
        hl: 0x5000,
        ix: 0x6000,
        iy: 0x7000,
      },
      memRead,
    });

    expect(views[0]?.address).toBe(0x5000);
    expect(views[0]?.symbol).toBeNull();
    expect(views[1]?.address).toBe(0x5000);
  });

  it('uses register-based views', () => {
    const memRead = (addr: number): number => addr & 0xff;
    const views = buildMemorySnapshotViews({
      before: 1,
      rowSize: 8,
      views: [
        { view: 'sp', after: 1, address: null },
        { view: 'ix', after: 1, address: null },
        { view: 'iy', after: 1, address: null },
      ],
      registers: {
        pc: 0x1000,
        sp: 0x2000,
        bc: 0x3000,
        de: 0x4000,
        hl: 0x5000,
        ix: 0x6000,
        iy: 0x7000,
      },
      memRead,
    });

    expect(views[0]?.address).toBe(0x2000);
    expect(views[1]?.address).toBe(0x6000);
    expect(views[2]?.address).toBe(0x7000);
  });
});
