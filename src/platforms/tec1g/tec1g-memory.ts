/**
 * @file TEC-1G memory hook helpers for shadow/protect/expand behavior.
 */

import type { Tec1gState } from './runtime';
import {
  ADDR_MASK,
  BYTE_MASK,
  TEC1G_EXPAND_END,
  TEC1G_EXPAND_SIZE,
  TEC1G_EXPAND_START,
  TEC1G_PROTECT_END,
  TEC1G_PROTECT_START,
  TEC1G_SHADOW_END,
  TEC1G_SHADOW_SIZE,
  TEC1G_SHADOW_START,
} from '../tec-common';
import { ensureTec1gShadowRom } from './tec1g-shadow';

export type Tec1gMemoryHooks = {
  expandBanks: Uint8Array[];
  memRead: (addr: number) => number;
  memWrite: (addr: number, value: number) => void;
  forceMemWrite: (addr: number, value: number) => void;
  isMemoryWritable: (addr: number) => boolean;
};

/**
 * Copies cartridge-backed expansion data into the active TEC-1G expand banks.
 */
export function applyCartridgeMemory(expandBanks: Uint8Array[], memory: Uint8Array): void {
  const bank0 = expandBanks[0];
  const bank1 = expandBanks[1];
  if (!bank0 || !bank1) {
    return;
  }
  bank0.fill(0x00);
  bank1.fill(0x00);
  bank0.set(memory.slice(TEC1G_EXPAND_START, TEC1G_EXPAND_END + 1));
  bank1.set(
    memory.slice(TEC1G_EXPAND_START + TEC1G_EXPAND_SIZE, TEC1G_EXPAND_START + TEC1G_EXPAND_SIZE * 2)
  );
}

/**
 * Builds memory read/write hooks that apply TEC-1G shadow, protect, and banked expansion logic.
 */
export function createTec1gMemoryHooks(
  baseMemory: Uint8Array,
  romRanges: Array<{ start: number; end: number }>,
  state: Pick<
    Tec1gState['system'],
    'shadowEnabled' | 'protectEnabled' | 'expandEnabled' | 'bankA14'
  >
): Tec1gMemoryHooks {
  const expandBanks: [Uint8Array, Uint8Array] = [
    new Uint8Array(TEC1G_EXPAND_SIZE),
    new Uint8Array(TEC1G_EXPAND_SIZE),
  ];
  const shadowInfo = ensureTec1gShadowRom(baseMemory, romRanges);
  const isRomAddress = (addr: number): boolean =>
    romRanges.some((range) => addr >= range.start && addr <= range.end) ||
    (shadowInfo.shadowCopied && addr >= TEC1G_SHADOW_START && addr <= TEC1G_SHADOW_END);
  const getExpandBank = (): Uint8Array => expandBanks[state.bankA14 ? 1 : 0];

  const memRead = (addr: number): number => {
    const masked = addr & ADDR_MASK;
    if (state.shadowEnabled && masked < TEC1G_SHADOW_SIZE) {
      const shadowAddr = TEC1G_SHADOW_START + masked;
      return baseMemory[shadowAddr] ?? 0;
    }
    if (masked >= TEC1G_EXPAND_START && masked <= TEC1G_EXPAND_END) {
      if (state.expandEnabled) {
        return getExpandBank()[masked - TEC1G_EXPAND_START] ?? 0;
      }
    }
    return baseMemory[masked] ?? 0;
  };

  const isMemoryWritable = (addr: number): boolean => {
    const masked = addr & ADDR_MASK;
    if (masked >= TEC1G_SHADOW_SIZE && isRomAddress(masked)) {
      return false;
    }
    if (state.protectEnabled && masked >= TEC1G_PROTECT_START && masked <= TEC1G_PROTECT_END) {
      return false;
    }
    return true;
  };

  const writeVisibleMemory = (masked: number, value: number): void => {
    if (masked >= TEC1G_EXPAND_START && masked <= TEC1G_EXPAND_END) {
      if (state.expandEnabled) {
        getExpandBank()[masked - TEC1G_EXPAND_START] = value & BYTE_MASK;
        return;
      }
    }
    baseMemory[masked] = value & BYTE_MASK;
  };

  const memWrite = (addr: number, value: number): void => {
    const masked = addr & ADDR_MASK;
    if (!isMemoryWritable(masked)) {
      return;
    }
    writeVisibleMemory(masked, value);
  };

  const forceMemWrite = (addr: number, value: number): void => {
    writeVisibleMemory(addr & ADDR_MASK, value);
  };

  return { expandBanks, memRead, memWrite, forceMemWrite, isMemoryWritable };
}
