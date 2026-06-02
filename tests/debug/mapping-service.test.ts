/**
 * @file Mapping service tests.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildMappingFromDebugMap, isNativeDebugMap } from '../../src/debug/mapping/mapping-service';
import { buildD8DebugMap, D8DebugMap } from '../../src/mapping/d8-map';
import { resolveLocation } from '../../src/mapping/source-map';
import type { Logger } from '../../src/util/logger';

const writeFile = (filePath: string, content: string): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
};

const createLogger = (logs: string[]): Logger => ({
  debug: (message: string, ...args: unknown[]) =>
    logs.push([message, ...args].map(String).join(' ')),
  info: (message: string, ...args: unknown[]) =>
    logs.push([message, ...args].map(String).join(' ')),
  warn: (message: string, ...args: unknown[]) =>
    logs.push([message, ...args].map(String).join(' ')),
  error: (message: string, ...args: unknown[]) =>
    logs.push([message, ...args].map(String).join(' ')),
});

function makeService(dir: string, mapPath: string, logs: string[] = []) {
  return {
    platform: 'simple',
    baseDir: dir,
    resolveMappedPath: (file: string) => {
      const candidate = path.isAbsolute(file) ? file : path.resolve(dir, file);
      return fs.existsSync(candidate) ? candidate : undefined;
    },
    relativeIfPossible: (filePath: string, baseDir: string) =>
      path.relative(baseDir, filePath) || filePath,
    resolveDebugMapPath: () => mapPath,
    logger: createLogger(logs),
  };
}

function nativeMapFor(filePath: string, line = 3): D8DebugMap {
  return buildD8DebugMap(
    {
      segments: [
        {
          start: 0x2000,
          end: 0x2001,
          loc: { file: filePath, line },
          context: { line: 12, text: 'NOP' },
          confidence: 'HIGH',
        },
      ],
      anchors: [
        {
          symbol: 'START',
          address: 0x2000,
          file: filePath,
          line,
        },
      ],
    },
    {
      arch: 'z80',
      addressWidth: 16,
      endianness: 'little',
      generator: { tool: 'azm' },
    }
  );
}

describe('mapping-service', () => {
  it('detects native D8 maps from missing generator metadata or tool-only producers', () => {
    const baseMap: Omit<D8DebugMap, 'generator'> = {
      format: 'd8-debug-map',
      version: 1,
      arch: 'z80',
      addressWidth: 16,
      endianness: 'little',
      files: {},
    };

    expect(isNativeDebugMap(baseMap)).toBe(true);
    expect(isNativeDebugMap({ ...baseMap, generator: { tool: 'azm' } })).toBe(true);
    expect(isNativeDebugMap({ ...baseMap, generator: { name: 'debug80' } })).toBe(false);
  });

  it('loads a native D8 map when available', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-map-'));
    const hexPath = path.join(dir, 'simple.hex');
    const asmPath = path.join(dir, 'simple.asm');
    const mapPath = path.join(dir, 'simple.d8.json');
    const logs: string[] = [];

    writeFile(hexPath, ':00000001FF\n');
    writeFile(asmPath, 'START:\n  NOP\n');
    writeFile(mapPath, JSON.stringify(nativeMapFor(asmPath), null, 2));

    const result = buildMappingFromDebugMap({
      hexPath,
      asmPath,
      sourceFile: asmPath,
      mapArgs: {},
      service: makeService(dir, mapPath, logs),
    });

    expect(result.mapping.segments).toHaveLength(1);
    expect(result.index.segmentsByAddress).toHaveLength(1);
    expect(resolveLocation(result.index, asmPath, 3)).toEqual([0x2000]);
    expect(logs.some((line) => line.includes('Source map loaded: simple.d8.json (azm, target)'))).toBe(
      true
    );
    expect(logs.some((line) => line.includes('Source mapping ready:'))).toBe(true);
  });

  it('does not derive a source map when native D8 is missing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-map-'));
    const hexPath = path.join(dir, 'simple.hex');
    const asmPath = path.join(dir, 'simple.asm');
    const mapPath = path.join(dir, 'simple.d8.json');
    const logs: string[] = [];

    writeFile(hexPath, ':00000001FF\n');
    writeFile(asmPath, 'START:\n  NOP\n');

    const result = buildMappingFromDebugMap({
      hexPath,
      asmPath,
      sourceFile: asmPath,
      mapArgs: {},
      service: makeService(dir, mapPath, logs),
    });

    expect(result.mapping.segments).toHaveLength(0);
    expect(result.index.segmentsByAddress).toHaveLength(0);
    expect(logs.some((line) => line.includes('Source map missing'))).toBe(true);
    expect(logs.some((line) => line.includes('Build the selected target with AZM'))).toBe(true);
  });

  it('does not load retired project-cache maps when the build-side source map is missing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-map-'));
    const hexPath = path.join(dir, 'build', 'simple.hex');
    const asmPath = path.join(dir, 'src', 'simple.asm');
    const buildMapPath = path.join(dir, 'build', 'simple.d8.json');
    const cacheMapPath = path.join(dir, '.debug80', 'cache', 'simple.cached.d8.json');
    const logs: string[] = [];

    writeFile(hexPath, ':00000001FF\n');
    writeFile(asmPath, 'START:\n  NOP\n');
    writeFile(cacheMapPath, JSON.stringify(nativeMapFor(asmPath), null, 2));

    const result = buildMappingFromDebugMap({
      hexPath,
      asmPath,
      sourceFile: asmPath,
      mapArgs: {},
      service: makeService(dir, buildMapPath, logs),
    });

    expect(result.mapping.segments).toHaveLength(0);
    expect(logs.some((line) => line.includes('Source map missing'))).toBe(true);
    expect(logs.some((line) => line.includes('.debug80'))).toBe(false);
  });

  it('ignores legacy Debug80-generated D8 maps instead of fabricating fallback maps', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-map-'));
    const hexPath = path.join(dir, 'simple.hex');
    const asmPath = path.join(dir, 'simple.asm');
    const mapPath = path.join(dir, 'simple.d8.json');
    const logs: string[] = [];
    const legacyMap = buildD8DebugMap(
      {
        segments: [
          {
            start: 0x2000,
            end: 0x2001,
            loc: { file: asmPath, line: 3 },
            context: { line: 1, text: 'NOP' },
            confidence: 'HIGH',
          },
        ],
        anchors: [],
      },
      {
        arch: 'z80',
        addressWidth: 16,
        endianness: 'little',
        generator: { name: 'debug80' },
      }
    );

    writeFile(hexPath, ':00000001FF\n');
    writeFile(asmPath, 'START:\n  NOP\n');
    writeFile(mapPath, JSON.stringify(legacyMap, null, 2));

    const result = buildMappingFromDebugMap({
      hexPath,
      asmPath,
      sourceFile: asmPath,
      mapArgs: {},
      service: makeService(dir, mapPath, logs),
    });

    expect(result.mapping.segments).toHaveLength(0);
    expect(logs.some((line) => line.includes('Ignoring legacy Debug80-generated source map'))).toBe(
      true
    );
  });

  it('prefers an existing native debug map without regenerating it', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-map-'));
    const hexPath = path.join(dir, 'simple.hex');
    const asmPath = path.join(dir, 'simple.asm');
    const mapPath = path.join(dir, 'simple.d8.json');
    const logs: string[] = [];
    const originalContent = JSON.stringify(nativeMapFor(asmPath, 42), null, 2);

    writeFile(hexPath, ':00000001FF\n');
    writeFile(asmPath, 'START:\n  NOP\n');
    writeFile(mapPath, originalContent);

    const past = new Date(Date.now() - 2000);
    fs.utimesSync(mapPath, past, past);
    const now = new Date();
    fs.utimesSync(hexPath, now, now);

    const result = buildMappingFromDebugMap({
      hexPath,
      asmPath,
      sourceFile: asmPath,
      mapArgs: {},
      service: makeService(dir, mapPath, logs),
    });

    expect(result.mapping.segments).toHaveLength(1);
    expect(result.mapping.segments[0]?.loc.line).toBe(42);
    expect(logs.some((line) => line.includes('Regenerating'))).toBe(false);
    expect(fs.readFileSync(mapPath, 'utf-8')).toBe(originalContent);
  });

  it('loads native auxiliary source maps from explicit platform ROM paths', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-map-'));
    const hexPath = path.join(dir, 'build', 'simple.hex');
    const asmPath = path.join(dir, 'src', 'simple.asm');
    const mapPath = path.join(dir, 'build', 'simple.d8.json');
    const auxiliaryDir = path.join(dir, 'bundle', 'mon3');
    const auxiliarySource = path.join(auxiliaryDir, 'mon3.z80');
    const auxiliaryMapPath = path.join(auxiliaryDir, 'mon3.d8.json');
    const logs: string[] = [];

    writeFile(hexPath, ':00000001FF\n');
    writeFile(asmPath, 'START:\n  NOP\n');
    writeFile(mapPath, JSON.stringify(nativeMapFor(asmPath), null, 2));
    writeFile(auxiliarySource, 'BOOT:\n  NOP\n');
    writeFile(auxiliaryMapPath, JSON.stringify(nativeMapFor('mon3.z80', 2), null, 2));

    const result = buildMappingFromDebugMap({
      hexPath,
      asmPath,
      sourceFile: asmPath,
      mapArgs: {},
      auxiliaryDebugMaps: [auxiliaryMapPath],
      service: makeService(dir, mapPath, logs),
    });

    expect(result.mapping.segments).toHaveLength(2);
    expect(result.mapping.segments.some((seg) => seg.loc.file === auxiliarySource)).toBe(true);
    expect(logs.some((line) => line.includes('(azm, platform ROM)'))).toBe(true);
  });

  it('ignores non-native auxiliary source maps from explicit platform ROM paths', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-map-'));
    const hexPath = path.join(dir, 'build', 'simple.hex');
    const asmPath = path.join(dir, 'src', 'simple.asm');
    const mapPath = path.join(dir, 'build', 'simple.d8.json');
    const auxiliaryMapPath = path.join(dir, 'bundle', 'mon3', 'mon3.d8.json');
    const logs: string[] = [];

    writeFile(hexPath, ':00000001FF\n');
    writeFile(asmPath, 'START:\n  NOP\n');
    writeFile(mapPath, JSON.stringify(nativeMapFor(asmPath), null, 2));
    writeFile(
      auxiliaryMapPath,
      JSON.stringify(
        {
          ...nativeMapFor('mon3.z80', 2),
          generator: { name: 'debug80' },
        },
        null,
        2
      )
    );

    const result = buildMappingFromDebugMap({
      hexPath,
      asmPath,
      sourceFile: asmPath,
      mapArgs: {},
      auxiliaryDebugMaps: [auxiliaryMapPath],
      service: makeService(dir, mapPath, logs),
    });

    expect(result.mapping.segments).toHaveLength(1);
    expect(logs.some((line) => line.includes('Ignoring legacy auxiliary source map'))).toBe(true);
  });

  it('uses lstLine as a fallback source line when loading native D8 segments', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-map-'));
    const hexPath = path.join(dir, 'simple.hex');
    const asmPath = path.join(dir, 'simple.asm');
    const mapPath = path.join(dir, 'simple.d8.json');
    const nativeMap = {
      format: 'd8-debug-map',
      version: 1,
      arch: 'z80',
      addressWidth: 16,
      endianness: 'little',
      generator: { tool: 'azm' },
      files: {
        [asmPath]: {
          segments: [{ start: 0x2000, end: 0x2001, lstLine: 42, lstText: 'NOP' }],
        },
      },
    };

    writeFile(hexPath, ':00000001FF\n');
    writeFile(asmPath, 'START:\n  NOP\n');
    writeFile(mapPath, JSON.stringify(nativeMap, null, 2));

    const result = buildMappingFromDebugMap({
      hexPath,
      asmPath,
      sourceFile: asmPath,
      mapArgs: {},
      service: makeService(dir, mapPath),
    });

    expect(result.mapping.segments[0]?.loc.line).toBe(42);
    expect(result.mapping.segments[0]?.context.line).toBe(42);
  });

});
