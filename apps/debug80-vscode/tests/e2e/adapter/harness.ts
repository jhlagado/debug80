import { PassThrough } from 'stream';
import path from 'path';
import { Z80DebugSession } from '../../../src/debug/adapter';
import { DapClient } from './dap-client';
import { workspace } from './vscode-mock';

export const fixtureRoot = path.resolve(__dirname, '../fixtures/simple');
export const projectConfig = path.join(fixtureRoot, '.vscode', 'debug80.json');
export const sourcePath = path.join(fixtureRoot, 'src', 'simple.asm');

export const THREAD_ID = 1;

export type SessionHarness = {
  session: Z80DebugSession;
  client: DapClient;
  input: PassThrough;
  output: PassThrough;
};

export type LaunchAndConfigureOptions = {
  harness: SessionHarness;
  workspaceRoot?: string;
  launchArgs: Record<string, unknown>;
  waitForEntryStop?: boolean;
};

export type E2eStackFrame = {
  id?: number;
  line: number;
  source?: { path?: string };
};

export function createHarness(): SessionHarness {
  const input = new PassThrough();
  const output = new PassThrough();
  const session = new Z80DebugSession();
  session.setRunAsServer(true);
  session.start(input, output);
  const client = new DapClient(input, output);
  return { session, client, input, output };
}

export function createWorkspaceHarness(workspaceRoot = fixtureRoot): SessionHarness {
  workspace.workspaceFolders = [{ uri: { fsPath: workspaceRoot } }];
  return createHarness();
}

export function disposeHarness(harness: SessionHarness | undefined): void {
  harness?.client.dispose();
  harness?.input.end();
  harness?.output.end();
}

export async function initialize(client: DapClient): Promise<void> {
  await client.sendRequest('initialize', {
    adapterID: 'z80',
    pathFormat: 'path',
    linesStartAt1: true,
    columnsStartAt1: true,
  });
  await client.waitForEvent('initialized');
}

export async function launchWithDiagnostics(
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

export async function launchAndConfigure(
  options: LaunchAndConfigureOptions
): Promise<{ stopped?: { body?: { reason?: string } } }> {
  const { client } = options.harness;
  if (options.workspaceRoot !== undefined) {
    workspace.workspaceFolders = [{ uri: { fsPath: options.workspaceRoot } }];
  }
  await initialize(client);
  await launchWithDiagnostics(client, options.launchArgs);
  await client.sendRequest('setBreakpoints', { source: { path: '' }, breakpoints: [] });
  await client.sendRequest('configurationDone');
  if (options.waitForEntryStop ?? false) {
    return {
      stopped: await client.waitForEvent<{ body?: { reason?: string } }>('stopped'),
    };
  }
  return {};
}

export async function readTopStackFrame(client: DapClient): Promise<E2eStackFrame | undefined> {
  const stack = await client.sendRequest<{
    body?: { stackFrames?: E2eStackFrame[] };
  }>('stackTrace', { threadId: THREAD_ID, startFrame: 0, levels: 1 });
  return stack.body?.stackFrames?.[0];
}

export async function configureAndReadStoppedFrame(client: DapClient): Promise<{
  stopped: { body?: { reason?: string } };
  frame: E2eStackFrame | undefined;
}> {
  await client.sendRequest('configurationDone');
  return waitForStoppedFrame(client);
}

export async function waitForStoppedFrame(client: DapClient): Promise<{
  stopped: { body?: { reason?: string } };
  frame: E2eStackFrame | undefined;
}> {
  const stopped = await client.waitForEvent<{ body?: { reason?: string } }>('stopped');
  return {
    stopped,
    frame: await readTopStackFrame(client),
  };
}
