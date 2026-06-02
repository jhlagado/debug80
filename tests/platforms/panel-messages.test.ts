/**
 * @file Shared panel message handler tests.
 */

import { describe, expect, it, vi } from 'vitest';
import { createMemoryViewState } from '../../src/platforms/panel-memory';
import { createRefreshController } from '../../src/platforms/panel-refresh';
import { handleCommonPanelMessage } from '../../src/platforms/panel-messages';

describe('panel-messages', () => {
  function createContext(options?: {
    customRequest?: ReturnType<typeof vi.fn>;
    sessionType?: string;
    visible?: boolean;
  }) {
    const memoryViews = createMemoryViewState();
    const postSnapshot = vi.fn().mockResolvedValue(undefined);
    const refreshController = createRefreshController(() => ({ views: [] }), {
      postSnapshot,
      onSnapshotPosted: vi.fn(),
      onSnapshotFailed: vi.fn(),
    });
    const customRequest = options?.customRequest ?? vi.fn().mockResolvedValue(undefined);
    return {
      ctx: {
        getSession: () => ({ type: options?.sessionType ?? 'z80', customRequest }),
        refreshController,
        autoRefreshMs: 150,
        setActiveTab: vi.fn(),
        getActiveTab: vi.fn(() => 'memory'),
        isPanelVisible: vi.fn(() => options?.visible ?? true),
        memoryViews,
      },
      customRequest,
      postSnapshot,
    };
  }

  const commands = {
    key: 'debug80/tec1Key',
    reset: 'debug80/tec1Reset',
    speed: 'debug80/tec1Speed',
    serialSend: 'debug80/tec1SerialInput',
    registerWrite: 'debug80/registerWrite',
    memoryWrite: 'debug80/memoryWrite',
  };

  async function handleWithDefaultContext(
    message: Parameters<typeof handleCommonPanelMessage>[0],
    options?: Parameters<typeof createContext>[0]
  ) {
    const state = createContext(options);
    const handled = await handleCommonPanelMessage(message, state.ctx, commands);
    return { ...state, handled };
  }

  it('sends register write requests and refreshes after success', async () => {
    const { customRequest, handled, postSnapshot } = await handleWithDefaultContext({
      type: 'registerEdit',
      register: 'bc',
      value: '1234',
    });

    expect(handled).toBe(true);
    expect(customRequest).toHaveBeenCalledWith('debug80/registerWrite', {
      register: 'bc',
      value: '1234',
    });
    expect(postSnapshot).toHaveBeenCalled();
  });

  it('forwards runtime messages through configured commands', async () => {
    const { ctx, customRequest } = createContext();

    await handleCommonPanelMessage({ type: 'key', code: 0x0a }, ctx, commands);
    await handleCommonPanelMessage({ type: 'reset' }, ctx, commands);
    await handleCommonPanelMessage({ type: 'speed', mode: 'fast' }, ctx, commands);
    await handleCommonPanelMessage({ type: 'serialSend', text: 'HELLO\r' }, ctx, commands);

    expect(customRequest).toHaveBeenCalledWith('debug80/tec1Key', { code: 0x0a });
    expect(customRequest).toHaveBeenCalledWith('debug80/tec1Reset', {});
    expect(customRequest).toHaveBeenCalledWith('debug80/tec1Speed', { mode: 'fast' });
    expect(customRequest).toHaveBeenCalledWith('debug80/tec1SerialInput', { text: 'HELLO\r' });
  });

  it('returns false for unsupported runtime commands on an active session', async () => {
    const { ctx } = createContext();

    await expect(
      handleCommonPanelMessage({ type: 'key', code: 0x0a }, ctx, {
        registerWrite: 'debug80/registerWrite',
        memoryWrite: 'debug80/memoryWrite',
      })
    ).resolves.toBe(false);
  });

  it('absorbs runtime messages while no Z80 session is active', async () => {
    const { ctx, customRequest } = createContext({ sessionType: 'extension-host' });

    await expect(handleCommonPanelMessage({ type: 'key', code: 0x0a }, ctx, commands)).resolves.toBe(
      true
    );

    expect(customRequest).not.toHaveBeenCalled();
  });

  it('refreshes the snapshot when register writes are rejected', async () => {
    const { customRequest, handled, postSnapshot } = await handleWithDefaultContext(
      { type: 'registerEdit', register: 'bc', value: '1234' },
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
    const { customRequest, handled, postSnapshot } = await handleWithDefaultContext({
      type: 'memoryEdit',
      address: 0x1234,
      value: 'AB',
    });

    expect(handled).toBe(true);
    expect(customRequest).toHaveBeenCalledWith('debug80/memoryWrite', {
      address: 0x1234,
      value: 'AB',
    });
    expect(postSnapshot).toHaveBeenCalled();
  });

  it('refreshes the snapshot when memory writes are rejected', async () => {
    const { customRequest, handled, postSnapshot } = await handleWithDefaultContext(
      { type: 'memoryEdit', address: 0x1234, value: 'AB' },
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
    const { customRequest, handled } = await handleWithDefaultContext({
      type: 'memoryEdit',
      address: 0x1234,
      value: 'AB',
      allowReadOnly: true,
    });

    expect(handled).toBe(true);
    expect(customRequest).toHaveBeenCalledWith('debug80/memoryWrite', {
      address: 0x1234,
      value: 'AB',
      allowReadOnly: true,
    });
  });
});
