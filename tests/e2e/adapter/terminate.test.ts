import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { workspace } from './vscode-mock';
import {
  createHarness,
  initialize,
  launchWithDiagnostics,
  fixtureRoot,
  projectConfig,
  type SessionHarness,
} from './harness';

describe('session termination', () => {
  let harness: SessionHarness | undefined;

  beforeEach(() => {
    workspace.workspaceFolders = [{ uri: { fsPath: fixtureRoot } }];
    harness = createHarness();
  });

  afterEach(() => {
    harness?.client.dispose();
    harness?.input.end();
    harness?.output.end();
    harness = undefined;
  });

  it('disconnects cleanly when stopped at entry', async () => {
    const { client } = harness!;
    await initialize(client);
    await launchWithDiagnostics(client, {
      projectConfig,
      target: 'app',
      stopOnEntry: true,
      openRomSourcesOnLaunch: false,
      openMainSourceOnLaunch: false,
    });
    await client.sendRequest('setBreakpoints', { source: { path: '' }, breakpoints: [] });
    await client.sendRequest('configurationDone');
    await client.waitForEvent('stopped'); // entry stop

    // Should not throw
    await expect(client.sendRequest('disconnect')).resolves.not.toThrow();
  });

  it('disconnects cleanly when program is running', async () => {
    const { client } = harness!;
    await initialize(client);
    await launchWithDiagnostics(client, {
      projectConfig,
      target: 'app',
      stopOnEntry: false,
      openRomSourcesOnLaunch: false,
      openMainSourceOnLaunch: false,
    });
    await client.sendRequest('setBreakpoints', { source: { path: '' }, breakpoints: [] });
    await client.sendRequest('configurationDone');

    // Disconnect immediately while running — should not throw or time out
    await expect(client.sendRequest('disconnect')).resolves.not.toThrow();
  });
});
