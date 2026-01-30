/**
 * @fileoverview Program loading utilities for the debug adapter.
 */

import * as fs from 'fs';
import * as path from 'path';
import { ListingInfo, HexProgram, parseIntelHex, parseListing } from '../z80/loaders';
import { Tec1PlatformConfigNormalized, Tec1gPlatformConfigNormalized } from '../platforms/types';
import { Z80_ADDRESS_SPACE, TEC1_ROM_LOAD_ADDR } from '../platforms/tec-common';

export type PlatformKind = 'simple' | 'tec1' | 'tec1g';

export interface ProgramLoaderOptions {
  platform: PlatformKind;
  baseDir: string;
  hexPath: string;
  listingPath: string;
  resolveRelative: (p: string, baseDir: string) => string;
  resolveBundledTec1Rom: () => string | undefined;
  log: (message: string) => void;
  tec1Config?: Tec1PlatformConfigNormalized;
  tec1gConfig?: Tec1gPlatformConfigNormalized;
}

export interface ProgramLoadResult {
  program: HexProgram;
  listingInfo: ListingInfo;
  listingContent: string;
}

/**
 * Loads HEX + LST artifacts, applies platform ROM/RAM overlays, and parses listings.
 *
 * @param options - Program load configuration
 * @returns Parsed program + listing info
 */
export function loadProgramArtifacts(options: ProgramLoaderOptions): ProgramLoadResult {
  const { hexPath, listingPath, platform } = options;
  const hexContent = fs.readFileSync(hexPath, 'utf-8');
  const program = parseIntelHex(hexContent);

  if (platform === 'tec1') {
    program.memory = buildTec1Memory(hexContent, options);
  } else if (platform === 'tec1g') {
    program.memory = buildTec1gMemory(hexContent, options);
  }

  const listingContent = fs.readFileSync(listingPath, 'utf-8');
  const listingInfo = parseListing(listingContent);

  return { program, listingInfo, listingContent };
}

function buildTec1Memory(hexContent: string, options: ProgramLoaderOptions): Uint8Array {
  const memory = new Uint8Array(Z80_ADDRESS_SPACE);
  memory.fill(0);

  const romHex = options.tec1Config?.romHex;
  const romPath =
    romHex !== undefined && romHex.length > 0
      ? options.resolveRelative(romHex, options.baseDir)
      : options.resolveBundledTec1Rom();
  if (romPath === undefined || romPath.length === 0 || !fs.existsSync(romPath)) {
    const target = romPath ?? '(missing bundled ROM)';
    options.log(`Debug80: TEC-1 ROM not found at "${target}".`);
  } else {
    const binPath = resolveRomBinPath(romPath);
    if (binPath !== undefined && binPath.length > 0 && fs.existsSync(binPath)) {
      applyBinaryToMemory(binPath, memory);
    } else {
      const romContent = fs.readFileSync(romPath, 'utf-8');
      const romHexContent = extractRomHex(romContent, romPath);
      applyIntelHexToMemory(romHexContent, memory);
    }
  }

  const ramInitHex = options.tec1Config?.ramInitHex;
  const ramInitPath =
    ramInitHex !== undefined && ramInitHex.length > 0
      ? options.resolveRelative(ramInitHex, options.baseDir)
      : undefined;
  if (ramInitPath !== undefined && ramInitPath.length > 0) {
    if (!fs.existsSync(ramInitPath)) {
      options.log(`Debug80: TEC-1 RAM init not found at "${ramInitPath}".`);
    } else {
      const ramInitContent = fs.readFileSync(ramInitPath, 'utf-8');
      const ramInitHexContent = extractRomHex(ramInitContent, ramInitPath);
      applyIntelHexToMemory(ramInitHexContent, memory);
    }
  }

  applyIntelHexToMemory(hexContent, memory);
  return memory;
}

function buildTec1gMemory(hexContent: string, options: ProgramLoaderOptions): Uint8Array {
  const memory = new Uint8Array(Z80_ADDRESS_SPACE);
  memory.fill(0);

  const romHex = options.tec1gConfig?.romHex;
  const romPath =
    romHex !== undefined && romHex.length > 0
      ? options.resolveRelative(romHex, options.baseDir)
      : undefined;
  if (romPath === undefined || romPath.length === 0 || !fs.existsSync(romPath)) {
    const target = romPath ?? '(missing TEC-1G ROM)';
    options.log(`Debug80: TEC-1G ROM not found at "${target}".`);
  } else if (romPath.toLowerCase().endsWith('.bin')) {
    applyBinaryToMemoryAtOffset(romPath, memory, TEC1_ROM_LOAD_ADDR);
  } else {
    const romContent = fs.readFileSync(romPath, 'utf-8');
    const romHexContent = extractRomHex(romContent, romPath);
    applyIntelHexToMemory(romHexContent, memory);
  }

  const ramInitHex = options.tec1gConfig?.ramInitHex;
  const ramInitPath =
    ramInitHex !== undefined && ramInitHex.length > 0
      ? options.resolveRelative(ramInitHex, options.baseDir)
      : undefined;
  if (ramInitPath !== undefined && ramInitPath.length > 0) {
    if (!fs.existsSync(ramInitPath)) {
      options.log(`Debug80: TEC-1G RAM init not found at "${ramInitPath}".`);
    } else {
      const ramInitContent = fs.readFileSync(ramInitPath, 'utf-8');
      const ramInitHexContent = extractRomHex(ramInitContent, ramInitPath);
      applyIntelHexToMemory(ramInitHexContent, memory);
    }
  }

  applyIntelHexToMemory(hexContent, memory);
  return memory;
}

function applyIntelHexToMemory(content: string, memory: Uint8Array): void {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const line of lines) {
    if (!line.startsWith(':') || line.length < 11) {
      continue;
    }
    const byteCount = Number.parseInt(line.slice(1, 3), 16);
    const address = Number.parseInt(line.slice(3, 7), 16);
    const recordType = Number.parseInt(line.slice(7, 9), 16);
    const dataString = line.slice(9, 9 + byteCount * 2);

    if (recordType === 1) {
      break;
    }
    if (recordType !== 0) {
      continue;
    }
    for (let i = 0; i < byteCount; i += 1) {
      const byteHex = dataString.slice(i * 2, i * 2 + 2);
      const value = Number.parseInt(byteHex, 16);
      const loc = address + i;
      if (loc >= 0 && loc < memory.length) {
        memory[loc] = value & 0xff;
      }
    }
  }
}

function applyBinaryToMemory(filePath: string, memory: Uint8Array): void {
  const data = fs.readFileSync(filePath);
  const length = Math.min(data.length, memory.length);
  for (let i = 0; i < length; i += 1) {
    memory[i] = data[i] ?? 0;
  }
}

function applyBinaryToMemoryAtOffset(filePath: string, memory: Uint8Array, offset: number): void {
  const base = Math.max(0, Math.min(0xffff, offset));
  const data = fs.readFileSync(filePath);
  const length = Math.min(data.length, memory.length - base);
  for (let i = 0; i < length; i += 1) {
    memory[base + i] = data[i] ?? 0;
  }
}

function resolveRomBinPath(filePath: string): string | undefined {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.bin')) {
    return filePath;
  }
  const parsed = path.parse(filePath);
  if (parsed.ext === '') {
    return undefined;
  }
  return path.join(parsed.dir, `${parsed.name}.bin`);
}

function extractRomHex(content: string, filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.ts') || lower.endsWith('.js')) {
    const match = content.match(/ROM\s*=\s*`([\s\S]*?)`/) ?? content.match(/`([\s\S]*?)`/);
    if (match !== null && match[1] !== undefined && match[1] !== '') {
      return match[1];
    }
  }
  return content;
}
