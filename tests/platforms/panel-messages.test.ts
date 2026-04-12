/**
 * @file Shared panel message handler tests.
 */

import { describe, expect, it, vi } from 'vitest';
import { createMemoryViewState } from '../../src/platforms/panel-memory';
import { createRefreshController } from '../../src/platforms/panel-refresh';
import { handleCommonPanelMessage } from '../../src/platforms/panel-messages';

describe('panel-messages', () => {
  it('sends register write requests and refreshes after success', async () => {
    const memoryViews = createMemoryViewState();
    const postSnapshot = vi.fn().mockResolvedValue(undefined);
    const refreshController = createRefreshController(() => ({ views: [] }), {
      postSnapshot,
      onSnapshotPosted: vi.fn(),
      onSnapshotFailed: vi.fn(),
    });
    const customRequest = vi.fn().mockResolvedValue(undefined);
    const handled = await handleCommonPanelMessage(
      { type: 'registerEdit', register: 'bc', value: '1234' },
      {
        getSession: () => ({ type: 'z80', customRequest }),
        refreshController,
        autoRefreshMs: 150,
        setActiveTab: vi.fn(),
        getActiveTab: vi.fn(() => 'memory'),
        isPanelVisible: vi.fn(() => true),
        memoryViews,
      },
      {
        key: 'debug80/tec1Key',
        reset: 'debug80/tec1Reset',
        speed: 'debug80/tec1Speed',
        serialSend: 'debug80/tec1SerialInput',
        registerWrite: 'debug80/registerWrite',
      }
    );

    expect(handled).toBe(true);
    expect(customRequest).toHaveBeenCalledWith('debug80/registerWrite', {
      register: 'bc',
      value: '1234',
    });
    expect(postSnapshot).toHaveBeenCalled();
  });

  it('refreshes the snapshot when register writes are rejected', async () => {
    const memoryViews = createMemoryViewState();
    const postSnapshot = vi.fn().mockResolvedValue(undefined);
    const refreshController = createRefreshController(() => ({ views: [] }), {
      postSnapshot,
      onSnapshotPosted: vi.fn(),
      onSnapshotFailed: vi.fn(),
    });
    const customRequest = vi.fn().mockRejectedValue(new Error('running'));
    const handled = await handleCommonPanelMessage(
      { type: 'registerEdit', register: 'bc', value: '1234' },
      {
        getSession: () => ({ type: 'z80', customRequest }),
        refreshController,
        autoRefreshMs: 150,
        setActiveTab: vi.fn(),
        getActiveTab: vi.fn(() => 'memory'),
        isPanelVisible: vi.fn(() => true),
        memoryViews,
      },
      {
        key: 'debug80/tec1Key',
        reset: 'debug80/tec1Reset',
        speed: 'debug80/tec1Speed',
        serialSend: 'debug80/tec1SerialInput',
        registerWrite: 'debug80/registerWrite',
      }
    );

    expect(handled).toBe(true);
    expect(customRequest).toHaveBeenCalledWith('debug80/registerWrite', {
      register: 'bc',
      value: '1234',
    });
    expect(postSnapshot).toHaveBeenCalled();
  });
});
