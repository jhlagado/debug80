/**
 * @file Memory snapshot helper tests.
 */

import { describe, it, expect } from 'vitest';
import { buildMemorySnapshotResponse } from '../src/debug/memory-snapshot';

describe('memory-snapshot', () => {
  it('builds snapshot views and forwards symbols', () => {
    const memory = new Uint8Array(0x10000);
    for (let i = 0; i < 256; i += 1) {
      memory[i] = i & 0xff;
    }
    const runtime = {
      getRegisters: () => ({
        pc: 0x10,
        sp: 0x20,
        b: 0x01,
        c: 0x02,
        d: 0x03,
        e: 0x04,
        h: 0x05,
        l: 0x06,
        ix: 0x30,
        iy: 0x40,
      }),
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
