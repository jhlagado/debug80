/**
 * @file Source manager tests.
 */

import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('../src/debug/path-resolver', () => ({
  resolveListingSourcePath: () => undefined,
}));

import { SourceManager } from '../src/debug/source-manager';

const fixturesDir = path.join(process.cwd(), 'src', 'test', 'fixtures');
const listingContent = fs.readFileSync(path.join(fixturesDir, 'simple.lst'), 'utf-8');

const writeFile = (filePath: string, content: string): void => {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
};

describe('source-manager', () => {
  it('builds mapping state and resolves extra listings', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-source-'));
    const listingPath = path.join(dir, 'simple.lst');
    const extraListingPath = path.join(dir, 'extra.lst');
    writeFile(listingPath, listingContent);
    writeFile(extraListingPath, listingContent.replace('0000', '0200'));

    const logs: string[] = [];
    const manager = new SourceManager({
      platform: 'simple',
      baseDir: dir,
      resolveRelative: (filePath, baseDir) => path.resolve(baseDir, filePath),
      resolveMappedPath: (filePath) => {
        const candidate = path.resolve(dir, filePath);
        return fs.existsSync(candidate) ? candidate : undefined;
      },
      relativeIfPossible: (filePath, baseDir) =>
        path.relative(baseDir, filePath) || filePath,
      resolveDebugMapPath: (_args, _baseDir, _asm, listing) =>
        path.join(dir, `${path.basename(listing)}.d8dbg.json`),
      resolveExtraDebugMapPath: (listing) => path.join(dir, `${path.basename(listing)}.extra.json`),
      resolveListingSourcePath: (listing) =>
        listing.endsWith('.lst') ? listing.replace(/\.lst$/, '.asm') : undefined,
      log: (message) => logs.push(message),
    });

    const state = manager.buildState({
      listingContent,
      listingPath,
      sourceRoots: ['src'],
      extraListings: [extraListingPath, extraListingPath, 'missing.lst'],
      mapArgs: {},
    });

    expect(state.mapping.segments.length).toBeGreaterThan(0);
    expect(state.mappingIndex.segmentsByAddress.length).toBeGreaterThan(0);
    expect(state.extraListingPaths).toEqual([extraListingPath]);
    expect(state.sourceRoots).toContain(path.resolve(dir, 'src'));
    expect(state.sourceRoots).toContain(path.dirname(extraListingPath));
    expect(logs.some((line) => line.includes('extra listing not found'))).toBe(true);
  });

  it('collects listing and source entries for extra listings', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-source-'));
    const extraListingPath = path.join(dir, 'extra.lst');
    writeFile(extraListingPath, listingContent);

    const manager = new SourceManager({
      platform: 'simple',
      baseDir: dir,
      resolveRelative: (filePath, baseDir) => path.resolve(baseDir, filePath),
      resolveMappedPath: () => undefined,
      relativeIfPossible: (filePath, baseDir) =>
        path.relative(baseDir, filePath) || filePath,
      resolveDebugMapPath: () => path.join(dir, 'map.json'),
      resolveExtraDebugMapPath: () => path.join(dir, 'extra.json'),
      resolveListingSourcePath: (listing) =>
        listing.endsWith('.lst') ? listing.replace(/\.lst$/, '.asm') : undefined,
      log: () => undefined,
    });

    const entries = manager.collectRomSources([extraListingPath]);

    expect(entries).toEqual([
      { label: 'extra.lst', path: extraListingPath, kind: 'listing' },
      { label: 'extra.asm', path: extraListingPath.replace(/\.lst$/, '.asm'), kind: 'source' },
    ]);
  });
});
