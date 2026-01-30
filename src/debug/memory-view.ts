/**
 * @fileoverview Memory window helpers for debug snapshots.
 */

export type MemoryViewEntry = {
  id?: string;
  view: string;
  after: number;
  address: number | null;
};

export interface MemoryRegisters {
  pc: number;
  sp: number;
  bc: number;
  de: number;
  hl: number;
  ix: number;
  iy: number;
}

export interface MemorySnapshotOptions {
  before: number;
  rowSize: 8 | 16;
  views: MemoryViewEntry[];
  registers: MemoryRegisters;
  memRead: (addr: number) => number;
  findNearestSymbol?: (address: number) => { name: string; address: number } | null;
}

export function clampMemoryWindow(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  if (value <= 0) {
    return fallback;
  }
  return Math.min(1024, Math.floor(value));
}

export function buildMemorySnapshotViews(options: MemorySnapshotOptions): Array<{
  id?: string;
  view: string;
  address: number;
  start: number;
  bytes: number[];
  focus: number;
  after: number;
  symbol: string | null;
  symbolOffset: number | null;
}> {
  const { before, rowSize, views, registers, memRead, findNearestSymbol } = options;
  const pickAddress = (viewValue: string, addressValue: number | null): number => {
    switch (viewValue) {
      case 'pc':
        return registers.pc;
      case 'sp':
        return registers.sp;
      case 'bc':
        return registers.bc;
      case 'de':
        return registers.de;
      case 'hl':
        return registers.hl;
      case 'ix':
        return registers.ix;
      case 'iy':
        return registers.iy;
      case 'absolute':
        return addressValue ?? registers.hl;
      default:
        return registers.hl;
    }
  };

  return views.map((entry) => {
    const target = pickAddress(entry.view, entry.address);
    const window = readMemoryWindow(target, before, entry.after, rowSize, memRead);
    const nearest = findNearestSymbol ? findNearestSymbol(target) : null;
    return {
      ...(entry.id !== undefined ? { id: entry.id } : {}),
      view: entry.view,
      address: target,
      start: window.start,
      bytes: window.bytes,
      focus: window.focus,
      after: entry.after,
      symbol: nearest?.name ?? null,
      symbolOffset: nearest ? (target - nearest.address) & 0xffff : null,
    };
  });
}

export function readMemoryWindow(
  center: number,
  before: number,
  after: number,
  rowSize: number,
  memRead: (addr: number) => number
): { start: number; bytes: number[]; focus: number } {
  const centerAddr = center & 0xffff;
  const rawStart = (centerAddr - before) & 0xffff;
  const alignedStart = rawStart - (rawStart % rowSize);
  const windowSize = before + after + 1;
  const paddedSize = Math.ceil(windowSize / rowSize) * rowSize;
  const bytes = new Array<number>(paddedSize);
  for (let i = 0; i < paddedSize; i += 1) {
    bytes[i] = memRead((alignedStart + i) & 0xffff) & 0xff;
  }
  const focus = (centerAddr - alignedStart) & 0xffff;
  return { start: alignedStart & 0xffff, bytes, focus };
}
