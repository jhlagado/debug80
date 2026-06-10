/**
 * @file Shared panel runtime message parser tests.
 */

import { describe, expect, it, vi } from 'vitest';
import { handlePanelRuntimeMessage } from '../../src/platforms/panel-runtime-messages';
import type { PanelSession } from '../../src/platforms/panel-message-types';
import { PANEL_TEST_COMMANDS } from './panel-message-fixtures';

describe('panel-runtime-messages', () => {
  it('absorbs recognized runtime messages when no Z80 session is active', async () => {
    const { customRequest, session } = createSession('extension-host');

    await expectRuntimeHandled({ type: 'key', code: 'invalid' as never }, session, true);
    await expectRuntimeHandled({ type: 'reset' }, session, true);
    await expectRuntimeHandled({ type: 'speed', mode: 'turbo' }, session, true);
    await expectRuntimeHandled({ type: 'serialSend', text: 42 as never }, session, true);

    expect(customRequest).not.toHaveBeenCalled();
  });

  it('rejects non-runtime messages when no Z80 session is active', async () => {
    await expectRuntimeHandled({ type: 'registerEdit', register: 'bc' }, undefined, false);
  });

  it('forwards valid runtime messages on an active Z80 session', async () => {
    const { customRequest, session } = createSession('z80');

    await expectRuntimeHandled({ type: 'key', code: 0x0a }, session, true);
    await expectRuntimeHandled({ type: 'reset' }, session, true);
    await expectRuntimeHandled({ type: 'speed', mode: 'slow' }, session, true);
    await expectRuntimeHandled({ type: 'serialSend', text: 'LOAD\r' }, session, true);

    expect(customRequest).toHaveBeenCalledWith('debug80/tec1Key', { code: 0x0a });
    expect(customRequest).toHaveBeenCalledWith('debug80/tec1Reset', {});
    expect(customRequest).toHaveBeenCalledWith('debug80/tec1Speed', { mode: 'slow' });
    expect(customRequest).toHaveBeenCalledWith('debug80/tec1SerialInput', { text: 'LOAD\r' });
  });

  it('requires valid payloads and configured commands on an active Z80 session', async () => {
    const { customRequest, session } = createSession('z80');
    const commands = {
      registerWrite: PANEL_TEST_COMMANDS.registerWrite,
      memoryWrite: PANEL_TEST_COMMANDS.memoryWrite,
    };

    await expectRuntimeHandled({ type: 'key', code: 0x0a }, session, false, commands);
    await expectRuntimeHandled({ type: 'key', code: 'invalid' as never }, session, false);
    await expectRuntimeHandled({ type: 'speed', mode: 'turbo' }, session, false);
    await expectRuntimeHandled({ type: 'serialSend', text: 42 as never }, session, false);

    expect(customRequest).not.toHaveBeenCalled();
  });

  it('treats dispatch failures as handled active-session runtime messages', async () => {
    const { customRequest, session } = createSession('z80', {
      customRequest: vi.fn().mockRejectedValue(new Error('busy')),
    });

    await expectRuntimeHandled({ type: 'key', code: 0x0a }, session, true);

    expect(customRequest).toHaveBeenCalledWith('debug80/tec1Key', { code: 0x0a });
  });
});

function createSession(
  type: string,
  options?: { customRequest?: ReturnType<typeof vi.fn> }
): { customRequest: ReturnType<typeof vi.fn>; session: Exclude<PanelSession, undefined> } {
  const customRequest = options?.customRequest ?? vi.fn().mockResolvedValue(undefined);
  return { customRequest, session: { type, customRequest } };
}

async function expectRuntimeHandled(
  message: Parameters<typeof handlePanelRuntimeMessage>[0],
  session: PanelSession,
  expected: boolean,
  commands = PANEL_TEST_COMMANDS
): Promise<void> {
  await expect(handlePanelRuntimeMessage(message, session, commands)).resolves.toBe(expected);
}
