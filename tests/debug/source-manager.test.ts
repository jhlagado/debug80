/**
 * @file Source manager tests.
 */

import { afterEach, describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { Logger } from '../../src/util/logger';
import { buildD8DebugMap } from '../../src/mapping/d8-map';

import * as mappingService from '../../src/debug/mapping/mapping-service';
import { SourceManager } from '../../src/debug/mapping/source-manager';

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
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const dir of tmpDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  it('builds mapping state from the native debug map', () => {
    const dir = makeTempDir('debug80-source-');
    const hexPath = path.join(dir, 'simple.hex');
    const sourcePath = path.join(dir, 'simple.asm');
    const mapPath = path.join(dir, 'simple.d8.json');
    writeFile(hexPath, ':00000001FF\n');
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
                context: { line: 1, text: 'NOP' },
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
    const manager = createSourceManager(dir, logs, {
      platform: 'simple',
      resolveDebugMapPath: () => mapPath,
    });

    const state = manager.buildState({
      hexPath,
      sourceRoots: ['src'],
      mapArgs: {},
    });

    expect(state.mapping.segments.length).toBeGreaterThan(0);
    expect(state.mappingIndex.segmentsByAddress.length).toBeGreaterThan(0);
    expect(state.sourceRoots).toContain(path.resolve(dir, 'src'));
    expect(logs.some((line) => line.includes('Source map loaded: simple.d8.json'))).toBe(true);
  });

  it('passes resolved asm path as mapping sourceFile when sourceFile is omitted (e.g. AZM entry only)', () => {
    const dir = makeTempDir('debug80-source-azm-');
    const hexPath = path.join(dir, 'out.hex');
    const asmPath = 'src/matrix.asm';
    writeFile(hexPath, ':00000001FF\n');
    const zaxPath = path.join(dir, 'src', 'matrix.asm');
    writeFile(zaxPath, 'nop\n');

    const buildMappingSpy = vi.spyOn(mappingService, 'buildMappingFromDebugMap');

    const logs: string[] = [];
    const manager = createSourceManager(dir, logs, {
      platform: 'tec1g',
      resolveDebugMapPath: (_a, _b, _c, hex) =>
        path.join(path.dirname(hex), `${path.basename(hex, '.hex')}.d8.json`),
    });

    manager.buildState({
      hexPath,
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

  function makeTempDir(prefix: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tmpDirs.push(dir);
    return dir;
  }

  function createSourceManager(
    dir: string,
    logs: string[],
    options: {
      platform: string;
      resolveDebugMapPath: ConstructorParameters<typeof SourceManager>[0]['resolveDebugMapPath'];
    }
  ): SourceManager {
    return new SourceManager({
      platform: options.platform,
      baseDir: dir,
      resolveRelative: (filePath, baseDir) => path.resolve(baseDir, filePath),
      resolveMappedPath: (filePath) => {
        const candidate = path.resolve(dir, filePath);
        return fs.existsSync(candidate) ? candidate : undefined;
      },
      relativeIfPossible: (filePath, baseDir) => path.relative(baseDir, filePath) || filePath,
      resolveDebugMapPath: options.resolveDebugMapPath,
      logger: createLogger(logs),
    });
  }
});
