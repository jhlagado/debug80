/**
 * @file Program loader tests.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { loadProgramArtifacts } from '../../src/debug/program-loader';
import { TEC1_ROM_LOAD_ADDR } from '../../src/platforms/tec-common';

const writeFile = (filePath: string, content: string): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
};

const writeHexFile = (filePath: string, address: number, value: number): void => {
  const addr = address.toString(16).padStart(4, '0').toUpperCase();
  const byte = value.toString(16).padStart(2, '0').toUpperCase();
  const line = `:01${addr}00${byte}00`;
  writeFile(filePath, `${line}\n:00000001FF\n`);
};

describe('program-loader', () => {
  it('loads TEC-1 overlays and applies program hex', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-'));
    const hexPath = path.join(dir, 'program.hex');
    const listingPath = path.join(dir, 'program.lst');
    const romPath = path.join(dir, 'rom.hex');
    const ramPath = path.join(dir, 'ram.hex');

    writeHexFile(hexPath, 0x1000, 0xaa);
    writeHexFile(romPath, 0x0000, 0x55);
    writeHexFile(ramPath, 0x2000, 0x66);
    writeFile(listingPath, '0000   00   NOP\n');

    const logs: string[] = [];
    const result = loadProgramArtifacts({
      platform: 'tec1',
      baseDir: dir,
      hexPath,
      listingPath,
      resolveRelative: (p, base) => path.resolve(base, p),
      resolveBundledTec1Rom: () => undefined,
      log: (message) => logs.push(message),
      tec1Config: { romHex: romPath, ramInitHex: ramPath },
    });

    expect(result.program.memory[0x0000]).toBe(0x55);
    expect(result.program.memory[0x2000]).toBe(0x66);
    expect(result.program.memory[0x1000]).toBe(0xaa);
    expect(result.listingInfo.entries.length).toBeGreaterThan(0);
    expect(logs.length).toBe(0);
  });

  it('loads TEC-1G ROM binary at C000 and applies program hex', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-'));
    const hexPath = path.join(dir, 'program.hex');
    const listingPath = path.join(dir, 'program.lst');
    const romPath = path.join(dir, 'rom.bin');
    const ramPath = path.join(dir, 'ram.hex');

    writeHexFile(hexPath, 0x3000, 0x99);
    fs.writeFileSync(romPath, Buffer.from([0x11, 0x22]));
    writeHexFile(ramPath, 0x4000, 0x77);
    writeFile(listingPath, '3000   99   NOP\n');

    const logs: string[] = [];
    const result = loadProgramArtifacts({
      platform: 'tec1g',
      baseDir: dir,
      hexPath,
      listingPath,
      resolveRelative: (p, base) => path.resolve(base, p),
      resolveBundledTec1Rom: () => undefined,
      log: (message) => logs.push(message),
      tec1gConfig: { romHex: romPath, ramInitHex: ramPath },
    });

    expect(result.program.memory[TEC1_ROM_LOAD_ADDR]).toBe(0x11);
    expect(result.program.memory[TEC1_ROM_LOAD_ADDR + 1]).toBe(0x22);
    expect(result.program.memory[0x4000]).toBe(0x77);
    expect(result.program.memory[0x3000]).toBe(0x99);
    expect(result.listingInfo.entries.length).toBeGreaterThan(0);
    expect(logs.length).toBe(0);
  });

  it('logs warning when TEC-1 ROM is missing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-'));
    const hexPath = path.join(dir, 'program.hex');
    const listingPath = path.join(dir, 'program.lst');

    writeHexFile(hexPath, 0x1000, 0xbb);
    writeFile(listingPath, '1000   BB   NOP\n');

    const logs: string[] = [];
    const result = loadProgramArtifacts({
      platform: 'tec1',
      baseDir: dir,
      hexPath,
      listingPath,
      resolveRelative: (p, base) => path.resolve(base, p),
      resolveBundledTec1Rom: () => undefined,
      log: (message) => logs.push(message),
      tec1Config: { romHex: 'nonexistent.hex' },
    });

    expect(result.program.memory[0x1000]).toBe(0xbb);
    expect(logs.some((l) => l.includes('ROM not found'))).toBe(true);
  });

  it('logs warning when TEC-1G ROM is missing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-'));
    const hexPath = path.join(dir, 'program.hex');
    const listingPath = path.join(dir, 'program.lst');

    writeHexFile(hexPath, 0x2000, 0xcc);
    writeFile(listingPath, '2000   CC   NOP\n');

    const logs: string[] = [];
    const result = loadProgramArtifacts({
      platform: 'tec1g',
      baseDir: dir,
      hexPath,
      listingPath,
      resolveRelative: (p, base) => path.resolve(base, p),
      resolveBundledTec1Rom: () => undefined,
      log: (message) => logs.push(message),
      tec1gConfig: { romHex: 'nonexistent.bin' },
    });

    expect(result.program.memory[0x2000]).toBe(0xcc);
    expect(logs.some((l) => l.includes('ROM not found'))).toBe(true);
  });

  it('logs warning when RAM init file is missing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-'));
    const hexPath = path.join(dir, 'program.hex');
    const listingPath = path.join(dir, 'program.lst');

    writeHexFile(hexPath, 0x1000, 0xdd);
    writeFile(listingPath, '1000   DD   NOP\n');

    const logs: string[] = [];
    const result = loadProgramArtifacts({
      platform: 'tec1',
      baseDir: dir,
      hexPath,
      listingPath,
      resolveRelative: (p, base) => path.resolve(base, p),
      resolveBundledTec1Rom: () => undefined,
      log: (message) => logs.push(message),
      tec1Config: { ramInitHex: 'nonexistent-ram.hex' },
    });

    expect(result.program.memory[0x1000]).toBe(0xdd);
    expect(logs.some((l) => l.includes('RAM init not found'))).toBe(true);
  });

  it('loads simple platform without overlays', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-'));
    const hexPath = path.join(dir, 'program.hex');
    const listingPath = path.join(dir, 'program.lst');

    writeHexFile(hexPath, 0x0100, 0xee);
    writeFile(listingPath, '0100   EE   NOP\n');

    const logs: string[] = [];
    const result = loadProgramArtifacts({
      platform: 'simple',
      baseDir: dir,
      hexPath,
      listingPath,
      resolveRelative: (p, base) => path.resolve(base, p),
      resolveBundledTec1Rom: () => undefined,
      log: (message) => logs.push(message),
    });

    expect(result.program.memory[0x0100]).toBe(0xee);
    expect(logs.length).toBe(0);
  });
});
