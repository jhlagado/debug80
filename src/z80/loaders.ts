/**
 * @fileoverview Loaders for Intel HEX and assembler listing files.
 * Provides parsing utilities for loading Z80 programs and debug information.
 */

import { HexParseError } from '../debug/errors';

/**
 * Parsed Intel HEX program data.
 */
export interface HexProgram {
  /** 64K memory image with loaded program data */
  memory: Uint8Array;
  /** Lowest address with data (entry point hint) */
  startAddress: number;
}

/**
 * Parsed listing file information for debugging.
 */
export interface ListingInfo {
  /** Map from listing line number to memory address */
  lineToAddress: Map<number, number>;
  /** Map from memory address to listing line number */
  addressToLine: Map<number, number>;
  /** Detailed entries with line, address, and byte count */
  entries: Array<{ line: number; address: number; length: number }>;
}

/**
 * Parses Intel HEX format content into a 64K memory image.
 *
 * Supports standard Intel HEX records:
 * - Type 00: Data records (loaded into memory)
 * - Type 01: End of file (terminates parsing)
 * - Other types: Silently ignored
 *
 * @param content - Intel HEX file content
 * @returns Program data with memory image and start address
 * @throws Error if HEX format is invalid
 *
 * @example
 * ```typescript
 * const hex = fs.readFileSync('program.hex', 'utf-8');
 * const program = parseIntelHex(hex);
 * console.log(`Entry: 0x${program.startAddress.toString(16)}`);
 * ```
 */
export function parseIntelHex(content: string): HexProgram {
  const memory = new Uint8Array(0x10000);
  memory.fill(0);

  let startAddress = Number.MAX_SAFE_INTEGER;
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  for (const line of lines) {
    if (!line.startsWith(':') || line.length < 11) {
      throw new HexParseError(line);
    }

    const byteCount = parseInt(line.slice(1, 3), 16);
    const address = parseInt(line.slice(3, 7), 16);
    const recordType = parseInt(line.slice(7, 9), 16);
    const dataString = line.slice(9, 9 + byteCount * 2);

    if (recordType === 1) {
      // EOF
      break;
    }

    if (recordType !== 0) {
      // Only data records supported for now.
      continue;
    }

    startAddress = Math.min(startAddress, address);

    for (let i = 0; i < byteCount; i++) {
      const byteHex = dataString.slice(i * 2, i * 2 + 2);
      const value = parseInt(byteHex, 16);
      const loc = address + i;
      if (loc >= 0 && loc < 0x10000) {
        memory[loc] = value;
      }
    }
  }

  if (startAddress === Number.MAX_SAFE_INTEGER) {
    startAddress = 0;
  }

  return { memory, startAddress };
}

/**
 * Parses assembler listing file to build address-to-line mappings.
 *
 * Extracts lines with format: `ADDR BYTES... TEXT`
 * - ADDR: 4-digit hex address
 * - BYTES: Space-separated hex bytes
 * - TEXT: Assembly instruction text
 *
 * Lines without bytes (comments, directives) are skipped.
 *
 * @param content - Listing file content
 * @returns Listing info with bidirectional line/address mappings
 *
 * @example
 * ```typescript
 * const lst = fs.readFileSync('program.lst', 'utf-8');
 * const info = parseListing(lst);
 * const addr = info.lineToAddress.get(10); // Get address at line 10
 * ```
 */
export function parseListing(content: string): ListingInfo {
  const lineToAddress = new Map<number, number>();
  const addressToLine = new Map<number, number>();
  const entries: Array<{ line: number; address: number; length: number }> = [];

  const lines = content.split(/\r?\n/);
  const lineRegex = /^([0-9A-Fa-f]{4})\s+/;

  lines.forEach((line, idx) => {
    const match = lineRegex.exec(line);
    if (!match) {
      return;
    }
    const addressStr = match[1]!;

    // Require at least one byte on the line; skip pure comments/directives.
    const remainder = line.slice(match[0].length);
    const byteTokens = remainder.match(/\b[0-9A-Fa-f]{2}\b/g) ?? [];
    const byteCount = byteTokens.length;
    if (byteCount === 0) {
      return;
    }

    const address = parseInt(addressStr, 16);
    const lineNumber = idx + 1;
    if (!lineToAddress.has(lineNumber)) {
      lineToAddress.set(lineNumber, address);
    }
    // Map every byte of the instruction/data to the current line for precise lookup.
    for (let i = 0; i < byteCount; i++) {
      addressToLine.set(address + i, lineNumber);
    }
    entries.push({ line: lineNumber, address, length: byteCount });
  });

  return { lineToAddress, addressToLine, entries };
}
