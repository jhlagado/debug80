import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { workspace } from './vscode-mock';
import {
  createHarness,
  initialize,
  launchWithDiagnostics,
  fixtureRoot,
  projectConfig,
  sourcePath,
  THREAD_ID,
  type SessionHarness,
} from './harness';

describe('Debug80 adapter e2e (in-process)', () => {
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

  it('stops on entry when stopOnEntry is true', async () => {
    const { client } = harness ?? createHarness();

    await initialize(client);
    await launchWithDiagnostics(client, {
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
    await launchWithDiagnostics(client, {
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
