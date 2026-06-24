/**
 * @file TEC-1G expansion ROM loading helpers.
 */

import fs from 'fs';
import { TEC1G_EXPAND_SIZE, TEC1G_EXPAND_START } from '../tec-common';
import { extractRomHex } from '../../debug/launch/program-loader';
import { parseIntelHex } from '../../z80/loaders';

export type Tec1gExpansionRomImage = {
  memory: Uint8Array;
  bootEntry: number | null;
};

/**
 * Returns whether the loaded image contains any non-zero data in the expansion region.
 */
function isTec1gExpansionRomBootable(memory: Uint8Array): boolean {
  for (let addr = TEC1G_EXPAND_START; addr < 0x10000; addr += 1) {
    if (memory[addr] !== 0) {
      return true;
    }
  }
  return false;
}

/**
 * Loads a TEC-1G expansion ROM image from either raw binary or Intel HEX content.
 */
export function loadTec1gExpansionRomImage(expansionRomPath: string): Tec1gExpansionRomImage {
  const lower = expansionRomPath.toLowerCase();
  let memory: Uint8Array;
  if (lower.endsWith('.bin')) {
    const buffer = fs.readFileSync(expansionRomPath);
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
    const content = fs.readFileSync(expansionRomPath, 'utf-8');
    const hexContent = extractRomHex(content, expansionRomPath);
    memory = parseIntelHex(hexContent).memory;
  }
  const bootEntry = isTec1gExpansionRomBootable(memory) ? TEC1G_EXPAND_START : null;
  return { memory, bootEntry };
}
