import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createWorkspaceHarness,
  disposeHarness,
  launchAndConfigure,
  projectConfig,
  readTopStackFrame,
  THREAD_ID,
  type SessionHarness,
} from './harness';

describe('step and debug adapter state read', () => {
  let harness: SessionHarness | undefined;

  beforeEach(() => {
    harness = createWorkspaceHarness();
  });

  afterEach(() => {
    disposeHarness(harness);
    harness = undefined;
  });

  it('stepIn advances PC from NOP to IN instruction', async () => {
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

    // Step over the NOP at 0x0000
    await client.sendRequest('next', { threadId: THREAD_ID });
    const stepped = await client.waitForEvent<{ body?: { reason?: string } }>('stopped');
    expect(stepped.body?.reason).toBe('step');

    // PC should now be at 0x0001 — verify via stack trace.
    // Line 3 = the IN instruction in tests/e2e/fixtures/simple/src/simple.asm.
    // If the fixture changes, update this assertion.
    const frame = await readTopStackFrame(client);
    expect(frame?.line).toBe(3);

    // Registers are shown in Debug80's own registers panel, not in the DAP
    // Variables scopes. Verify the PC through the current watch/evaluate path.
    const frameId = frame?.id ?? 0;
    const scopes = await client.sendRequest<{
      body?: { scopes?: Array<{ name: string; variablesReference: number }> };
    }>('scopes', { frameId });
    expect(scopes.body?.scopes?.map((scope) => scope.name)).toEqual(['Symbols']);

    const pc = await client.sendRequest<{ body?: { result?: string } }>('evaluate', {
      expression: 'PC',
      frameId,
      context: 'watch',
    });
    expect(pc.body?.result).toBe('0x01 / 1');

    await client.sendRequest('disconnect');
  });
});
