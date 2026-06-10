/**
 * @file Direct characterization tests for launch-session orchestration.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as vscodeMock from '../e2e/adapter/vscode-mock';

vi.mock('vscode', () => vscodeMock);

import {
  buildLaunchSession,
  MissingLaunchArtifactsError,
} from '../../src/debug/launch/launch-sequence';
import { SourceStateManager } from '../../src/debug/mapping/source-state-manager';
import { PlatformRegistry } from '../../src/debug/session/platform-registry';
import { createSessionState } from '../../src/debug/session/session-state';
import type { LaunchRequestArguments } from '../../src/debug/session/types';
import type { Logger } from '../../src/util/logger';

const { workspace } = vscodeMock;

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function writeLaunchFixture(): { root: string; sourcePath: string; hexPath: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-launch-sequence-'));
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
    workspace.workspaceFolders = undefined;
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
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-launch-missing-'));
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
});
