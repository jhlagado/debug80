import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createWorkspaceHarness,
  disposeHarness,
  launchAndConfigure,
  projectConfig,
  type SessionHarness,
} from './harness';

describe('session termination', () => {
  let harness: SessionHarness | undefined;

  beforeEach(() => {
    harness = createWorkspaceHarness();
  });

  afterEach(() => {
    disposeHarness(harness);
    harness = undefined;
  });

  it('disconnects cleanly when stopped at entry', async () => {
    const { client } = harness!;
    await launchAndConfigure({
      harness: harness!,
      waitForEntryStop: true,
      launchArgs: {
        projectConfig,
        target: 'app',
        stopOnEntry: true,
        openRomSourcesOnLaunch: false,
        openMainSourceOnLaunch: false,
      },
    });

    // Should not throw
    await expect(client.sendRequest('disconnect')).resolves.not.toThrow();
  });

  it('disconnects cleanly when program is running', async () => {
    const { client } = harness!;
    await launchAndConfigure({
      harness: harness!,
      launchArgs: {
        projectConfig,
        target: 'app',
        stopOnEntry: false,
        openRomSourcesOnLaunch: false,
        openMainSourceOnLaunch: false,
      },
    });

    // Disconnect immediately while running — should not throw or time out
    await expect(client.sendRequest('disconnect')).resolves.not.toThrow();
  });
});
