/**
 * @file Memory snapshot helper tests.
 */

import { describe, it, expect } from 'vitest';
import { buildMemorySnapshotResponse } from '../../src/debug/memory-snapshot';
import { init as initCpu } from '../../src/z80/cpu';

describe('memory-snapshot', () => {
  it('builds snapshot views and forwards symbols', () => {
    const memory = new Uint8Array(0x10000);
    for (let i = 0; i < 256; i += 1) {
      memory[i] = i & 0xff;
    }
    const cpu = initCpu();
    cpu.pc = 0x10;
    cpu.sp = 0x20;
    cpu.b = 0x01;
    cpu.c = 0x02;
    cpu.d = 0x03;
    cpu.e = 0x04;
    cpu.h = 0x05;
    cpu.l = 0x06;
    cpu.ix = 0x30;
    cpu.iy = 0x40;
    const runtime = {
      getRegisters: () => cpu,
      hardware: { memory },
    };

    const snapshot = buildMemorySnapshotResponse(
      {
        before: 8,
        rowSize: 8,
        views: [{ view: 'pc', after: 8 }],
      },
      {
        runtime,
        symbolAnchors: [],
        lookupAnchors: [],
        symbolList: [{ name: 'ENTRY', address: 0x10 }],
      }
    );

    expect(snapshot.before).toBe(8);
    expect(snapshot.rowSize).toBe(8);
    expect(snapshot.views).toHaveLength(1);
    expect(snapshot.views[0]?.address).toBe(0x10);
    expect(snapshot.symbols).toEqual([{ name: 'ENTRY', address: 0x10 }]);
  });
});
