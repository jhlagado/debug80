/**
 * @fileoverview Memory snapshot builder for debug adapter requests.
 */

import { findNearestSymbol } from './symbol-service';
import type { SourceMapAnchor } from '../mapping/parser';
import { buildMemorySnapshotViews, clampMemoryWindow } from './memory-view';
import { extractMemorySnapshotPayload, extractViewEntry } from './types';

export type SnapshotRuntime = {
  getRegisters: () => {
    pc: number;
    sp: number;
    b: number;
    c: number;
    d: number;
    e: number;
    h: number;
    l: number;
    ix: number;
    iy: number;
  };
  hardware: {
    memRead?: (addr: number) => number;
    memory: Uint8Array;
  };
};

export type MemorySnapshotContext = {
  runtime: SnapshotRuntime;
  symbolAnchors: SourceMapAnchor[];
  lookupAnchors: SourceMapAnchor[];
  symbolList: Array<{ name: string; address: number }>;
};

export function buildMemorySnapshotResponse(
  args: unknown,
  ctx: MemorySnapshotContext
): {
  before: number;
  rowSize: 8 | 16;
  views: ReturnType<typeof buildMemorySnapshotViews>;
  symbols: Array<{ name: string; address: number }>;
} {
  const payload = extractMemorySnapshotPayload(args);
  const before = clampMemoryWindow(payload.before, 16);
  const rowSize = payload.rowSize === 8 ? 8 : 16;
  const regs = ctx.runtime.getRegisters();
  const pc = regs.pc & 0xffff;
  const sp = regs.sp & 0xffff;
  const bc = ((regs.b & 0xff) << 8) | (regs.c & 0xff);
  const de = ((regs.d & 0xff) << 8) | (regs.e & 0xff);
  const hl = ((regs.h & 0xff) << 8) | (regs.l & 0xff);
  const ix = regs.ix & 0xffff;
  const iy = regs.iy & 0xffff;
  const memRead =
    ctx.runtime.hardware.memRead ??
    ((addr: number): number => ctx.runtime.hardware.memory[addr & 0xffff] ?? 0);
  const viewRequests = payload.views ?? [];
  const views = buildMemorySnapshotViews({
    before,
    rowSize,
    views: viewRequests.map((entry) =>
      extractViewEntry(entry, (value, fallback) => clampMemoryWindow(value, fallback))
    ),
    registers: { pc, sp, bc, de, hl, ix, iy },
    memRead,
    findNearestSymbol: (target) =>
      findNearestSymbol(target, {
        anchors: ctx.symbolAnchors,
        lookupAnchors: ctx.lookupAnchors,
      }),
  });
  return {
    before,
    rowSize,
    views,
    symbols: ctx.symbolList,
  };
}
