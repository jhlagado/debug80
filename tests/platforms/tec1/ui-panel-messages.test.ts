/**
 * @file TEC-1 UI panel message handler tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMemoryViewState } from '../../../src/platforms/tec1/ui-panel-memory';
import { createRefreshController } from '../../../src/platforms/tec1/ui-panel-refresh';
import { handleTec1Message } from '../../../src/platforms/tec1/ui-panel-messages';

describe('tec1 ui-panel-messages', () => {
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
    await handleTec1Message({ type: 'tab', tab: 'memory' }, ctx);
    await Promise.resolve();
    expect(ctx.refreshController.state.timer).toBeDefined();
    expect(handlers.postSnapshot).toHaveBeenCalled();
  });

  it('stops refresh when panel not visible', async () => {
    const { ctx } = createContext();
    ctx.isPanelVisible = () => false;
    await handleTec1Message({ type: 'tab', tab: 'ui' }, ctx);
    expect(ctx.refreshController.state.timer).toBeUndefined();
  });

  it('applies memory views and refreshes on refresh message', async () => {
    const { ctx, handlers, memoryViews } = createContext();
    await handleTec1Message(
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

    await handleTec1Message({ type: 'key', code: 0x12 }, ctx);
    await handleTec1Message({ type: 'reset' }, ctx);
    await handleTec1Message({ type: 'speed', mode: 'fast' }, ctx);
    await handleTec1Message({ type: 'serialSend', text: 'HI' }, ctx);

    expect(customRequest).toHaveBeenCalledWith('debug80/tec1Key', { code: 0x12 });
    expect(customRequest).toHaveBeenCalledWith('debug80/tec1Reset', {});
    expect(customRequest).toHaveBeenCalledWith('debug80/tec1Speed', { mode: 'fast' });
    expect(customRequest).toHaveBeenCalledWith('debug80/tec1SerialInput', { text: 'HI' });
  });
});
