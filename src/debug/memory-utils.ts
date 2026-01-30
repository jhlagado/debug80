/**
 * @fileoverview Memory operations for the Z80 debug adapter.
 * Handles memory reading, windows, and Intel HEX manipulation.
 */

import * as fs from 'fs';
import { MemoryWindow } from './types';
import { Z80_ADDRESS_SPACE, BYTE_MASK, ADDR_MASK } from '../platforms/tec-common';

// Re-export for backward compatibility
export { Z80_ADDRESS_SPACE };

/**
 * Default window size for memory viewing.
 */
export const DEFAULT_MEMORY_WINDOW = 16;

/**
 * Maximum memory window size.
 */
export const MAX_MEMORY_WINDOW = 1024;

/**
 * Clamps a memory window size to valid bounds.
 *
 * @param value - The value to clamp
 * @param fallback - Fallback value if invalid
 * @returns Clamped window size
 */
export function clampMemoryWindow(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  if (value <= 0) {
    return fallback;
  }
  return Math.min(MAX_MEMORY_WINDOW, Math.floor(value));
}

/**
 * Reads a memory window centered on an address.
 *
 * @param center - Center address of the window
 * @param before - Number of bytes before center
 * @param after - Number of bytes after center
 * @param rowSize - Row size for alignment (8 or 16)
 * @param memRead - Function to read memory
 * @returns Memory window with bytes and focus offset
 */
export function readMemoryWindow(
  center: number,
  before: number,
  after: number,
  rowSize: number,
  memRead: (addr: number) => number
): MemoryWindow {
  const centerAddr = center & ADDR_MASK;
  const rawStart = (centerAddr - before) & ADDR_MASK;
  const alignedStart = rawStart - (rawStart % rowSize);
  const windowSize = before + after + 1;
  const paddedSize = Math.ceil(windowSize / rowSize) * rowSize;

  const bytes = new Array<number>(paddedSize);
  for (let i = 0; i < paddedSize; i += 1) {
    bytes[i] = memRead((alignedStart + i) & ADDR_MASK) & BYTE_MASK;
  }

  const focus = (centerAddr - alignedStart) & ADDR_MASK;
  return { start: alignedStart & ADDR_MASK, bytes, focus };
}

/**
 * Applies Intel HEX content to a memory array.
 *
 * @param content - Intel HEX file content
 * @param memory - Memory array to modify
 */
export function applyIntelHexToMemory(content: string, memory: Uint8Array): void {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const line of lines) {
    if (!line.startsWith(':') || line.length < 11) {
      continue;
    }

    const byteCount = parseInt(line.slice(1, 3), 16);
    const address = parseInt(line.slice(3, 7), 16);
    const recordType = parseInt(line.slice(7, 9), 16);
    const dataString = line.slice(9, 9 + byteCount * 2);

    if (recordType === 1) {
      // EOF record
      break;
    }

    if (recordType !== 0) {
      // Skip non-data records
      continue;
    }

    for (let i = 0; i < byteCount; i += 1) {
      const byteHex = dataString.slice(i * 2, i * 2 + 2);
      const value = parseInt(byteHex, 16);
      const loc = address + i;
      if (loc >= 0 && loc < memory.length) {
        memory[loc] = value & BYTE_MASK;
      }
    }
  }
}

/**
 * Applies a binary file to memory starting at offset 0.
 *
 * @param filePath - Path to the binary file
 * @param memory - Memory array to modify
 */
export function applyBinaryToMemory(filePath: string, memory: Uint8Array): void {
  const data = fs.readFileSync(filePath);
  const length = Math.min(data.length, memory.length);
  for (let i = 0; i < length; i += 1) {
    memory[i] = data[i] ?? 0;
  }
}

/**
 * Applies a binary file to memory at a specific offset.
 *
 * @param filePath - Path to the binary file
 * @param memory - Memory array to modify
 * @param offset - Offset in memory to start writing
 */
export function applyBinaryToMemoryAtOffset(
  filePath: string,
  memory: Uint8Array,
  offset: number
): void {
  const base = Math.max(0, Math.min(ADDR_MASK, offset));
  const data = fs.readFileSync(filePath);
  const length = Math.min(data.length, memory.length - base);
  for (let i = 0; i < length; i += 1) {
    memory[base + i] = data[i] ?? 0;
  }
}

/**
 * Resolves the path to a ROM's binary file.
 *
 * @param filePath - Path to the ROM file (hex or bin)
 * @returns Path to the binary file, or undefined
 */
export function resolveRomBinPath(filePath: string): string | undefined {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.bin')) {
    return filePath;
  }

  const ext = extractExtension(filePath);
  if (ext === '') {
    return undefined;
  }

  const base = filePath.slice(0, filePath.length - ext.length);
  return `${base}.bin`;
}

/**
 * Extracts Intel HEX content from a file that may be wrapped in TypeScript/JavaScript.
 *
 * @param content - File content
 * @param filePath - File path (for extension detection)
 * @returns The extracted Intel HEX content
 */
export function extractRomHex(content: string, filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.ts') || lower.endsWith('.js')) {
    const match = content.match(/ROM\s*=\s*`([\s\S]*?)`/) ?? content.match(/`([\s\S]*?)`/);
    if (match !== null && match[1] !== undefined && match[1] !== '') {
      return match[1];
    }
  }
  return content;
}

/**
 * Extracts the extension from a file path.
 *
 * @param filePath - The file path
 * @returns The extension including the dot, or empty string
 */
function extractExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf('.');
  const lastSlash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  if (lastDot > lastSlash) {
    return filePath.slice(lastDot);
  }
  return '';
}
