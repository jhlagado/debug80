/**
 * @file Launch source-state tests.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildLaunchSourceState } from '../../src/debug/launch/launch-source-state';
import { SourceStateManager } from '../../src/debug/mapping/source-state-manager';
import { createSessionState } from '../../src/debug/session/session-state';
import type { LaunchRequestArguments } from '../../src/debug/session/types';
import { resolveExecutableLocation } from '../../src/mapping/source-map';
import type { Logger } from '../../src/util/logger';
import { NullLogger } from '../../src/util/logger';

type D8MapFiles = Record<
  string,
  {
    segments?: Array<Record<string, unknown>>;
    symbols?: Array<Record<string, unknown>>;
  }
>;

interface LaunchProjectFixture {
  projectRoot: string;
  sourcePath: string;
  hexPath: string;
  buildMapPath: string;
}

vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [],
  },
}));

describe('launch-source-state', () => {
  let tmpDir: string;

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const createProjectFixture = (
    prefix: string,
    sourceRelativePath: string,
    artifactBase: string
  ): LaunchProjectFixture => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    const projectRoot = path.join(tmpDir, 'project');
    const sourcePath = path.join(projectRoot, sourceRelativePath);
    const hexPath = path.join(projectRoot, 'build', `${artifactBase}.hex`);
    const buildMapPath = path.join(projectRoot, 'build', `${artifactBase}.d8.json`);

    writeTextFile(sourcePath, 'ORG 4000h\nSTART:\n  NOP\n');
    writeTextFile(hexPath, ':00000001FF\n');

    return { projectRoot, sourcePath, hexPath, buildMapPath };
  };

  const buildFixtureSourceState = (
    fixture: LaunchProjectFixture,
    args: LaunchRequestArguments,
    logger: Logger = new NullLogger()
  ) => {
    return buildLaunchSourceState(
      args,
      'tec1g',
      fixture.projectRoot,
      fixture.sourcePath,
      fixture.hexPath,
      new SourceStateManager(),
      createSessionState(),
      logger
    );
  };

  it('indexes AZM project-relative D8 file keys for source breakpoints', () => {
    const fixture = createProjectFixture(
      'debug80-launch-source-',
      path.join('src', 'pacmo', 'pacmo.z80'),
      'pacmo'
    );
    writeD8Map(
      fixture.buildMapPath,
      {
        'src/pacmo/pacmo.z80': {
          segments: [{ start: 0x4000, end: 0x4001, lstLine: 1, line: 3, kind: 'code' }],
          symbols: [{ name: 'START', kind: 'label', address: 0x4000, line: 2 }],
        },
      },
      { name: 'azm', tool: 'azm', version: '0.1.1' }
    );

    const result = buildFixtureSourceState(
      fixture,
      { sourceRoots: ['src'], artifactBase: 'pacmo' } as LaunchRequestArguments,
      new NullLogger()
    );

    expect(resolveExecutableLocation(result.mappingIndex, fixture.sourcePath, 3)).toEqual([0x4000]);
  });

  it('indexes bundled MON3 D8 file keys for ROM breakpoints', () => {
    const fixture = createProjectFixture(
      'debug80-launch-rom-source-',
      path.join('src', 'main.asm'),
      'main'
    );
    const bundleRoot = path.join(process.cwd(), 'resources', 'bundles', 'tec1g', 'mon3', 'v1');
    const mon3SourcePath = path.join(bundleRoot, 'mon3.z80');

    writeD8Map(
      fixture.buildMapPath,
      {
        'src/main.asm': {
          segments: [{ start: 0x4000, end: 0x4001, lstLine: 1, line: 3, kind: 'code' }],
        },
        [mon3SourcePath]: {
          segments: [{ start: 0xc100, end: 0xc101, lstLine: 302, line: 302, kind: 'code' }],
        },
      },
      { name: 'azm', tool: 'azm', version: '0.2.5' }
    );

    const result = buildFixtureSourceState(
      fixture,
      { sourceRoots: ['src'], artifactBase: 'main', outputDir: 'build' } as LaunchRequestArguments,
      new NullLogger()
    );

    expect(resolveExecutableLocation(result.mappingIndex, mon3SourcePath, 302)).toEqual([0xc100]);
  });

  it('reads source-map symbols from the build artifact', () => {
    const fixture = createProjectFixture(
      'debug80-launch-symbols-',
      path.join('src', 'pacmo.z80'),
      'pacmo'
    );
    writeTextFile(fixture.sourcePath, 'START:\n  NOP\nWIDTH .equ 32\n');
    writeD8Map(fixture.buildMapPath, {
      'src/pacmo.z80': {
        segments: [{ start: 0x4000, end: 0x4001, lstLine: 1, line: 2, kind: 'code' }],
        symbols: [
          { name: 'START', kind: 'label', address: 0x4000, line: 1 },
          { name: 'WIDTH', kind: 'constant', value: 32, line: 3 },
        ],
      },
    });

    const result = buildFixtureSourceState(
      fixture,
      { artifactBase: 'pacmo', outputDir: 'build' } as LaunchRequestArguments
    );

    expect(result.sourceMapSymbols.some((symbol) => symbol.name === 'WIDTH')).toBe(true);
    expect(result.sourceMapSymbols.find((symbol) => symbol.name === 'WIDTH')?.value).toBe(32);
  });

  it('resolves local ROM D8 file keys through source roots, not the map directory', () => {
    const fixture = createProjectFixture(
      'debug80-launch-local-rom-source-',
      path.join('src', 'main.asm'),
      'main'
    );
    const localRomSourcePath = path.join(
      fixture.projectRoot,
      'roms',
      'tec1g',
      'mon3',
      'mon3.z80'
    );
    const localRomMapPath = path.join(
      fixture.projectRoot,
      'build',
      'roms',
      'tec1g',
      'mon3',
      'mon3.d8.json'
    );

    writeTextFile(localRomSourcePath, 'Boot:\n  nop\n');
    writeD8Map(fixture.buildMapPath, {
      'src/main.asm': {
        segments: [{ start: 0x4000, end: 0x4001, lstLine: 1, line: 2, kind: 'code' }],
      },
    });
    writeD8Map(localRomMapPath, {
      'roms/tec1g/mon3/mon3.z80': {
        segments: [{ start: 0x0000, end: 0x0001, lstLine: 1, line: 2, kind: 'code' }],
        symbols: [{ name: 'Boot', kind: 'label', address: 0x0000, line: 1 }],
      },
    });

    const result = buildFixtureSourceState(
      fixture,
      {
        sourceRoots: ['src', 'roms/tec1g/mon3'],
        artifactBase: 'main',
        outputDir: 'build',
        debugMaps: [localRomMapPath],
      } as LaunchRequestArguments
    );

    const localRomSourceSuffix = ['roms', 'tec1g', 'mon3', 'mon3.z80'].join('/');
    expect(result.romSourcePaths.map(toPortablePath)).toContainEqual(
      expect.stringContaining(localRomSourceSuffix)
    );
    expect(result.autoOpenRomSourcePaths.map(toPortablePath)).toContainEqual(
      expect.stringContaining(localRomSourceSuffix)
    );
    expect(
      toPortablePath(result.sourceMapSymbols.find((symbol) => symbol.name === 'Boot')?.file ?? '')
    ).toContain(localRomSourceSuffix);
  });

  it('logs a warning and returns no symbols when the build D8 cannot be parsed', () => {
    const fixture = createProjectFixture(
      'debug80-launch-bad-symbol-map-',
      path.join('src', 'main.asm'),
      'main'
    );
    const logger = new RecordingLogger();

    writeD8Text(fixture.buildMapPath, '{not valid JSON');

    const result = buildFixtureSourceState(
      fixture,
      { artifactBase: 'main', outputDir: 'build' } as LaunchRequestArguments,
      logger
    );

    expect(result.sourceMapSymbols).toEqual([]);
    expect(logger.warns.some((message) => message.includes('Could not read source map symbols'))).toBe(
      true
    );
  });

  it('logs unreadable auxiliary D8 maps while keeping symbols from the build artifact', () => {
    const fixture = createProjectFixture(
      'debug80-launch-missing-aux-symbol-map-',
      path.join('src', 'main.asm'),
      'main'
    );
    const missingAuxMapPath = path.join(fixture.projectRoot, 'build', 'roms', 'missing.d8.json');
    const logger = new RecordingLogger();

    writeTextFile(fixture.sourcePath, 'Main:\n  NOP\n');
    writeD8Map(fixture.buildMapPath, {
      'src/main.asm': {
        segments: [{ start: 0x4000, end: 0x4001, lstLine: 1, line: 2, kind: 'code' }],
        symbols: [{ name: 'Main', kind: 'label', address: 0x4000, line: 1 }],
      },
    });

    const result = buildFixtureSourceState(
      fixture,
      {
        artifactBase: 'main',
        outputDir: 'build',
        debugMaps: [missingAuxMapPath],
      } as LaunchRequestArguments,
      logger
    );

    expect(result.sourceMapSymbols.map((symbol) => symbol.name)).toEqual(['Main']);
    expect(result.romSourcePaths).toEqual([]);
    expect(result.autoOpenRomSourcePaths).toEqual([]);
    expect(logger.warns.some((message) => message.includes('Failed to read source map symbols'))).toBe(
      true
    );
  });
});

function writeTextFile(filePath: string, contents: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function writeD8Text(filePath: string, contents: string): void {
  writeTextFile(filePath, contents);
}

function writeD8Map(
  filePath: string,
  files: D8MapFiles,
  generator: Record<string, string> = { name: 'azm' }
): void {
  writeD8Text(
    filePath,
    `${JSON.stringify(
      {
        format: 'd8-debug-map',
        version: 1,
        arch: 'z80',
        addressWidth: 16,
        endianness: 'little',
        files,
        generator,
      },
      null,
      2
    )}\n`
  );
}

function toPortablePath(value: string): string {
  return value.replace(/\\/g, '/');
}

class RecordingLogger implements Logger {
  public readonly warns: string[] = [];

  public debug(): void {}

  public info(): void {}

  public warn(message: string): void {
    this.warns.push(message);
  }

  public error(): void {}
}
