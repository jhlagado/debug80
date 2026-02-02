/**
 * @fileoverview TEC-1G cartridge loading helpers.
 */

import fs from 'fs';
import { TEC1G_EXPAND_SIZE, TEC1G_EXPAND_START } from '../platforms/tec-common';
import { extractRomHex } from './program-loader';
import { parseIntelHex } from '../z80/loaders';

export type Tec1gCartridgeImage = {
  memory: Uint8Array;
  bootEntry: number | null;
};

export function isTec1gCartridgeBootable(memory: Uint8Array): boolean {
  for (let addr = TEC1G_EXPAND_START; addr < 0x10000; addr += 1) {
    if (memory[addr] !== 0) {
      return true;
    }
  }
  return false;
}

export function loadTec1gCartridgeImage(cartridgePath: string): Tec1gCartridgeImage {
  const lower = cartridgePath.toLowerCase();
  let memory: Uint8Array;
  if (lower.endsWith('.bin')) {
    const buffer = fs.readFileSync(cartridgePath);
    const bytes = new Uint8Array(buffer);
    memory = new Uint8Array(0x10000);
    const first = Math.min(bytes.length, TEC1G_EXPAND_SIZE);
    memory.set(bytes.slice(0, first), TEC1G_EXPAND_START);
    if (bytes.length > TEC1G_EXPAND_SIZE) {
      const second = Math.min(bytes.length - TEC1G_EXPAND_SIZE, TEC1G_EXPAND_SIZE);
      memory.set(
        bytes.slice(TEC1G_EXPAND_SIZE, TEC1G_EXPAND_SIZE + second),
        TEC1G_EXPAND_START + TEC1G_EXPAND_SIZE
      );
    }
  } else {
    const content = fs.readFileSync(cartridgePath, 'utf-8');
    const hexContent = extractRomHex(content, cartridgePath);
    memory = parseIntelHex(hexContent).memory;
  }
  const bootEntry = isTec1gCartridgeBootable(memory) ? TEC1G_EXPAND_START : null;
  return { memory, bootEntry };
}
