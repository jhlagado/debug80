import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { workspace } from './vscode-mock';
import {
  createHarness,
  initialize,
  launchWithDiagnostics,
  THREAD_ID,
  type SessionHarness,
} from './harness';

const sourceMapFixtureRoot = path.resolve(__dirname, '../fixtures/dap-source-maps');
const sourceMapProjectConfig = path.join(sourceMapFixtureRoot, '.vscode', 'debug80.json');
const mainSourcePath = path.join(sourceMapFixtureRoot, 'src', 'main.asm');
const includeSourcePath = path.join(sourceMapFixtureRoot, 'src', 'inc', 'included.asm');
const sparseSourcePath = path.join(sourceMapFixtureRoot, 'src', 'sparse.asm');

type SetBreakpointsResponse = {
  body?: {
    breakpoints?: Array<{ line?: number; verified?: boolean }>;
  };
};

type StackTraceResponse = {
  body?: {
    stackFrames?: Array<{ line: number; source?: { path?: string } }>;
  };
};

describe('Debug80 adapter source map e2e', () => {
  let harness: SessionHarness | undefined;

  beforeEach(() => {
    workspace.workspaceFolders = [{ uri: { fsPath: sourceMapFixtureRoot } }];
    harness = createHarness();
  });

  afterEach(() => {
    harness?.client.dispose();
    harness?.input.end();
    harness?.output.end();
    harness = undefined;
  });

  it('verifies and hits breakpoints in a main source and included source file', async () => {
    const { client } = harness!;

    await initialize(client);
    await launchWithDiagnostics(client, {
      projectConfig: sourceMapProjectConfig,
      target: 'include-app',
      stopOnEntry: false,
      openRomSourcesOnLaunch: false,
      openMainSourceOnLaunch: false,
    });

    const mainBreakpoints = await client.sendRequest<SetBreakpointsResponse>('setBreakpoints', {
      source: { path: mainSourcePath },
      breakpoints: [{ line: 3 }],
    });
    expect(mainBreakpoints.body?.breakpoints?.[0]?.verified).toBe(true);

    const includeBreakpoints = await client.sendRequest<SetBreakpointsResponse>('setBreakpoints', {
      source: { path: includeSourcePath },
      breakpoints: [{ line: 2 }],
    });
    expect(includeBreakpoints.body?.breakpoints?.[0]?.verified).toBe(true);

    await client.sendRequest('configurationDone');

    const mainStopped = await client.waitForEvent<{ body?: { reason?: string } }>('stopped');
    expect(mainStopped.body?.reason).toBe('breakpoint');

    const mainStack = await client.sendRequest<StackTraceResponse>('stackTrace', {
      threadId: THREAD_ID,
      startFrame: 0,
      levels: 1,
    });
    expect(mainStack.body?.stackFrames?.[0]?.line).toBe(3);
    expect(mainStack.body?.stackFrames?.[0]?.source?.path).toBe(mainSourcePath);

    await client.sendRequest('continue', { threadId: THREAD_ID });

    const includeStopped = await client.waitForEvent<{ body?: { reason?: string } }>('stopped');
    expect(includeStopped.body?.reason).toBe('breakpoint');

    const includeStack = await client.sendRequest<StackTraceResponse>('stackTrace', {
      threadId: THREAD_ID,
      startFrame: 0,
      levels: 1,
    });
    expect(includeStack.body?.stackFrames?.[0]?.line).toBe(2);
    expect(includeStack.body?.stackFrames?.[0]?.source?.path).toBe(includeSourcePath);

    await client.sendRequest('disconnect');
  });

  it('hits a breakpoint from a sparse ORG artifact without requiring padded HEX output', async () => {
    const { client } = harness!;

    await initialize(client);
    await launchWithDiagnostics(client, {
      projectConfig: sourceMapProjectConfig,
      target: 'sparse-org',
      stopOnEntry: false,
      openRomSourcesOnLaunch: false,
      openMainSourceOnLaunch: false,
    });

    const sparseBreakpoints = await client.sendRequest<SetBreakpointsResponse>('setBreakpoints', {
      source: { path: sparseSourcePath },
      breakpoints: [{ line: 3 }],
    });
    expect(sparseBreakpoints.body?.breakpoints?.[0]?.verified).toBe(true);

    await client.sendRequest('configurationDone');

    const stopped = await client.waitForEvent<{ body?: { reason?: string } }>('stopped');
    expect(stopped.body?.reason).toBe('breakpoint');

    const stack = await client.sendRequest<StackTraceResponse>('stackTrace', {
      threadId: THREAD_ID,
      startFrame: 0,
      levels: 1,
    });
    expect(stack.body?.stackFrames?.[0]?.line).toBe(3);
    expect(stack.body?.stackFrames?.[0]?.source?.path).toBe(sparseSourcePath);

    await client.sendRequest('disconnect');
  });
});
