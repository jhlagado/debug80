/**
 * @file Direct characterization tests for launch-session orchestration.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as vscodeMock from '../e2e/adapter/vscode-mock';

vi.mock('vscode', () => vscodeMock);

import {
  buildLaunchSession,
  hasLaunchInputs,
  MissingLaunchArtifactsError,
} from '../../src/debug/launch/launch-sequence';
import { SourceStateManager } from '../../src/debug/mapping/source-state-manager';
import { PlatformRegistry } from '../../src/debug/session/platform-registry';
import { createSessionState } from '../../src/debug/session/session-state';
import type { LaunchRequestArguments } from '../../src/debug/session/types';
import type { Logger } from '../../src/util/logger';

const { workspace } = vscodeMock;

let tempRoots: string[] = [];

function makeTempRoot(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempRoots.push(root);
  return root;
}

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function writeLaunchFixture(): { root: string; sourcePath: string; hexPath: string } {
  const root = makeTempRoot('debug80-launch-sequence-');
  const sourcePath = path.join(root, 'src', 'main.asm');
  const hexPath = path.join(root, 'build', 'main.hex');
  const mapPath = path.join(root, 'build', 'main.d8.json');
  writeFile(sourcePath, 'Start: nop\n');
  writeFile(hexPath, ':0140000000BF\n:00000001FF\n');
  writeFile(
    mapPath,
    `${JSON.stringify(
      {
        format: 'd8-debug-map',
        version: 1,
        arch: 'z80',
        addressWidth: 16,
        endianness: 'little',
        generator: { name: 'azm-test' },
        files: {
          'src/main.asm': {
            segments: [
              {
                start: 0x4000,
                end: 0x4001,
                line: 1,
                lstLine: 1,
                kind: 'code',
                confidence: 'high',
              },
            ],
            symbols: [
              {
                name: 'Start',
                address: 0x4000,
                line: 1,
                kind: 'label',
                scope: 'global',
              },
            ],
          },
        },
      },
      null,
      2
    )}\n`
  );
  return { root, sourcePath, hexPath };
}

function createLogger(logs: string[] = []): Logger {
  const push = (level: string, message: string, args: unknown[]): void => {
    logs.push([level, message, ...args].map(String).join(' '));
  };
  return {
    debug: (message, ...args) => push('debug', message, args),
    info: (message, ...args) => push('info', message, args),
    warn: (message, ...args) => push('warn', message, args),
    error: (message, ...args) => push('error', message, args),
  };
}

function createContext(logger: Logger = createLogger()) {
  return {
    logger,
    sessionState: createSessionState(),
    sourceState: new SourceStateManager(),
    platformRegistry: new PlatformRegistry(),
    matrixHeldKeys: new Map(),
    emitEvent: vi.fn(),
    emitDapEvent: vi.fn(),
    sendResponse: vi.fn(),
    sendErrorResponse: vi.fn(),
  };
}

describe('launch-sequence', () => {
  beforeEach(() => {
    tempRoots = [];
    workspace.workspaceFolders = undefined;
  });

  afterEach(() => {
    for (const root of tempRoots) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not treat stray TEC-1G ROM artifacts as launch input for non-TEC-1G platforms', () => {
    expect(
      hasLaunchInputs({
        platform: 'simple',
        tec1g: {
          romArtifacts: [
            {
              id: 'stray-monitor',
              role: 'monitor',
              sourceFile: 'roms/monitor.asm',
              outputBin: 'build/monitor.bin',
              address: 0xc000,
              size: 0x4000,
            },
          ],
        },
      })
    ).toBe(false);
  });

  it('builds a simple launch session from HEX and D8 artifacts', async () => {
    const fixture = writeLaunchFixture();
    workspace.workspaceFolders = [{ uri: { fsPath: fixture.root } }];
    const context = createContext();
    const args: LaunchRequestArguments = {
      platform: 'simple',
      assemble: false,
      hex: 'build/main.hex',
      sourceFile: 'src/main.asm',
      outputDir: 'build',
      artifactBase: 'main',
      simple: { entry: 0x4000 },
    };

    const artifacts = await buildLaunchSession(args, context);

    expect(artifacts.platform).toBe('simple');
    expect(artifacts.loadedEntry).toBe(0x4000);
    expect(artifacts.runtime.getPC()).toBe(0x4000);
    expect(artifacts.loadedProgram.memory[0x4000]).toBe(0x00);
    expect(artifacts.symbolList).toContainEqual({ name: 'Start', address: 0x4000 });
    expect(artifacts.sourceMapSymbols).toHaveLength(1);
    expect(artifacts.sourceMapSymbols[0]).toEqual(
      expect.objectContaining({
        name: 'Start',
        address: 0x4000,
      })
    );
    expect(artifacts.sourceMapSymbols[0]?.file.endsWith(path.join('src', 'main.asm'))).toBe(true);
    expect(context.sessionState.runtime).toBe(artifacts.runtime);
    expect(context.sessionState.baseDir).toBe(fixture.root);
    expect(context.emitDapEvent).toHaveBeenCalledWith('debug80/platform', { id: 'simple' });
    expect(context.sourceState.file).toBe(path.join(fixture.root, 'src', 'main.asm'));
  });

  it('throws a missing-artifacts error before runtime creation when HEX is absent', async () => {
    const root = makeTempRoot('debug80-launch-missing-');
    workspace.workspaceFolders = [{ uri: { fsPath: root } }];
    const context = createContext();

    await expect(
      buildLaunchSession(
        {
          platform: 'simple',
          assemble: false,
          hex: 'build/missing.hex',
          simple: { entry: 0x4000 },
        },
        context
      )
    ).rejects.toBeInstanceOf(MissingLaunchArtifactsError);
    expect(context.sessionState.runtime).toBeUndefined();
  });

  it('builds a TEC-1G ROM-first launch session without a RAM app target', async () => {
    const root = makeTempRoot('debug80-rom-first-launch-');
    workspace.workspaceFolders = [{ uri: { fsPath: root } }];
    writeFile(
      path.join(root, 'roms', 'tec1g', 'tecm8', 'monitor', 'monitor.asm'),
      [
        '        .org    0xC000',
        '@Tecm8MonitorEntry:',
        '        JP      Tecm8MonitorHold',
        'Tecm8MonitorHold:',
        '        JP      Tecm8MonitorHold',
        '',
      ].join('\n')
    );
    writeFile(
      path.join(root, 'roms', 'tec1g', 'tecm8', 'expansion', 'expansion.asm'),
      ['        .org    0x8000', '@Tecm8ExpansionEntry:', '        RET', ''].join('\n')
    );
    const context = createContext();
    const args: LaunchRequestArguments = {
      platform: 'tec1g',
      assemble: false,
      tec1g: {
        entry: 0,
        romArtifacts: [
          {
            id: 'tecm8-monitor',
            role: 'monitor',
            sourceFile: 'roms/tec1g/tecm8/monitor/monitor.asm',
            outputBin: 'build/roms/tec1g/tecm8/monitor/monitor.bin',
            outputDebugMap: 'build/roms/tec1g/tecm8/monitor/monitor.d8.json',
            address: 0xc000,
            size: 0x4000,
          },
          {
            id: 'tecm8-expansion',
            role: 'expansion',
            sourceFile: 'roms/tec1g/tecm8/expansion/expansion.asm',
            outputBin: 'build/roms/tec1g/tecm8/expansion/expansion.bin',
            outputDebugMap: 'build/roms/tec1g/tecm8/expansion/expansion.d8.json',
            windowAddress: 0x8000,
            windowSize: 0x4000,
            imageSize: 0x4000,
            bankSize: 0x4000,
            bankCount: 1,
          },
        ],
      },
    };

    const artifacts = await buildLaunchSession(args, context);

    expect(artifacts.platform).toBe('tec1g');
    expect(artifacts.runtime.getPC()).toBe(0x8000);
    expect(args.tec1g?.romHex).toBe(
      path.join(root, 'build', 'roms', 'tec1g', 'tecm8', 'monitor', 'monitor.bin')
    );
    expect(args.tec1g?.expansionRomHex).toBe(
      path.join(root, 'build', 'roms', 'tec1g', 'tecm8', 'expansion', 'expansion.bin')
    );
    expect(fs.existsSync(args.tec1g?.romHex ?? '')).toBe(true);
    expect(fs.existsSync(args.tec1g?.expansionRomHex ?? '')).toBe(true);
    expect(context.sessionState.runtime).toBe(artifacts.runtime);
  });
});
