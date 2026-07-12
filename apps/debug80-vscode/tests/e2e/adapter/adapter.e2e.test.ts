import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  configureAndReadStoppedFrame,
  createWorkspaceHarness,
  disposeHarness,
  initialize,
  launchAndConfigure,
  launchWithDiagnostics,
  projectConfig,
  sourcePath,
  type SessionHarness,
} from './harness';

describe('Debug80 adapter e2e (in-process)', () => {
  let harness: SessionHarness | undefined;

  beforeEach(() => {
    harness = createWorkspaceHarness();
  });

  afterEach(() => {
    disposeHarness(harness);
    harness = undefined;
  });

  it('stops on entry when stopOnEntry is true', async () => {
    const { client } = harness!;

    const { stopped } = await launchAndConfigure({
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
    expect(stopped?.body?.reason).toBe('entry');

    await client.sendRequest('disconnect');
  });

  it('hits a source breakpoint after configurationDone', async () => {
    const { client } = harness!;

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
    const { stopped, frame } = await configureAndReadStoppedFrame(client);
    expect(stopped.body?.reason).toBe('breakpoint');

    expect(frame?.line).toBe(2);
    expect(frame?.source?.path).toBe(sourcePath);

    await client.sendRequest('disconnect');
  });
});
