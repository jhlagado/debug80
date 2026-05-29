/**
 * @file Source manager tests.
 */

import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Logger } from '../../src/util/logger';
import { buildD8DebugMap } from '../../src/mapping/d8-map';

import * as mappingService from '../../src/debug/mapping/mapping-service';
import { SourceManager } from '../../src/debug/mapping/source-manager';

const fixturesDir = path.join(process.cwd(), 'tests', 'fixtures');
const listingContent = fs.readFileSync(path.join(fixturesDir, 'simple.lst'), 'utf-8');

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

describe('source-manager', () => {
  it('builds mapping state from the native debug map', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-source-'));
    const listingPath = path.join(dir, 'simple.lst');
    const sourcePath = path.join(dir, 'simple.asm');
    const mapPath = path.join(dir, `${path.basename(listingPath)}.d8.json`);
    writeFile(listingPath, listingContent);
    writeFile(sourcePath, 'START:\n  NOP\n');
    writeFile(
      mapPath,
      JSON.stringify(
        buildD8DebugMap(
          {
            segments: [
              {
                start: 0x1000,
                end: 0x1001,
                loc: { file: sourcePath, line: 2 },
                lst: { line: 1, text: 'NOP' },
                confidence: 'HIGH',
              },
            ],
            anchors: [],
          },
          { arch: 'z80', addressWidth: 16, endianness: 'little', generator: { tool: 'azm' } }
        )
      )
    );

    const logs: string[] = [];
    const manager = new SourceManager({
      platform: 'simple',
      baseDir: dir,
      resolveRelative: (filePath, baseDir) => path.resolve(baseDir, filePath),
      resolveMappedPath: (filePath) => {
        const candidate = path.resolve(dir, filePath);
        return fs.existsSync(candidate) ? candidate : undefined;
      },
      relativeIfPossible: (filePath, baseDir) => path.relative(baseDir, filePath) || filePath,
      resolveDebugMapPath: (_args, _baseDir, _asm, listing) =>
        path.join(dir, `${path.basename(listing)}.d8.json`),
      logger: createLogger(logs),
    });

    const state = manager.buildState({
      listingContent,
      listingPath,
      sourceRoots: ['src'],
      mapArgs: {},
    });

    expect(state.mapping.segments.length).toBeGreaterThan(0);
    expect(state.mappingIndex.segmentsByAddress.length).toBeGreaterThan(0);
    expect(state.sourceRoots).toContain(path.resolve(dir, 'src'));
    expect(logs.some((line) => line.includes('Using native D8 map'))).toBe(true);
  });

  it('passes resolved asm path as mapping sourceFile when sourceFile is omitted (e.g. AZM entry only)', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-source-azm-'));
    const listingPath = path.join(dir, 'out.lst');
    const asmPath = 'src/matrix.asm';
    writeFile(listingPath, listingContent);
    const zaxPath = path.join(dir, 'src', 'matrix.asm');
    writeFile(zaxPath, 'nop\n');

    const buildMappingSpy = vi.spyOn(mappingService, 'buildMappingFromListing');

    const logs: string[] = [];
    const manager = new SourceManager({
      platform: 'tec1g',
      baseDir: dir,
      resolveRelative: (filePath, baseDir) => path.resolve(baseDir, filePath),
      resolveMappedPath: (filePath) => {
        const candidate = path.resolve(dir, filePath);
        return fs.existsSync(candidate) ? candidate : undefined;
      },
      relativeIfPossible: (filePath, baseDir) => path.relative(baseDir, filePath) || filePath,
      resolveDebugMapPath: (_a, _b, _c, listing) =>
        path.join(path.dirname(listing), `${path.basename(listing, '.lst')}.d8.json`),
      logger: createLogger(logs),
    });

    manager.buildState({
      listingContent,
      listingPath,
      asmPath,
      sourceRoots: [],
      mapArgs: {},
    });

    expect(buildMappingSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceFile: path.join(dir, 'src', 'matrix.asm'),
      })
    );
    buildMappingSpy.mockRestore();
  });
});
