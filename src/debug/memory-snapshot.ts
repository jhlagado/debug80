/**
 * @fileoverview Memory snapshot builder for debug adapter requests.
 */

import { findNearestSymbol } from './symbol-service';
import type { SourceMapAnchor } from '../mapping/parser';
import { buildMemorySnapshotViews, clampMemoryWindow } from './memory-view';
import { extractMemorySnapshotPayload, extractViewEntry } from './types';
import type { Cpu, Flags } from '../z80/types';

export type SnapshotRuntime = {
  getRegisters: () => Cpu;
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
  registers: {
    pc: number;
    sp: number;
    ix: number;
    iy: number;
    i: number;
    r: number;
    af: number;
    bc: number;
    de: number;
    hl: number;
    afp: number;
    bcp: number;
    dep: number;
    hlp: number;
    flags: string;
    flagsPrime: string;
    f: number;
    fp: number;
  };
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
  const f = flagsToByte(regs.flags) & 0xff;
  const fp = flagsToByte(regs.flags_prime) & 0xff;
  const af = ((regs.a & 0xff) << 8) | f;
  const afp = ((regs.a_prime & 0xff) << 8) | fp;
  const bcp = ((regs.b_prime & 0xff) << 8) | (regs.c_prime & 0xff);
  const dep = ((regs.d_prime & 0xff) << 8) | (regs.e_prime & 0xff);
  const hlp = ((regs.h_prime & 0xff) << 8) | (regs.l_prime & 0xff);
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
    registers: {
      pc,
      sp,
      ix,
      iy,
      i: regs.i & 0xff,
      r: regs.r & 0xff,
      af,
      bc,
      de,
      hl,
      afp,
      bcp,
      dep,
      hlp,
      flags: flagsToString(regs.flags),
      flagsPrime: flagsToString(regs.flags_prime),
      f,
      fp,
    },
  };
}

function flagsToByte(flags: Flags): number {
  return (
    (flags.S << 7) |
    (flags.Z << 6) |
    (flags.Y << 5) |
    (flags.H << 4) |
    (flags.X << 3) |
    (flags.P << 2) |
    (flags.N << 1) |
    flags.C
  );
}

function flagsToString(flags: Flags): string {
  const letters: [keyof Flags, string][] = [
    ['S', 's'],
    ['Z', 'z'],
    ['Y', 'y'],
    ['H', 'h'],
    ['X', 'x'],
    ['P', 'p'],
    ['N', 'n'],
    ['C', 'c'],
  ];
  return letters.map(([key, ch]) => (flags[key] ? ch.toUpperCase() : ch)).join('');
}
