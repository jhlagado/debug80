/**
 * @file Adapter integration tests for launch/custom-request seams.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PassThrough } from 'stream';
import path from 'path';

vi.mock('vscode', async () => {
  const mock = await import('../e2e/adapter/vscode-mock');
  return {
    ...mock,
    extensions: {
      getExtension: vi.fn(() => undefined),
    },
  };
});

import { Z80DebugSession } from '../../src/debug/adapter';
import { DapClient } from '../e2e/adapter/dap-client';
import { workspace } from '../e2e/adapter/vscode-mock';

const fixtureRoot = path.resolve(__dirname, '../e2e/fixtures/simple');
const sourcePath = path.join(fixtureRoot, 'src', 'simple.asm');

const THREAD_ID = 1;

type SessionHarness = {
  session: Z80DebugSession;
  client: DapClient;
  input: PassThrough;
  output: PassThrough;
};

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
    }>('debug80/tec1MemorySnapshot', {
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
    }>('debug80/tec1Update');
    expect(update.body?.speedMode).toBe('slow');
    expect(update.body?.digits).toBeDefined();
    expect(update.body?.lcd).toBeDefined();

    await client.sendRequest('disconnect');
  });
});
