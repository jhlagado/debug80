import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PassThrough } from 'stream';
import path from 'path';
import { Z80DebugSession } from '../../../src/debug/adapter';
import { DapClient } from './dap-client';

const fixtureRoot = path.resolve(__dirname, '../fixtures/simple');
const projectConfig = path.join(fixtureRoot, '.vscode', 'debug80.json');
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

describe('Debug80 adapter e2e (in-process)', () => {
  let harness: SessionHarness | undefined;

  beforeEach(() => {
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

  it('stops on entry when stopOnEntry is true', async () => {
    const { client } = harness ?? createHarness();

    await initialize(client);
    await client.sendRequest('launch', {
      projectConfig,
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

    await client.sendRequest('disconnect');
  });

  it('hits a source breakpoint after configurationDone', async () => {
    const { client } = harness ?? createHarness();

    await initialize(client);
    await client.sendRequest('launch', {
      projectConfig,
      target: 'app',
      stopOnEntry: false,
      openRomSourcesOnLaunch: false,
      openMainSourceOnLaunch: false,
    });
    await client.sendRequest('setBreakpoints', {
      source: { path: sourcePath },
      breakpoints: [{ line: 2 }],
    });
    await client.sendRequest('configurationDone');

    const stopped = await client.waitForEvent<{ body?: { reason?: string } }>('stopped');
    expect(stopped.body?.reason).toBe('breakpoint');

    const stack = await client.sendRequest<{
      body?: { stackFrames?: Array<{ line: number; source?: { path?: string } }> };
    }>('stackTrace', { threadId: THREAD_ID, startFrame: 0, levels: 1 });
    const frame = stack.body?.stackFrames?.[0];
    expect(frame?.line).toBe(2);
    expect(frame?.source?.path).toBe(sourcePath);

    await client.sendRequest('disconnect');
  });
});
