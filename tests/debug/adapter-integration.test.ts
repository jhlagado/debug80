/**
 * @file Adapter integration tests for launch/custom-request seams.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'stream';
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

import { Z80DebugSession } from '../../src/debug/adapter';
import { DapClient } from '../e2e/adapter/dap-client';
import { createDefaultProjectConfig } from '../../src/extension/project-scaffolding';
import { getProjectKitById } from '../../src/extension/project-kits';
const { commands, workspace } = vscodeMock;

const fixtureRoot = path.resolve(__dirname, '../e2e/fixtures/simple');
const sourcePath = path.join(fixtureRoot, 'src', 'simple.asm');

const THREAD_ID = 1;

type SessionHarness = {
  session: Z80DebugSession;
  client: DapClient;
  input: PassThrough;
  output: PassThrough;
};

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
  fs.writeFileSync(
    path.join(buildDir, 'main.lst'),
    kitId === 'tec1g/mon3'
      ? '4000   00           NOP\n4001   18 FD        JR start\n'
      : '0800   00           NOP\n0801   18 FD        JR start\n'
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

function createHarness(): SessionHarness {
  const input = new PassThrough();
  const output = new PassThrough();
  const session = new Z80DebugSession();
  session.setRunAsServer(true);
  session.start(input, output);
  const client = new DapClient(input, output);
  return { session, client, input, output };
}

async function initialize(client: DapClient): Promise<void> {
  await client.sendRequest('initialize', {
    adapterID: 'z80',
    pathFormat: 'path',
    linesStartAt1: true,
    columnsStartAt1: true,
  });
  await client.waitForEvent('initialized');
}

async function launchWithDiagnostics(
  client: DapClient,
  args: Record<string, unknown>
): Promise<void> {
  try {
    await client.sendRequest('launch', args);
  } catch (err) {
    let output = '';
    try {
      const event = await client.waitForEvent<{ body?: { output?: string } }>(
        'output',
        undefined,
        1000
      );
      output = event.body?.output?.trim() ?? '';
    } catch {
      // ignore missing output
    }
    const message = err instanceof Error ? err.message : String(err);
    const detail = output.length > 0 ? `${message}\n${output}` : message;
    throw new Error(detail);
  }
}

describe('adapter integration', () => {
  let harness: SessionHarness | undefined;

  beforeEach(() => {
    vi.restoreAllMocks();
    getExtension.mockReset();
    getExtension.mockReturnValue(undefined);
    workspace.workspaceFolders = [{ uri: { fsPath: fixtureRoot } }];
    harness = createHarness();
  });

  afterEach(() => {
    if (!harness) {
      return;
    }
    harness.client.dispose();
    harness.input.end();
    harness.output.end();
    harness = undefined;
  });

  it('initialize response advertises setVariable for native register editing', async () => {
    const { client } = harness ?? createHarness();
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
    const { client } = harness ?? createHarness();

    await initialize(client);
    await launchWithDiagnostics(client, {
      target: 'app',
      stopOnEntry: true,
      openRomSourcesOnLaunch: false,
      openMainSourceOnLaunch: false,
    });
    await client.sendRequest('setBreakpoints', {
      source: { path: sourcePath },
      breakpoints: [],
    });
    await client.sendRequest('configurationDone');

    const stopped = await client.waitForEvent<{ body?: { reason?: string } }>('stopped');
    expect(stopped.body?.reason).toBe('entry');

    const stack = await client.sendRequest<{
      body?: { stackFrames?: Array<{ line: number; source?: { path?: string } }> };
    }>('stackTrace', { threadId: THREAD_ID, startFrame: 0, levels: 1 });
    const frame = stack.body?.stackFrames?.[0];
    expect(frame?.line).toBe(2);
    expect(frame?.source?.path).toBe(sourcePath);

    await client.sendRequest('disconnect');
  });

  it('routes built-in memory snapshot requests through the adapter after launch', async () => {
    const { client } = harness ?? createHarness();

    await initialize(client);
    await launchWithDiagnostics(client, {
      target: 'app',
      stopOnEntry: true,
      openRomSourcesOnLaunch: false,
      openMainSourceOnLaunch: false,
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
    const { client } = harness ?? createHarness();

    await initialize(client);
    await launchWithDiagnostics(client, {
      target: 'app',
      platform: 'tec1',
      tec1: {
        entry: 0,
      },
      stopOnEntry: true,
      openRomSourcesOnLaunch: false,
      openMainSourceOnLaunch: false,
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
    const fixture = createFreshProjectFixture('tec1/mon1b');
    workspace.workspaceFolders = [{ uri: { fsPath: fixture.root } }];
    getExtension.mockReturnValue({
      extensionPath: path.resolve(__dirname, '../..'),
    } as never);

    const { client } = harness ?? createHarness();

    await initialize(client);
    await launchWithDiagnostics(client, {
      target: 'app',
      assemble: false,
      stopOnEntry: true,
      openRomSourcesOnLaunch: false,
      openMainSourceOnLaunch: false,
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
    const fixture = createFreshProjectFixture('tec1g/mon3');
    workspace.workspaceFolders = [{ uri: { fsPath: fixture.root } }];
    getExtension.mockReturnValue({
      extensionPath: path.resolve(__dirname, '../..'),
    } as never);

    const { client } = harness ?? createHarness();

    await initialize(client);
    await launchWithDiagnostics(client, {
      target: 'app',
      assemble: false,
      stopOnEntry: true,
      openRomSourcesOnLaunch: false,
      openMainSourceOnLaunch: false,
    });

    const update = await client.waitForEvent<{
      body?: { speedMode?: string; lcd?: number[]; sysCtrl?: number };
    }>('debug80/tec1gUpdate', undefined, 1000);

    expect(update.body?.speedMode).toBe('fast');
    expect(update.body?.sysCtrl).toBe(0);
    expect(update.body?.lcd?.[0]).toBe('A'.charCodeAt(0));

    await client.sendRequest('disconnect');
    fs.rmSync(fixture.root, { recursive: true, force: true });
  });

  it('preserves launch diagnostics on the DAP output stream', async () => {
    const { client } = harness ?? createHarness();

    await initialize(client);
    await launchWithDiagnostics(client, {
      target: 'app',
      platform: 'tec1',
      tec1: {
        entry: 0,
        romHex: 'missing.hex',
      },
      stopOnEntry: true,
      openRomSourcesOnLaunch: false,
      openMainSourceOnLaunch: false,
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
    const { client } = harness ?? createHarness();
    vi.spyOn(commands, 'executeCommand').mockRejectedValueOnce(new Error('command failed'));

    await initialize(client);

    await expect(
      launchWithDiagnostics(client, {
        target: 'app',
        hex: 'missing.hex',
        listing: 'missing.lst',
        stopOnEntry: true,
        openRomSourcesOnLaunch: false,
        openMainSourceOnLaunch: false,
      })
    ).rejects.toThrow('Debug80: Failed to create project config: Error: command failed');
  });
});
