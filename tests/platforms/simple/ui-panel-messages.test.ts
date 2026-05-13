/**
 * @file Simple UI panel message handler tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryViewState } from '../../../src/platforms/simple/ui-panel-memory';
import { createRefreshController } from '../../../src/platforms/panel-refresh';
import { handleSimpleMessage } from '../../../src/platforms/simple/ui-panel-messages';

describe('simple ui-panel-messages', () => {
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
    const customRequest = vi.fn().mockResolvedValue(undefined);
    const ctx = {
      getSession: () => ({ type: 'z80', customRequest }),
      refreshController,
      autoRefreshMs: 250,
      setActiveTab: (tab: 'ui' | 'memory') => {
        activeTab = tab;
      },
      getActiveTab: () => activeTab,
      isPanelVisible: () => true,
      memoryViews,
    };
    return { ctx, customRequest, handlers, memoryViews };
  };

  it('ignores hardware messages unsupported by the simple panel', async () => {
    const { ctx, customRequest } = createContext();

    await handleSimpleMessage({ type: 'key', code: 0x12 }, ctx);
    await handleSimpleMessage({ type: 'reset' }, ctx);
    await handleSimpleMessage({ type: 'speed', mode: 'fast' }, ctx);
    await handleSimpleMessage({ type: 'serialSend', text: 'HI' }, ctx);

    expect(customRequest).not.toHaveBeenCalled();
  });

  it('keeps memory edit routing for the simple panel', async () => {
    const { ctx, customRequest, handlers } = createContext();

    await handleSimpleMessage({ type: 'memoryEdit', address: 0x1234, value: 'AB' }, ctx);
    await Promise.resolve();

    expect(customRequest).toHaveBeenCalledWith('debug80/memoryWrite', {
      address: 0x1234,
      value: 'AB',
    });
    expect(handlers.postSnapshot).toHaveBeenCalled();
  });
});
