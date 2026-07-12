/**
 * @file Shared panel message handler tests.
 */

import { describe, expect, it, vi } from 'vitest';
import { handleCommonPanelMessage } from '../../src/platforms/panel-messages';
import {
  handlePanelMessageWithDefaultContext,
  PANEL_TEST_COMMANDS,
  createPanelTestContext,
} from './panel-message-fixtures';

describe('panel-messages', () => {
  it('sends register write requests and refreshes after success', async () => {
    const { customRequest, handled, postSnapshot } = await handlePanelMessageWithDefaultContext(
      registerEditMessage()
    );

    expect(handled).toBe(true);
    expect(customRequest).toHaveBeenCalledWith('debug80/registerWrite', {
      register: 'bc',
      value: '1234',
    });
    expect(postSnapshot).toHaveBeenCalled();
  });

  it('forwards runtime messages through configured commands', async () => {
    const { ctx, customRequest } = createPanelTestContext();

    await handleCommonPanelMessage({ type: 'key', code: 0x0a }, ctx, PANEL_TEST_COMMANDS);
    await handleCommonPanelMessage({ type: 'reset' }, ctx, PANEL_TEST_COMMANDS);
    await handleCommonPanelMessage({ type: 'speed', mode: 'fast' }, ctx, PANEL_TEST_COMMANDS);
    await handleCommonPanelMessage(
      { type: 'serialSend', text: 'HELLO\r' },
      ctx,
      PANEL_TEST_COMMANDS
    );

    expect(customRequest).toHaveBeenCalledWith('debug80/tec1Key', { code: 0x0a });
    expect(customRequest).toHaveBeenCalledWith('debug80/tec1Reset', {});
    expect(customRequest).toHaveBeenCalledWith('debug80/tec1Speed', { mode: 'fast' });
    expect(customRequest).toHaveBeenCalledWith('debug80/tec1SerialInput', { text: 'HELLO\r' });
  });

  it('returns false for unsupported runtime commands on an active session', async () => {
    const { ctx } = createPanelTestContext();

    await expect(
      handleCommonPanelMessage({ type: 'key', code: 0x0a }, ctx, {
        registerWrite: 'debug80/registerWrite',
        memoryWrite: 'debug80/memoryWrite',
      })
    ).resolves.toBe(false);
  });

  it('absorbs runtime messages while no Z80 session is active', async () => {
    const { ctx, customRequest } = createPanelTestContext({ sessionType: 'extension-host' });

    await expect(
      handleCommonPanelMessage({ type: 'key', code: 0x0a }, ctx, PANEL_TEST_COMMANDS)
    ).resolves.toBe(true);

    expect(customRequest).not.toHaveBeenCalled();
  });

  it('refreshes the snapshot when register writes are rejected', async () => {
    const { customRequest, handled, postSnapshot } = await handlePanelMessageWithDefaultContext(
      registerEditMessage(),
      { customRequest: vi.fn().mockRejectedValue(new Error('running')) }
    );

    expect(handled).toBe(true);
    expect(customRequest).toHaveBeenCalledWith('debug80/registerWrite', {
      register: 'bc',
      value: '1234',
    });
    expect(postSnapshot).toHaveBeenCalled();
  });

  it('sends memory write requests and refreshes after success', async () => {
    const { customRequest, handled, postSnapshot } = await handlePanelMessageWithDefaultContext(
      memoryEditMessage()
    );

    expect(handled).toBe(true);
    expect(customRequest).toHaveBeenCalledWith('debug80/memoryWrite', {
      address: 0x1234,
      value: 'AB',
    });
    expect(postSnapshot).toHaveBeenCalled();
  });

  it('refreshes the snapshot when memory writes are rejected', async () => {
    const { customRequest, handled, postSnapshot } = await handlePanelMessageWithDefaultContext(
      memoryEditMessage(),
      { customRequest: vi.fn().mockRejectedValue(new Error('running')) }
    );

    expect(handled).toBe(true);
    expect(customRequest).toHaveBeenCalledWith('debug80/memoryWrite', {
      address: 0x1234,
      value: 'AB',
    });
    expect(postSnapshot).toHaveBeenCalled();
  });

  it('forwards explicit read-only memory override requests', async () => {
    const { customRequest, handled } = await handlePanelMessageWithDefaultContext(
      memoryEditMessage({ allowReadOnly: true })
    );

    expect(handled).toBe(true);
    expect(customRequest).toHaveBeenCalledWith('debug80/memoryWrite', {
      address: 0x1234,
      value: 'AB',
      allowReadOnly: true,
    });
  });
});

function registerEditMessage() {
  return { type: 'registerEdit', register: 'bc', value: '1234' };
}

function memoryEditMessage(options?: { allowReadOnly?: boolean }) {
  return {
    type: 'memoryEdit',
    address: 0x1234,
    value: 'AB',
    ...(options?.allowReadOnly === true ? { allowReadOnly: true } : {}),
  };
}
