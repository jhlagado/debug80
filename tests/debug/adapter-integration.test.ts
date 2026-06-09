/**
 * @file Adapter integration tests for launch/custom-request seams.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as vscodeMock from '../e2e/adapter/vscode-mock';

const { getExtension } = vi.hoisted(() => ({
  getExtension: vi.fn(() => undefined),
}));

vi.mock('vscode', () => {
  return {
    ...vscodeMock,
    extensions: {
      getExtension,
    },
  };
});

import { createDefaultProjectConfig } from '../../src/extension/project-scaffolding';
import { getProjectKitById } from '../../src/extension/project-kits';
import {
  configureAndReadStoppedFrame,
  createWorkspaceHarness,
  disposeHarness,
  initialize,
  launchWithDiagnostics,
  readTopStackFrame,
  type SessionHarness,
} from '../e2e/adapter/harness';
const { commands, workspace } = vscodeMock;

const fixtureRoot = path.resolve(__dirname, '../e2e/fixtures/simple');
const sourcePath = path.join(fixtureRoot, 'src', 'simple.asm');
const debug80Root = path.resolve(__dirname, '../..');
const defaultLaunchFlags = {
  openRomSourcesOnLaunch: false,
  openMainSourceOnLaunch: false,
} as const;

type AdapterClient = SessionHarness['client'];

function createFreshProjectFixture(kitId: 'tec1/mon1b' | 'tec1g/mon3'): {
  root: string;
  sourcePath: string;
} {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-fresh-project-'));
  const sourceDir = path.join(root, 'src');
  const buildDir = path.join(root, 'build');
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.mkdirSync(buildDir, { recursive: true });

  const kit = getProjectKitById(kitId);
  if (kit === undefined) {
    throw new Error(`Missing project kit ${kitId}`);
  }

  const sourcePath = path.join(root, 'src', 'main.asm');
  fs.writeFileSync(
    sourcePath,
    kitId === 'tec1g/mon3'
      ? '; Debug80 starter (TEC-1G / MON-3)\n        ORG 0x4000\n\nstart:  NOP\n        JR  start\n'
      : '; Debug80 starter (TEC-1 / MON-1B)\n        ORG 0x0800\n\nstart:  NOP\n        JR  start\n'
  );
  fs.writeFileSync(
    path.join(buildDir, 'main.hex'),
    kitId === 'tec1g/mon3' ? ':034000000018FDA8\n:00000001FF\n' : ':030800000018FDE0\n:00000001FF\n'
  );
  const startAddress = kitId === 'tec1g/mon3' ? 0x4000 : 0x0800;
  fs.writeFileSync(
    path.join(buildDir, 'main.d8.json'),
    `${JSON.stringify(
      {
        format: 'd8-debug-map',
        version: 1,
        arch: 'z80',
        addressWidth: 16,
        endianness: 'little',
        generator: { name: 'debug80-fresh-project-fixture' },
        files: {
          'src/main.asm': {
            segments: [
              {
                start: startAddress,
                end: startAddress + 1,
                line: 4,
                lstLine: 4,
                lstText: 'start:  NOP',
                kind: 'code',
                confidence: 'high',
              },
              {
                start: startAddress + 1,
                end: startAddress + 3,
                line: 5,
                lstLine: 5,
                lstText: '        JR  start',
                kind: 'code',
                confidence: 'high',
              },
            ],
            symbols: [
              {
                name: 'start',
                address: startAddress,
                line: 4,
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
  fs.writeFileSync(
    path.join(root, 'debug80.json'),
    `${JSON.stringify(
      createDefaultProjectConfig({
        kit,
        targetName: 'app',
        sourceFile: 'src/main.asm',
        outputDir: 'build',
        artifactBase: 'main',
      }),
      null,
      2
    )}\n`
  );

  return { root, sourcePath };
}

function useFreshProjectFixture(kitId: 'tec1/mon1b' | 'tec1g/mon3'): {
  root: string;
  sourcePath: string;
} {
  const fixture = createFreshProjectFixture(kitId);
  workspace.workspaceFolders = [{ uri: { fsPath: fixture.root } }];
  getExtension.mockReturnValue({ extensionPath: debug80Root } as never);
  return fixture;
}

async function launchApp(client: AdapterClient, args: Record<string, unknown> = {}): Promise<void> {
  await initialize(client);
  await launchWithDiagnostics(client, {
    target: 'app',
    ...defaultLaunchFlags,
    ...args,
  });
}

describe('adapter integration', () => {
  let harness: SessionHarness | undefined;

  beforeEach(() => {
    vi.restoreAllMocks();
    getExtension.mockReset();
    getExtension.mockReturnValue(undefined);
    harness = createWorkspaceHarness(fixtureRoot);
  });

  afterEach(() => {
    disposeHarness(harness);
    harness = undefined;
  });

  it('initialize response advertises setVariable for native register editing', async () => {
    const { client } = harness!;
    const initResp = await client.sendRequest<{ body?: { supportsSetVariable?: boolean } }>(
      'initialize',
      {
        adapterID: 'z80',
        pathFormat: 'path',
        linesStartAt1: true,
        columnsStartAt1: true,
      }
    );
    expect(initResp.body?.supportsSetVariable).toBe(true);
    await client.waitForEvent('initialized');
    await client.sendRequest('disconnect');
  });

  it('launches from discovered workspace config when projectConfig is omitted', async () => {
    const { client } = harness!;

    await launchApp(client, {
      stopOnEntry: true,
    });
    await client.sendRequest('setBreakpoints', {
      source: { path: sourcePath },
      breakpoints: [],
    });
    const { stopped, frame } = await configureAndReadStoppedFrame(client);
    expect(stopped.body?.reason).toBe('entry');

    expect(frame?.line).toBe(2);
    expect(frame?.source?.path).toBe(sourcePath);

    await client.sendRequest('disconnect');
  });

  it('does not publish stop-on-entry before configuration is done', async () => {
    const { client } = harness!;

    await launchApp(client, {
      stopOnEntry: true,
    });

    await expect(client.waitForEvent('stopped', undefined, 50)).rejects.toThrow(
      'Timeout waiting for event stopped'
    );

    await client.sendRequest('configurationDone');
    const stopped = await client.waitForEvent<{ body?: { reason?: string } }>('stopped');
    expect(stopped.body?.reason).toBe('entry');

    await client.sendRequest('disconnect');
  });

  it('routes built-in memory snapshot requests through the adapter after launch', async () => {
    const { client } = harness!;

    await launchApp(client, {
      stopOnEntry: true,
    });
    await client.sendRequest('setBreakpoints', {
      source: { path: sourcePath },
      breakpoints: [],
    });
    await client.sendRequest('configurationDone');
    await client.waitForEvent('stopped');

    const snapshot = await client.sendRequest<{
      body?: {
        before?: number;
        rowSize?: number;
        views?: Array<{ view?: string; address?: number; bytes?: number[]; focus?: number }>;
        registers?: { pc?: number; sp?: number };
      };
    }>('debug80/memorySnapshot', {
      before: 8,
      rowSize: 8,
      views: [{ id: 'pc', view: 'pc', after: 8 }],
    });

    expect(snapshot.body?.before).toBe(8);
    expect(snapshot.body?.rowSize).toBe(8);
    expect(snapshot.body?.registers?.pc).toBe(0);
    expect(snapshot.body?.views).toHaveLength(1);
    expect(snapshot.body?.views?.[0]?.view).toBe('pc');
    expect(snapshot.body?.views?.[0]?.address).toBe(0);
    expect(snapshot.body?.views?.[0]?.bytes?.length).toBeGreaterThan(0);
    expect(snapshot.body?.views?.[0]?.focus).toBeGreaterThanOrEqual(0);

    await client.sendRequest('disconnect');
  });

  it('routes TEC-1 provider requests through the adapter and emits update events', async () => {
    const { client } = harness!;

    await launchApp(client, {
      platform: 'tec1',
      tec1: {
        entry: 0,
      },
      stopOnEntry: true,
    });
    await client.sendRequest('setBreakpoints', {
      source: { path: sourcePath },
      breakpoints: [],
    });
    await client.sendRequest('configurationDone');
    await client.waitForEvent('stopped');

    await client.sendRequest('debug80/tec1Speed', { mode: 'slow' });

    const update = await client.waitForEvent<{
      body?: { speedMode?: string; lcd?: number[]; digits?: number[] };
    }>(
      'debug80/tec1Update',
      (event) => (event.body as { speedMode?: unknown } | undefined)?.speedMode === 'slow'
    );
    expect(update.body?.speedMode).toBe('slow');
    expect(update.body?.digits).toBeDefined();
    expect(update.body?.lcd).toBeDefined();

    await client.sendRequest('disconnect');
  });

  it('emits an initial TEC-1 update before user interaction', async () => {
    const fixture = useFreshProjectFixture('tec1/mon1b');

    const { client } = harness!;

    await launchApp(client, {
      assemble: false,
      stopOnEntry: true,
    });

    const update = await client.waitForEvent<{
      body?: { speedMode?: string; lcd?: number[] };
    }>('debug80/tec1Update', undefined, 1000);

    expect(update.body?.speedMode).toBe('fast');
    expect(update.body?.lcd).toHaveLength(32);

    await client.sendRequest('disconnect');
    fs.rmSync(fixture.root, { recursive: true, force: true });
  });

  it('emits an initial TEC-1G update for a freshly initialized MON-3 project before user interaction', async () => {
    const fixture = useFreshProjectFixture('tec1g/mon3');

    const { client } = harness!;

    await launchApp(client, {
      assemble: false,
      stopOnEntry: true,
    });

    const update = await client.waitForEvent<{
      body?: { speedMode?: string; lcd?: number[]; sysCtrl?: number };
    }>('debug80/tec1gUpdate', undefined, 1000);

    expect(update.body?.speedMode).toBe('fast');
    expect(update.body?.sysCtrl).toBe(0);
    expect(update.body?.lcd?.[0]).toBe('A'.charCodeAt(0));

    await client.sendRequest('disconnect');
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }, 15_000);

  describe('TEC-1G/MON-3 golden launch contract', () => {
    it('maps fresh-project target source, ROM entry frames, ROM breakpoints, and ROM source picker contents', async () => {
      const fixture = useFreshProjectFixture('tec1g/mon3');

      const { client } = harness!;

      await launchApp(client, {
        assemble: false,
        stopOnEntry: true,
      });
      const mon3SourcePath = path.join(
        debug80Root,
        'resources',
        'bundles',
        'tec1g',
        'mon3',
        'v1',
        'mon3.z80'
      );
      const userBreakpoints = await client.sendRequest<{
        body?: { breakpoints?: Array<{ verified?: boolean; line?: number }> };
      }>('setBreakpoints', {
        source: { path: fixture.sourcePath },
        breakpoints: [{ line: 4 }],
      });
      expect(userBreakpoints.body?.breakpoints?.[0]?.verified).toBe(true);

      const romBreakpoints = await client.sendRequest<{
        body?: { breakpoints?: Array<{ verified?: boolean; line?: number }> };
      }>('setBreakpoints', {
        source: { path: mon3SourcePath },
        breakpoints: [{ line: 302 }],
      });
      expect(romBreakpoints.body?.breakpoints?.[0]?.verified).toBe(true);

      await client.sendRequest('configurationDone');
      await client.waitForEvent('stopped');

      const frame = await readTopStackFrame(client);
      expect(frame?.source?.path).toBe(mon3SourcePath);
      expect(frame?.line).toBe(171);

      const romSources = await client.sendRequest<{
        body?: { sources?: Array<{ path?: string }> };
      }>('debug80/romSources');
      expect(
        romSources.body?.sources?.some((source) => source.path?.endsWith('disassembler.z80'))
      ).toBe(true);
      expect(romSources.body?.sources?.find((source) => source.path === mon3SourcePath)).toEqual({
        label: 'mon3.z80',
        path: mon3SourcePath,
        kind: 'source',
        autoOpen: true,
      });

      const sourceMapStatus = await client.sendRequest<{
        body?: {
          targetMap?: { path?: string; exists?: boolean };
          auxiliaryMaps?: Array<{ path?: string; exists?: boolean }>;
          counts?: { sourceFiles?: number; symbols?: number; segments?: number };
          currentPc?: {
            address?: number;
            mapsToSource?: boolean;
            source?: { path?: string; line?: number };
          };
        };
      }>('debug80/sourceMapStatus');
      expect(sourceMapStatus.body?.targetMap?.path).toBe(
        path.join(fixture.root, 'build', 'main.d8.json')
      );
      expect(sourceMapStatus.body?.targetMap?.exists).toBe(true);
      expect(
        sourceMapStatus.body?.auxiliaryMaps?.some(
          (entry) => entry.path?.endsWith('mon3.d8.json') === true && entry.exists === true
        )
      ).toBe(true);
      expect(sourceMapStatus.body?.counts?.sourceFiles).toBeGreaterThanOrEqual(2);
      expect(sourceMapStatus.body?.counts?.segments).toBeGreaterThan(0);
      expect(sourceMapStatus.body?.counts?.symbols).toBeGreaterThan(0);
      expect(sourceMapStatus.body?.currentPc?.address).toBeTypeOf('number');
      expect(sourceMapStatus.body?.currentPc?.mapsToSource).toBe(true);
      expect(sourceMapStatus.body?.currentPc?.source?.path).toBe(mon3SourcePath);

      await client.sendRequest('disconnect');
      fs.rmSync(fixture.root, { recursive: true, force: true });
    }, 15_000);
  });

  it('preserves launch diagnostics on the DAP output stream', async () => {
    const { client } = harness!;

    await launchApp(client, {
      platform: 'tec1',
      tec1: {
        entry: 0,
        romHex: 'missing.hex',
      },
      stopOnEntry: true,
    });

    const output = await client.waitForEvent<{ body?: { output?: string } }>('output', (event) => {
      const body = event.body as { output?: unknown } | undefined;
      return typeof body?.output === 'string' && body.output.includes('TEC-1 ROM not found');
    });
    expect(output.body?.output).toContain('TEC-1 ROM not found');

    await client.sendRequest('setBreakpoints', {
      source: { path: sourcePath },
      breakpoints: [],
    });
    await client.sendRequest('configurationDone');
    await client.waitForEvent('stopped');
    await client.sendRequest('disconnect');
  });

  it('returns a launch error when config creation prompt rejects on missing artifacts', async () => {
    const { client } = harness!;
    vi.spyOn(commands, 'executeCommand').mockRejectedValueOnce(new Error('command failed'));

    await expect(
      launchApp(client, {
        hex: 'missing.hex',
        stopOnEntry: true,
      })
    ).rejects.toThrow('Debug80: Failed to create project config: Error: command failed');
  });
});
