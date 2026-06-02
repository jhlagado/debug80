/**
 * @file Test fixtures for shared platform panel message routing.
 */

import { vi } from 'vitest';
import { createMemoryViewState } from '../../src/platforms/panel-memory';
import {
  createRefreshController,
  type RefreshController,
} from '../../src/platforms/panel-refresh';
import {
  handleCommonPanelMessage,
  type PanelCommands,
  type PanelMessage,
  type PanelMessageContext,
} from '../../src/platforms/panel-messages';

export const PANEL_TEST_COMMANDS: PanelCommands = {
  key: 'debug80/tec1Key',
  reset: 'debug80/tec1Reset',
  speed: 'debug80/tec1Speed',
  serialSend: 'debug80/tec1SerialInput',
  registerWrite: 'debug80/registerWrite',
  memoryWrite: 'debug80/memoryWrite',
};

export type PanelTestContext = {
  ctx: PanelMessageContext<'ui' | 'memory'>;
  customRequest: ReturnType<typeof vi.fn>;
  postSnapshot: ReturnType<typeof vi.fn>;
  refreshController: RefreshController;
};

export function createPanelTestContext(options?: {
  customRequest?: ReturnType<typeof vi.fn>;
  sessionType?: string;
  visible?: boolean;
}): PanelTestContext {
  const memoryViews = createMemoryViewState();
  const { postSnapshot, refreshController } = createRefreshTestController();
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
    refreshController,
  };
}

export async function handlePanelMessageWithDefaultContext(
  message: PanelMessage,
  options?: Parameters<typeof createPanelTestContext>[0]
): Promise<PanelTestContext & { handled: boolean }> {
  const state = createPanelTestContext(options);
  const handled = await handleCommonPanelMessage(message, state.ctx, PANEL_TEST_COMMANDS);
  return { ...state, handled };
}

export function createRefreshTestController(): {
  postSnapshot: ReturnType<typeof vi.fn>;
  refreshController: RefreshController;
} {
  const postSnapshot = vi.fn().mockResolvedValue(undefined);
  const refreshController = createRefreshController(() => ({ views: [] }), {
    postSnapshot,
    onSnapshotPosted: vi.fn(),
    onSnapshotFailed: vi.fn(),
  });
  return { postSnapshot, refreshController };
}
