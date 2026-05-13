/**
 * @file Mapping service tests.
 */

import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { AssemblerBackend } from '../../src/debug/launch/assembler-backend';
import * as assemblerBackendModule from '../../src/debug/launch/assembler-backend';
import type { Logger } from '../../src/util/logger';

const resolveListingSourcePathMock = vi.hoisted(() => vi.fn(() => undefined));

vi.mock('../../src/debug/mapping/path-resolver', () => ({
  resolveListingSourcePath: resolveListingSourcePathMock,
}));

import { buildMappingFromListing, isNativeDebugMap } from '../../src/debug/mapping/mapping-service';
import { pathsEqual } from '../../src/debug/mapping/path-utils';
import { parseMapping } from '../../src/mapping/parser';
import { buildD8DebugMap, D8DebugMap } from '../../src/mapping/d8-map';
import { resolveLocation } from '../../src/mapping/source-map';

const fixturesDir = path.join(process.cwd(), 'tests', 'fixtures');
const listingContent = fs.readFileSync(path.join(fixturesDir, 'simple.lst'), 'utf-8');
const asmContent = fs.readFileSync(path.join(fixturesDir, 'simple.asm'), 'utf-8');

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
    expect(isNativeDebugMap({ ...baseMap, generator: { tool: 'zax' } })).toBe(true);
    expect(isNativeDebugMap({ ...baseMap, generator: { name: 'debug80' } })).toBe(false);
  });

  it('generates a debug map and index from a listing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-map-'));
    const listingPath = path.join(dir, 'simple.lst');
    const asmPath = path.join(dir, 'simple.asm');
    const mapPath = path.join(dir, 'simple.d8.json');

    writeFile(listingPath, listingContent);
    writeFile(asmPath, asmContent);

    const logs: string[] = [];
    const result = buildMappingFromListing({
      listingContent,
      listingPath,
      asmPath,
      sourceFile: asmPath,
      extraListingPaths: [],
      mapArgs: {},
      service: {
        platform: 'simple',
        baseDir: dir,
        resolveMappedPath: (file) => {
          const candidate = path.resolve(dir, file);
          return fs.existsSync(candidate) ? candidate : undefined;
        },
        relativeIfPossible: (filePath, baseDir) => path.relative(baseDir, filePath) || filePath,
        resolveExtraDebugMapPath: (p) => path.join(dir, `${path.basename(p)}.extra.json`),
        resolveDebugMapPath: () => mapPath,
        logger: createLogger(logs),
      },
    });

    expect(result.mapping.segments.length).toBeGreaterThan(0);
    expect(result.index.segmentsByAddress.length).toBeGreaterThan(0);
    expect(fs.existsSync(mapPath)).toBe(true);
  });

  it('maps executable lines in the root source even when anchors only mention includes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-map-'));
    const listingPath = path.join(dir, 'build', 'tetro.lst');
    const asmPath = path.join(dir, 'src', 'tetro.asm');
    const constantsPath = path.join(dir, 'src', 'inc', 'constants.asm');
    const modulePath = path.join(dir, 'src', 'modules', 'game_init.asm');
    const mapPath = path.join(dir, '.debug80', 'cache', 'tetro.d8.json');
    const listing = [
      '4000                          .ORG   0x4000',
      '4000                             ; constants',
      '4000                K_DROP:   EQU   0x00',
      '4000                START:',
      '4000   CD 14 45               CALL   INIT_STATE',
      '4003                MAIN_LOOP:',
      '4003   18 FE                  JR   MAIN_LOOP',
      '4514                INIT_STATE:',
      '4514   C9                     RET',
      '',
      'K_DROP:             0000 DEFINED AT LINE 24 IN inc/constants.asm',
      'INIT_STATE:         4514 DEFINED AT LINE 1 IN modules/game_init.asm',
    ].join('\n');

    writeFile(listingPath, listing);
    writeFile(
      asmPath,
      [
        '        ORG     0x4000',
        '        .include "inc/constants.asm"',
        '',
        'START:',
        '        CALL    INIT_STATE',
        '',
        'MAIN_LOOP:',
        '        JR      MAIN_LOOP',
        '',
        '        .include "modules/game_init.asm"',
      ].join('\n')
    );
    writeFile(constantsPath, 'K_DROP: EQU 0x00\n');
    writeFile(modulePath, 'INIT_STATE:\n        RET\n');

    const staleMap = buildD8DebugMap(parseMapping(listing), {
      arch: 'z80',
      addressWidth: 16,
      endianness: 'little',
      generator: { name: 'debug80' },
    });
    writeFile(mapPath, JSON.stringify(staleMap, null, 2));
    const future = new Date(Date.now() + 1000);
    fs.utimesSync(mapPath, future, future);

    const logs: string[] = [];
    const result = buildMappingFromListing({
      listingContent: listing,
      listingPath,
      asmPath,
      sourceFile: asmPath,
      extraListingPaths: [],
      mapArgs: {},
      service: {
        platform: 'tec1g',
        baseDir: dir,
        resolveMappedPath: (file) => {
          const candidate = path.isAbsolute(file) ? file : path.resolve(dir, 'src', file);
          return fs.existsSync(candidate) ? candidate : undefined;
        },
        relativeIfPossible: (filePath, baseDir) => path.relative(baseDir, filePath) || filePath,
        resolveExtraDebugMapPath: (p) => path.join(dir, `${path.basename(p)}.extra.json`),
        resolveDebugMapPath: () => mapPath,
        logger: createLogger(logs),
      },
    });

    expect(resolveLocation(result.index, asmPath, 5)).toContain(0x4000);
    expect(
      result.mapping.segments.some(
        (seg) => seg.loc.file !== null && pathsEqual(seg.loc.file, asmPath)
      )
    ).toBe(true);
    expect(logs.some((line) => line.includes('did not include target source'))).toBe(true);
  });

  it('loads a fresh debug map when available', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-map-'));
    const listingPath = path.join(dir, 'simple.lst');
    const asmPath = path.join(dir, 'simple.asm');
    const mapPath = path.join(dir, 'simple.d8.json');

    writeFile(listingPath, listingContent);
    writeFile(asmPath, asmContent);

    const mapping = parseMapping(listingContent);
    const map = buildD8DebugMap(mapping, {
      arch: 'z80',
      addressWidth: 16,
      endianness: 'little',
      generator: { name: 'debug80' },
    });
    writeFile(mapPath, JSON.stringify(map));

    // Ensure map is newer than listing.
    const now = new Date();
    fs.utimesSync(mapPath, now, now);
    const past = new Date(now.getTime() - 1000);
    fs.utimesSync(listingPath, past, past);

    const logs: string[] = [];
    const result = buildMappingFromListing({
      listingContent,
      listingPath,
      asmPath,
      sourceFile: asmPath,
      extraListingPaths: [],
      mapArgs: {},
      service: {
        platform: 'simple',
        baseDir: dir,
        resolveMappedPath: (file) => {
          const candidate = path.resolve(dir, file);
          return fs.existsSync(candidate) ? candidate : undefined;
        },
        relativeIfPossible: (filePath, baseDir) => path.relative(baseDir, filePath) || filePath,
        resolveExtraDebugMapPath: (p) => path.join(dir, `${path.basename(p)}.extra.json`),
        resolveDebugMapPath: () => mapPath,
        logger: createLogger(logs),
      },
    });

    expect(result.mapping.segments.length).toBeGreaterThan(0);
    expect(logs.find((line) => line.includes('Regenerating'))).toBeUndefined();
  });

  it('prefers a stale native debug map without regenerating it', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-map-'));
    const listingPath = path.join(dir, 'simple.lst');
    const asmPath = path.join(dir, 'simple.asm');
    const mapPath = path.join(dir, 'simple.d8.json');

    writeFile(listingPath, listingContent);
    writeFile(asmPath, asmContent);

    const nativeMap = buildD8DebugMap(
      {
        segments: [
          {
            start: 0x2000,
            end: 0x2001,
            loc: { file: asmPath, line: 42 },
            lst: { line: 12, text: 'NOP' },
            confidence: 'HIGH',
          },
        ],
        anchors: [],
      },
      {
        arch: 'z80',
        addressWidth: 16,
        endianness: 'little',
        generator: { tool: 'zax' },
      }
    );
    const originalContent = JSON.stringify(nativeMap, null, 2);
    writeFile(mapPath, originalContent);

    const past = new Date(Date.now() - 2000);
    fs.utimesSync(mapPath, past, past);
    const now = new Date();
    fs.utimesSync(listingPath, now, now);

    const logs: string[] = [];
    const result = buildMappingFromListing({
      listingContent,
      listingPath,
      asmPath,
      sourceFile: asmPath,
      extraListingPaths: [],
      mapArgs: {},
      service: {
        platform: 'simple',
        baseDir: dir,
        resolveMappedPath: (file) => {
          const candidate = path.resolve(dir, file);
          return fs.existsSync(candidate) ? candidate : undefined;
        },
        relativeIfPossible: (filePath, baseDir) => path.relative(baseDir, filePath) || filePath,
        resolveExtraDebugMapPath: (p) => path.join(dir, `${path.basename(p)}.extra.json`),
        resolveDebugMapPath: () => mapPath,
        logger: createLogger(logs),
      },
    });

    expect(result.mapping.segments).toHaveLength(1);
    expect(result.mapping.segments[0]?.loc.line).toBe(42);
    expect(logs.some((line) => line.includes('Using native D8 map from "zax"'))).toBe(true);
    expect(logs.some((line) => line.includes('Regenerating'))).toBe(false);
    expect(fs.readFileSync(mapPath, 'utf-8')).toBe(originalContent);
  });

  it('uses lstLine as a fallback source line when loading native D8 segments', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-map-'));
    const listingPath = path.join(dir, 'simple.lst');
    const asmPath = path.join(dir, 'simple.asm');
    const mapPath = path.join(dir, 'simple.d8.json');

    writeFile(listingPath, listingContent);
    writeFile(asmPath, asmContent);

    const nativeMap = {
      format: 'd8-debug-map',
      version: 1,
      arch: 'z80',
      addressWidth: 16,
      endianness: 'little',
      generator: { tool: 'zax' },
      files: {
        [asmPath]: {
          segments: [{ start: 0x2000, end: 0x2001, lstLine: 42, lstText: 'NOP' }],
        },
      },
    };
    writeFile(mapPath, JSON.stringify(nativeMap, null, 2));

    const result = buildMappingFromListing({
      listingContent,
      listingPath,
      asmPath,
      sourceFile: asmPath,
      extraListingPaths: [],
      mapArgs: {},
      service: {
        platform: 'simple',
        baseDir: dir,
        resolveMappedPath: (file) => {
          const candidate = path.resolve(dir, file);
          return fs.existsSync(candidate) ? candidate : undefined;
        },
        relativeIfPossible: (filePath, baseDir) => path.relative(baseDir, filePath) || filePath,
        resolveExtraDebugMapPath: (p) => path.join(dir, `${path.basename(p)}.extra.json`),
        resolveDebugMapPath: () => mapPath,
        logger: createLogger([]),
      },
    });

    expect(result.mapping.segments[0]?.loc.line).toBe(42);
    expect(result.mapping.segments[0]?.lst.line).toBe(42);
  });

  it('regenerates when the debug map is stale and merges extra listings', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-map-'));
    const listingPath = path.join(dir, 'simple.lst');
    const asmPath = path.join(dir, 'simple.asm');
    const mapPath = path.join(dir, 'simple.d8.json');
    const extraListingPath = path.join(dir, 'extra.lst');

    writeFile(listingPath, listingContent);
    writeFile(asmPath, asmContent);
    writeFile(extraListingPath, listingContent.replace('0000', '0100'));

    writeFile(mapPath, JSON.stringify({}));
    const past = new Date(Date.now() - 2000);
    fs.utimesSync(mapPath, past, past);
    const now = new Date();
    fs.utimesSync(listingPath, now, now);

    const logs: string[] = [];
    const result = buildMappingFromListing({
      listingContent,
      listingPath,
      asmPath,
      sourceFile: asmPath,
      extraListingPaths: [extraListingPath],
      mapArgs: {},
      service: {
        platform: 'simple',
        baseDir: dir,
        resolveMappedPath: (file) => {
          const candidate = path.resolve(dir, file);
          return fs.existsSync(candidate) ? candidate : undefined;
        },
        relativeIfPossible: (filePath, baseDir) => path.relative(baseDir, filePath) || filePath,
        resolveExtraDebugMapPath: (p) => path.join(dir, `${path.basename(p)}.extra.json`),
        resolveDebugMapPath: () => mapPath,
        logger: createLogger(logs),
      },
    });

    expect(result.mapping.segments.length).toBeGreaterThan(0);
    expect(logs.some((line) => line.includes('Regenerating'))).toBe(true);
  });

  it('uses a source-resolved backend for extra listings when available', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-map-'));
    const listingPath = path.join(dir, 'simple.lst');
    const asmPath = path.join(dir, 'simple.asm');
    const extraListingPath = path.join(dir, 'extra.lst');
    const extraSourcePath = path.join(dir, 'extra.asm');
    const mapPath = path.join(dir, 'simple.d8.json');

    writeFile(listingPath, listingContent);
    writeFile(asmPath, asmContent);
    writeFile(extraListingPath, listingContent.replace('0000', '0100'));
    writeFile(extraSourcePath, asmContent);
    resolveListingSourcePathMock.mockReturnValue(extraSourcePath);

    const compileMappingInProcess = vi.fn(() => ({
      segments: [
        {
          start: 0x100,
          end: 0x101,
          loc: { file: extraSourcePath, line: 1 },
          lst: { line: 1, text: 'NOP' },
          confidence: 'HIGH' as const,
        },
      ],
      anchors: [],
    }));
    const backend: AssemblerBackend = {
      id: 'mock-asm',
      assemble: () => Promise.resolve({ success: true }),
      compileMappingInProcess,
    };
    const resolveAssemblerBackend = vi
      .spyOn(assemblerBackendModule, 'resolveAssemblerBackend')
      .mockReturnValue(backend);

    const result = buildMappingFromListing({
      listingContent,
      listingPath,
      asmPath,
      sourceFile: asmPath,
      extraListingPaths: [extraListingPath],
      mapArgs: {},
      service: {
        platform: 'simple',
        baseDir: dir,
        resolveMappedPath: (file) => {
          const candidate = path.resolve(dir, file);
          return fs.existsSync(candidate) ? candidate : undefined;
        },
        relativeIfPossible: (filePath, baseDir) => path.relative(baseDir, filePath) || filePath,
        resolveExtraDebugMapPath: (p) => path.join(dir, `${path.basename(p)}.extra.json`),
        resolveDebugMapPath: () => mapPath,
        logger: createLogger([]),
      },
    });

    expect(resolveAssemblerBackend).toHaveBeenCalledWith(undefined, extraSourcePath);
    expect(compileMappingInProcess).toHaveBeenCalledWith(
      extraSourcePath,
      path.dirname(extraSourcePath)
    );
    expect(result.mapping.segments.some((segment) => segment.loc.file === extraSourcePath)).toBe(
      true
    );
    resolveAssemblerBackend.mockRestore();
  });

  it('falls back to listing parsing when the source-resolved backend lacks in-process mapping', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-map-'));
    const listingPath = path.join(dir, 'simple.lst');
    const asmPath = path.join(dir, 'simple.asm');
    const extraListingPath = path.join(dir, 'extra.lst');
    const extraSourcePath = path.join(dir, 'extra.asm');
    const mapPath = path.join(dir, 'simple.d8.json');
    const extraListingContent = '0100 00 NOP\n';

    writeFile(listingPath, listingContent);
    writeFile(asmPath, asmContent);
    writeFile(extraListingPath, extraListingContent);
    writeFile(extraSourcePath, asmContent);
    resolveListingSourcePathMock.mockReturnValue(extraSourcePath);
    const backend: AssemblerBackend = {
      id: 'mock-asm',
      assemble: () => Promise.resolve({ success: true }),
    };
    const resolveAssemblerBackend = vi
      .spyOn(assemblerBackendModule, 'resolveAssemblerBackend')
      .mockReturnValue(backend);

    const result = buildMappingFromListing({
      listingContent,
      listingPath,
      asmPath,
      sourceFile: asmPath,
      extraListingPaths: [extraListingPath],
      mapArgs: {},
      service: {
        platform: 'simple',
        baseDir: dir,
        resolveMappedPath: (file) => {
          const candidate = path.resolve(dir, file);
          return fs.existsSync(candidate) ? candidate : undefined;
        },
        relativeIfPossible: (filePath, baseDir) => path.relative(baseDir, filePath) || filePath,
        resolveExtraDebugMapPath: (p) => path.join(dir, `${path.basename(p)}.extra.json`),
        resolveDebugMapPath: () => mapPath,
        logger: createLogger([]),
      },
    });

    expect(
      result.mapping.segments.some(
        (segment) =>
          segment.start === 0x100 &&
          segment.end === 0x101 &&
          segment.loc.file !== null &&
          pathsEqual(segment.loc.file, extraSourcePath) &&
          segment.loc.line === 1
      )
    ).toBe(true);
    expect(resolveAssemblerBackend).toHaveBeenCalledWith(undefined, extraSourcePath);
    resolveAssemblerBackend.mockRestore();
  });

  it('prefers a stale native debug map for extra listings without invoking backend regeneration', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-map-'));
    const listingPath = path.join(dir, 'simple.lst');
    const asmPath = path.join(dir, 'simple.asm');
    const mapPath = path.join(dir, 'simple.d8.json');
    const extraListingPath = path.join(dir, 'extra.lst');
    const extraSourcePath = path.join(dir, 'extra.asm');
    const extraMapPath = path.join(dir, 'extra.lst.extra.json');

    writeFile(listingPath, listingContent);
    writeFile(asmPath, asmContent);
    writeFile(extraListingPath, '0100 00 NOP\n');
    writeFile(extraSourcePath, asmContent);

    const extraNativeMap = buildD8DebugMap(
      {
        segments: [
          {
            start: 0x100,
            end: 0x101,
            loc: { file: extraSourcePath, line: 7 },
            lst: { line: 1, text: 'NOP' },
            confidence: 'HIGH',
          },
        ],
        anchors: [],
      },
      {
        arch: 'z80',
        addressWidth: 16,
        endianness: 'little',
        generator: { tool: 'zax' },
      }
    );
    const originalExtraMap = JSON.stringify(extraNativeMap, null, 2);
    writeFile(extraMapPath, originalExtraMap);

    const past = new Date(Date.now() - 2000);
    fs.utimesSync(extraMapPath, past, past);
    const now = new Date();
    fs.utimesSync(extraListingPath, now, now);

    resolveListingSourcePathMock.mockReturnValue(extraSourcePath);
    const resolveAssemblerBackend = vi.spyOn(assemblerBackendModule, 'resolveAssemblerBackend');
    const logs: string[] = [];

    const result = buildMappingFromListing({
      listingContent,
      listingPath,
      asmPath,
      sourceFile: asmPath,
      extraListingPaths: [extraListingPath],
      mapArgs: {},
      service: {
        platform: 'simple',
        baseDir: dir,
        resolveMappedPath: (file) => {
          const candidate = path.resolve(dir, file);
          return fs.existsSync(candidate) ? candidate : undefined;
        },
        relativeIfPossible: (filePath, baseDir) => path.relative(baseDir, filePath) || filePath,
        resolveExtraDebugMapPath: () => extraMapPath,
        resolveDebugMapPath: () => mapPath,
        logger: createLogger(logs),
      },
    });

    expect(
      result.mapping.segments.some(
        (segment) =>
          segment.start === 0x100 &&
          segment.end === 0x101 &&
          segment.loc.file !== null &&
          pathsEqual(segment.loc.file, extraSourcePath) &&
          segment.loc.line === 7
      )
    ).toBe(true);
    expect(logs.some((line) => line.includes('Using native D8 map from "zax"'))).toBe(true);
    expect(resolveAssemblerBackend).not.toHaveBeenCalled();
    expect(fs.readFileSync(extraMapPath, 'utf-8')).toBe(originalExtraMap);

    resolveAssemblerBackend.mockRestore();
    resolveListingSourcePathMock.mockReturnValue(undefined);
  });
});
