/**
 * @file TEC-1G UI panel message handler tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMemoryViewState } from '../../../src/platforms/tec1g/ui-panel-memory';
import { createRefreshController } from '../../../src/platforms/tec1g/ui-panel-refresh';
import { handleTec1gMessage } from '../../../src/platforms/tec1g/ui-panel-messages';

describe('tec1g ui-panel-messages', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createContext = () => {
    const memoryViews = createMemoryViewState();
    const handlers = {
      postSnapshot: vi.fn().mockResolvedValue(undefined),
      onSnapshotPosted: vi.fn(),
      onSnapshotFailed: vi.fn(),
    };
    const refreshController = createRefreshController(() => ({ views: [] }), handlers);
    let activeTab: 'ui' | 'memory' = 'ui';
    const ctx = {
      getSession: () => undefined as { type: string; customRequest: (c: string, p: unknown) => Promise<unknown> } | undefined,
      refreshController,
      autoRefreshMs: 250,
      setActiveTab: (tab: 'ui' | 'memory') => {
        activeTab = tab;
      },
      getActiveTab: () => activeTab,
      isPanelVisible: () => true,
      memoryViews,
    };
    return { ctx, handlers, memoryViews, getActiveTab: () => activeTab };
  };

  it('starts refresh when switching to memory tab', async () => {
    const { ctx, handlers } = createContext();
    await handleTec1gMessage({ type: 'tab', tab: 'memory' }, ctx);
    await Promise.resolve();
    expect(ctx.refreshController.state.timer).toBeDefined();
    expect(handlers.postSnapshot).toHaveBeenCalled();
  });

  it('stops refresh when panel not visible', async () => {
    const { ctx } = createContext();
    ctx.isPanelVisible = () => false;
    await handleTec1gMessage({ type: 'tab', tab: 'ui' }, ctx);
    expect(ctx.refreshController.state.timer).toBeUndefined();
  });

  it('applies memory views and refreshes on refresh message', async () => {
    const { ctx, handlers, memoryViews } = createContext();
    await handleTec1gMessage(
      {
        type: 'refresh',
        views: [{ id: 'a', view: 'sp', after: 32, address: 0x1234 }],
      },
      ctx
    );
    await Promise.resolve();
    expect(memoryViews.viewModes.a).toBe('sp');
    expect(memoryViews.viewAfter.a).toBe(32);
    expect(memoryViews.viewAddress.a).toBe(0x1234);
    expect(handlers.postSnapshot).toHaveBeenCalled();
  });

  it('sends key, reset, speed, and serial requests', async () => {
    const { ctx } = createContext();
    const customRequest = vi.fn().mockResolvedValue(undefined);
    ctx.getSession = () => ({ type: 'z80', customRequest });

    await handleTec1gMessage({ type: 'key', code: 0x12 }, ctx);
    await handleTec1gMessage({ type: 'reset' }, ctx);
    await handleTec1gMessage({ type: 'speed', mode: 'slow' }, ctx);
    await handleTec1gMessage({ type: 'serialSend', text: 'HI' }, ctx);

    expect(customRequest).toHaveBeenCalledWith('debug80/tec1gKey', { code: 0x12 });
    expect(customRequest).toHaveBeenCalledWith('debug80/tec1gReset', {});
    expect(customRequest).toHaveBeenCalledWith('debug80/tec1gSpeed', { mode: 'slow' });
    expect(customRequest).toHaveBeenCalledWith('debug80/tec1gSerialInput', { text: 'HI' });
  });
});
