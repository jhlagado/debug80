/**
 * @file Mapping service tests.
 */

import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
vi.mock('../../src/debug/path-resolver', () => ({
  resolveListingSourcePath: () => undefined,
}));

import { buildMappingFromListing } from '../../src/debug/mapping-service';
import { parseMapping } from '../../src/mapping/parser';
import { buildD8DebugMap } from '../../src/mapping/d8-map';

const fixturesDir = path.join(process.cwd(), 'tests', 'fixtures');
const listingContent = fs.readFileSync(path.join(fixturesDir, 'simple.lst'), 'utf-8');
const asmContent = fs.readFileSync(path.join(fixturesDir, 'simple.asm'), 'utf-8');

const writeFile = (filePath: string, content: string): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
};

describe('mapping-service', () => {
  it('generates a debug map and index from a listing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-map-'));
    const listingPath = path.join(dir, 'simple.lst');
    const asmPath = path.join(dir, 'simple.asm');
    const mapPath = path.join(dir, 'simple.d8dbg.json');

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
        relativeIfPossible: (filePath, baseDir) =>
          path.relative(baseDir, filePath) || filePath,
        resolveExtraDebugMapPath: (p) => path.join(dir, `${path.basename(p)}.extra.json`),
        resolveDebugMapPath: () => mapPath,
        log: (message) => logs.push(message),
      },
    });

    expect(result.mapping.segments.length).toBeGreaterThan(0);
    expect(result.index.segmentsByAddress.length).toBeGreaterThan(0);
    expect(fs.existsSync(mapPath)).toBe(true);
    expect(logs.length).toBe(0);
  });

  it('loads a fresh debug map when available', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-map-'));
    const listingPath = path.join(dir, 'simple.lst');
    const asmPath = path.join(dir, 'simple.asm');
    const mapPath = path.join(dir, 'simple.d8dbg.json');

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
        relativeIfPossible: (filePath, baseDir) =>
          path.relative(baseDir, filePath) || filePath,
        resolveExtraDebugMapPath: (p) => path.join(dir, `${path.basename(p)}.extra.json`),
        resolveDebugMapPath: () => mapPath,
        log: (message) => logs.push(message),
      },
    });

    expect(result.mapping.segments.length).toBeGreaterThan(0);
    expect(logs.find((line) => line.includes('Regenerating'))).toBeUndefined();
  });

  it('regenerates when the debug map is stale and merges extra listings', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-map-'));
    const listingPath = path.join(dir, 'simple.lst');
    const asmPath = path.join(dir, 'simple.asm');
    const mapPath = path.join(dir, 'simple.d8dbg.json');
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
        relativeIfPossible: (filePath, baseDir) =>
          path.relative(baseDir, filePath) || filePath,
        resolveExtraDebugMapPath: (p) => path.join(dir, `${path.basename(p)}.extra.json`),
        resolveDebugMapPath: () => mapPath,
        log: (message) => logs.push(message),
      },
    });

    expect(result.mapping.segments.length).toBeGreaterThan(0);
    expect(logs.some((line) => line.includes('Regenerating'))).toBe(true);
  });
});
