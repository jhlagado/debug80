import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { workspace } from './vscode-mock';
import {
  createHarness,
  initialize,
  launchWithDiagnostics,
  fixtureRoot,
  projectConfig,
  THREAD_ID,
  type SessionHarness,
} from './harness';

describe('step and register read', () => {
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

  it('stepIn advances PC from NOP to IN instruction', async () => {
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

    // Step over the NOP at 0x0000
    await client.sendRequest('next', { threadId: THREAD_ID });
    const stepped = await client.waitForEvent<{ body?: { reason?: string } }>('stopped');
    expect(stepped.body?.reason).toBe('step');

    // PC should now be at 0x0001 — verify via stack trace.
    // Line 3 = the IN instruction in tests/e2e/fixtures/simple/src/simple.asm.
    // If the fixture changes, update this assertion.
    const stack = await client.sendRequest<{
      body?: { stackFrames?: Array<{ id: number; line: number }> };
    }>('stackTrace', { threadId: THREAD_ID, startFrame: 0, levels: 1 });
    expect(stack.body?.stackFrames?.[0]?.line).toBe(3);

    // Verify PC register reads back correctly
    const frameId = stack.body?.stackFrames?.[0]?.id ?? 0;
    const scopes = await client.sendRequest<{
      body?: { scopes?: Array<{ name: string; variablesReference: number }> };
    }>('scopes', { frameId });
    const regScope = scopes.body?.scopes?.find((s) => /register/i.test(s.name));
    expect(regScope).toBeDefined();
    const vars = await client.sendRequest<{
      body?: { variables?: Array<{ name: string; value: string }> };
    }>('variables', { variablesReference: regScope!.variablesReference });
    const pc = vars.body?.variables?.find((v) => v.name.toUpperCase() === 'PC');
    expect(pc?.value).toMatch(/0001/i);

    await client.sendRequest('disconnect');
  });
});
