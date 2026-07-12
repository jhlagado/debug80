import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  configureAndReadStoppedFrame,
  createWorkspaceHarness,
  disposeHarness,
  initialize,
  launchWithDiagnostics,
  THREAD_ID,
  waitForStoppedFrame,
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

describe('Debug80 adapter source map e2e', () => {
  let harness: SessionHarness | undefined;

  beforeEach(() => {
    harness = createWorkspaceHarness(sourceMapFixtureRoot);
  });

  afterEach(() => {
    disposeHarness(harness);
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

    const { stopped: mainStopped, frame: mainFrame } = await configureAndReadStoppedFrame(client);
    expect(mainStopped.body?.reason).toBe('breakpoint');
    expect(mainFrame?.line).toBe(3);
    expect(mainFrame?.source?.path).toBe(mainSourcePath);

    await client.sendRequest('continue', { threadId: THREAD_ID });

    const { stopped: includeStopped, frame: includeFrame } = await waitForStoppedFrame(client);
    expect(includeStopped.body?.reason).toBe('breakpoint');
    expect(includeFrame?.line).toBe(2);
    expect(includeFrame?.source?.path).toBe(includeSourcePath);

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

    const { stopped, frame } = await configureAndReadStoppedFrame(client);
    expect(stopped.body?.reason).toBe('breakpoint');

    expect(frame?.line).toBe(3);
    expect(frame?.source?.path).toBe(sparseSourcePath);

    await client.sendRequest('disconnect');
  });
});
