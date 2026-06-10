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

  it('indexes AZM project-relative D8 file keys for source breakpoints', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-launch-source-'));
    const projectRoot = path.join(tmpDir, 'project');
    const sourcePath = path.join(projectRoot, 'src', 'pacmo', 'pacmo.z80');
    const hexPath = path.join(projectRoot, 'build', 'pacmo.hex');
    const d8Path = path.join(projectRoot, 'build', 'pacmo.d8.json');

    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, 'ORG 4000h\nSTART:\n  NOP\n');
    fs.mkdirSync(path.dirname(hexPath), { recursive: true });
    fs.writeFileSync(hexPath, ':00000001FF\n');
    fs.writeFileSync(
      d8Path,
      `${JSON.stringify(
        {
          format: 'd8-debug-map',
          version: 1,
          arch: 'z80',
          addressWidth: 16,
          endianness: 'little',
          files: {
            'src/pacmo/pacmo.z80': {
              segments: [{ start: 0x4000, end: 0x4001, lstLine: 1, line: 3, kind: 'code' }],
              symbols: [{ name: 'START', kind: 'label', address: 0x4000, line: 2 }],
            },
          },
          generator: { name: 'azm', tool: 'azm', version: '0.1.1' },
        },
        null,
        2
      )}\n`
    );

    const sourceState = new SourceStateManager();
    const sessionState = createSessionState();
    const result = buildLaunchSourceState(
      { sourceRoots: ['src'], artifactBase: 'pacmo' } as LaunchRequestArguments,
      'tec1g',
      projectRoot,
      sourcePath,
      hexPath,
      sourceState,
      sessionState,
      new NullLogger()
    );

    expect(resolveExecutableLocation(result.mappingIndex, sourcePath, 3)).toEqual([0x4000]);
  });

  it('indexes bundled MON3 D8 file keys for ROM breakpoints', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-launch-rom-source-'));
    const projectRoot = path.join(tmpDir, 'project');
    const sourcePath = path.join(projectRoot, 'src', 'main.asm');
    const hexPath = path.join(projectRoot, 'build', 'main.hex');
    const d8Path = path.join(projectRoot, 'build', 'main.d8.json');
    const bundleRoot = path.join(process.cwd(), 'resources', 'bundles', 'tec1g', 'mon3', 'v1');
    const mon3SourcePath = path.join(bundleRoot, 'mon3.z80');

    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, 'ORG 4000h\nSTART:\n  NOP\n');
    fs.mkdirSync(path.dirname(hexPath), { recursive: true });
    fs.writeFileSync(hexPath, ':00000001FF\n');
    fs.writeFileSync(
      d8Path,
      `${JSON.stringify(
        {
          format: 'd8-debug-map',
          version: 1,
          arch: 'z80',
          addressWidth: 16,
          endianness: 'little',
          files: {
            'src/main.asm': {
              segments: [{ start: 0x4000, end: 0x4001, lstLine: 1, line: 3, kind: 'code' }],
            },
            [mon3SourcePath]: {
              segments: [{ start: 0xc100, end: 0xc101, lstLine: 302, line: 302, kind: 'code' }],
            },
          },
          generator: { name: 'azm', tool: 'azm', version: '0.2.5' },
        },
        null,
        2
      )}\n`
    );

    const sourceState = new SourceStateManager();
    const sessionState = createSessionState();
    const result = buildLaunchSourceState(
      { sourceRoots: ['src'], artifactBase: 'main', outputDir: 'build' } as LaunchRequestArguments,
      'tec1g',
      projectRoot,
      sourcePath,
      hexPath,
      sourceState,
      sessionState,
      new NullLogger()
    );

    expect(resolveExecutableLocation(result.mappingIndex, mon3SourcePath, 302)).toEqual([0xc100]);
  });

  it('reads source-map symbols from the build artifact', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-launch-symbols-'));
    const projectRoot = path.join(tmpDir, 'project');
    const sourcePath = path.join(projectRoot, 'src', 'pacmo.z80');
    const hexPath = path.join(projectRoot, 'build', 'pacmo.hex');
    const buildMapPath = path.join(projectRoot, 'build', 'pacmo.d8.json');

    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.mkdirSync(path.dirname(hexPath), { recursive: true });
    fs.writeFileSync(sourcePath, 'START:\n  NOP\nWIDTH .equ 32\n');
    fs.writeFileSync(hexPath, ':00000001FF\n');
    fs.writeFileSync(
      buildMapPath,
      JSON.stringify({
        format: 'd8-debug-map',
        version: 1,
        arch: 'z80',
        addressWidth: 16,
        endianness: 'little',
        files: {
          'src/pacmo.z80': {
            segments: [{ start: 0x4000, end: 0x4001, lstLine: 1, line: 2, kind: 'code' }],
            symbols: [
              { name: 'START', kind: 'label', address: 0x4000, line: 1 },
              { name: 'WIDTH', kind: 'constant', value: 32, line: 3 },
            ],
          },
        },
        generator: { name: 'azm' },
      })
    );
    const sourceState = new SourceStateManager();
    const sessionState = createSessionState();
    const result = buildLaunchSourceState(
      { artifactBase: 'pacmo', outputDir: 'build' } as LaunchRequestArguments,
      'tec1g',
      projectRoot,
      sourcePath,
      hexPath,
      sourceState,
      sessionState,
      new NullLogger()
    );

    expect(result.sourceMapSymbols.some((symbol) => symbol.name === 'WIDTH')).toBe(true);
    expect(result.sourceMapSymbols.find((symbol) => symbol.name === 'WIDTH')?.value).toBe(32);
  });

  it('resolves local ROM D8 file keys through source roots, not the map directory', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-launch-local-rom-source-'));
    const projectRoot = path.join(tmpDir, 'project');
    const sourcePath = path.join(projectRoot, 'src', 'main.asm');
    const hexPath = path.join(projectRoot, 'build', 'main.hex');
    const buildMapPath = path.join(projectRoot, 'build', 'main.d8.json');
    const localRomSourcePath = path.join(projectRoot, 'roms', 'tec1g', 'mon3', 'mon3.z80');
    const localRomMapPath = path.join(
      projectRoot,
      'build',
      'roms',
      'tec1g',
      'mon3',
      'mon3.d8.json'
    );

    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.mkdirSync(path.dirname(localRomSourcePath), { recursive: true });
    fs.mkdirSync(path.dirname(hexPath), { recursive: true });
    fs.mkdirSync(path.dirname(localRomMapPath), { recursive: true });
    fs.writeFileSync(sourcePath, 'START:\n  NOP\n');
    fs.writeFileSync(localRomSourcePath, 'Boot:\n  nop\n');
    fs.writeFileSync(hexPath, ':00000001FF\n');
    fs.writeFileSync(
      buildMapPath,
      JSON.stringify({
        format: 'd8-debug-map',
        version: 1,
        arch: 'z80',
        addressWidth: 16,
        endianness: 'little',
        files: {
          'src/main.asm': {
            segments: [{ start: 0x4000, end: 0x4001, lstLine: 1, line: 2, kind: 'code' }],
          },
        },
        generator: { name: 'azm' },
      })
    );
    fs.writeFileSync(
      localRomMapPath,
      JSON.stringify({
        format: 'd8-debug-map',
        version: 1,
        arch: 'z80',
        addressWidth: 16,
        endianness: 'little',
        files: {
          'roms/tec1g/mon3/mon3.z80': {
            segments: [{ start: 0x0000, end: 0x0001, lstLine: 1, line: 2, kind: 'code' }],
            symbols: [{ name: 'Boot', kind: 'label', address: 0x0000, line: 1 }],
          },
        },
        generator: { name: 'azm' },
      })
    );

    const sourceState = new SourceStateManager();
    const sessionState = createSessionState();
    const result = buildLaunchSourceState(
      {
        sourceRoots: ['src', 'roms/tec1g/mon3'],
        artifactBase: 'main',
        outputDir: 'build',
        debugMaps: [localRomMapPath],
      } as LaunchRequestArguments,
      'tec1g',
      projectRoot,
      sourcePath,
      hexPath,
      sourceState,
      sessionState,
      new NullLogger()
    );

    const localRomSourceSuffix = ['roms', 'tec1g', 'mon3', 'mon3.z80'].join('/');
    const toPortablePath = (value: string) => value.replace(/\\/g, '/');
    expect(result.romSourcePaths.map(toPortablePath)).toContainEqual(
      expect.stringContaining(localRomSourceSuffix)
    );
    expect(result.autoOpenRomSourcePaths.map(toPortablePath)).toContainEqual(
      expect.stringContaining(localRomSourceSuffix)
    );
    expect(toPortablePath(result.sourceMapSymbols.find((symbol) => symbol.name === 'Boot')?.file ?? '')).toContain(
      localRomSourceSuffix
    );
  });

  it('logs a warning and returns no symbols when the build D8 cannot be parsed', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-launch-bad-symbol-map-'));
    const projectRoot = path.join(tmpDir, 'project');
    const sourcePath = path.join(projectRoot, 'src', 'main.asm');
    const hexPath = path.join(projectRoot, 'build', 'main.hex');
    const buildMapPath = path.join(projectRoot, 'build', 'main.d8.json');
    const logger = new RecordingLogger();

    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.mkdirSync(path.dirname(hexPath), { recursive: true });
    fs.writeFileSync(sourcePath, 'START:\n  NOP\n');
    fs.writeFileSync(hexPath, ':00000001FF\n');
    fs.writeFileSync(buildMapPath, '{not valid JSON');

    const sourceState = new SourceStateManager();
    const sessionState = createSessionState();
    const result = buildLaunchSourceState(
      { artifactBase: 'main', outputDir: 'build' } as LaunchRequestArguments,
      'tec1g',
      projectRoot,
      sourcePath,
      hexPath,
      sourceState,
      sessionState,
      logger
    );

    expect(result.sourceMapSymbols).toEqual([]);
    expect(logger.warns.some((message) => message.includes('Could not read source map symbols'))).toBe(
      true
    );
  });

  it('logs unreadable auxiliary D8 maps while keeping symbols from the build artifact', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-launch-missing-aux-symbol-map-'));
    const projectRoot = path.join(tmpDir, 'project');
    const sourcePath = path.join(projectRoot, 'src', 'main.asm');
    const hexPath = path.join(projectRoot, 'build', 'main.hex');
    const buildMapPath = path.join(projectRoot, 'build', 'main.d8.json');
    const missingAuxMapPath = path.join(projectRoot, 'build', 'roms', 'missing.d8.json');
    const logger = new RecordingLogger();

    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.mkdirSync(path.dirname(hexPath), { recursive: true });
    fs.writeFileSync(sourcePath, 'Main:\n  NOP\n');
    fs.writeFileSync(hexPath, ':00000001FF\n');
    fs.writeFileSync(
      buildMapPath,
      JSON.stringify({
        format: 'd8-debug-map',
        version: 1,
        arch: 'z80',
        addressWidth: 16,
        endianness: 'little',
        files: {
          'src/main.asm': {
            segments: [{ start: 0x4000, end: 0x4001, lstLine: 1, line: 2, kind: 'code' }],
            symbols: [{ name: 'Main', kind: 'label', address: 0x4000, line: 1 }],
          },
        },
        generator: { name: 'azm' },
      })
    );

    const sourceState = new SourceStateManager();
    const sessionState = createSessionState();
    const result = buildLaunchSourceState(
      {
        artifactBase: 'main',
        outputDir: 'build',
        debugMaps: [missingAuxMapPath],
      } as LaunchRequestArguments,
      'tec1g',
      projectRoot,
      sourcePath,
      hexPath,
      sourceState,
      sessionState,
      logger
    );

    expect(result.sourceMapSymbols.map((symbol) => symbol.name)).toEqual(['Main']);
    expect(logger.warns.some((message) => message.includes('Failed to read source map symbols'))).toBe(
      true
    );
  });
});

class RecordingLogger implements Logger {
  public readonly warns: string[] = [];

  public debug(): void {}

  public info(): void {}

  public warn(message: string): void {
    this.warns.push(message);
  }

  public error(): void {}
}
