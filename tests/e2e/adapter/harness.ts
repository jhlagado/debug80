import { PassThrough } from 'stream';
import path from 'path';
import { Z80DebugSession } from '../../../src/debug/adapter';
import { DapClient } from './dap-client';

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

export function createHarness(): SessionHarness {
  const input = new PassThrough();
  const output = new PassThrough();
  const session = new Z80DebugSession();
  session.setRunAsServer(true);
  session.start(input, output);
  const client = new DapClient(input, output);
  return { session, client, input, output };
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
