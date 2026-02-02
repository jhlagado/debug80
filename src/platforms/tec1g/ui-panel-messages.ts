/**
 * @file TEC-1G panel message handlers.
 */

import { Tec1gSpeedMode } from './types';
import { applyMemoryViews } from './ui-panel-memory';
import { refreshSnapshot, startAutoRefresh, stopAutoRefresh, RefreshController } from './ui-panel-refresh';

export type Tec1gMessage = {
  type?: string;
  code?: number;
  mode?: Tec1gSpeedMode;
  text?: string;
  tab?: string;
  key?: string;
  pressed?: boolean;
  shift?: boolean;
  ctrl?: boolean;
  alt?: boolean;
  enabled?: boolean;
  views?: Array<{ id?: string; view?: string; after?: number; address?: number }>;
};

/**
 * Context required for TEC-1G message handling.
 */
export type MessageContext = {
  getSession: () => { type: string; customRequest: (command: string, payload: unknown) => Promise<unknown> | Thenable<unknown> } | undefined;
  refreshController: RefreshController;
  autoRefreshMs: number;
  setActiveTab: (tab: 'ui' | 'memory') => void;
  getActiveTab: () => 'ui' | 'memory';
  isPanelVisible: () => boolean;
  memoryViews: ReturnType<typeof import('./ui-panel-memory').createMemoryViewState>;
};

/**
 * Handles inbound webview messages for the TEC-1G panel.
 */
export async function handleTec1gMessage(msg: Tec1gMessage, ctx: MessageContext): Promise<void> {
  if (msg.type === 'tab' && (msg.tab === 'ui' || msg.tab === 'memory')) {
    ctx.setActiveTab(msg.tab);
    if (ctx.isPanelVisible() && ctx.getActiveTab() === 'memory') {
      startAutoRefresh(ctx.refreshController.state, ctx.autoRefreshMs, () => {
        void refreshSnapshot(
          ctx.refreshController.state,
          ctx.refreshController.handlers,
          ctx.refreshController.snapshotPayload(),
          { allowErrors: false }
        );
      });
      void refreshSnapshot(
        ctx.refreshController.state,
        ctx.refreshController.handlers,
        ctx.refreshController.snapshotPayload(),
        { allowErrors: true }
      );
    } else {
      stopAutoRefresh(ctx.refreshController.state);
    }
    return;
  }
  if (msg.type === 'refresh' && Array.isArray(msg.views)) {
    applyMemoryViews(ctx.memoryViews, msg.views);
    void refreshSnapshot(
      ctx.refreshController.state,
      ctx.refreshController.handlers,
      ctx.refreshController.snapshotPayload(),
      { allowErrors: true }
    );
    return;
  }
  if (msg.type === 'key' && typeof msg.code === 'number') {
    const target = ctx.getSession();
    if (target?.type === 'z80') {
      try {
        await target.customRequest('debug80/tec1gKey', { code: msg.code });
      } catch {
        /* ignore */
      }
    }
    return;
  }
  if (msg.type === 'matrixKey' && typeof msg.key === 'string' && typeof msg.pressed === 'boolean') {
    const target = ctx.getSession();
    if (target?.type === 'z80') {
      try {
        await target.customRequest('debug80/tec1gMatrixKey', {
          key: msg.key,
          pressed: msg.pressed,
          shift: msg.shift,
          ctrl: msg.ctrl,
          alt: msg.alt,
        });
      } catch {
        /* ignore */
      }
    }
    return;
  }
  if (msg.type === 'matrixMode' && typeof msg.enabled === 'boolean') {
    const target = ctx.getSession();
    if (target?.type === 'z80') {
      try {
        await target.customRequest('debug80/tec1gMatrixMode', { enabled: msg.enabled });
      } catch {
        /* ignore */
      }
    }
    return;
  }
  if (msg.type === 'reset') {
    const target = ctx.getSession();
    if (target?.type === 'z80') {
      try {
        await target.customRequest('debug80/tec1gReset', {});
      } catch {
        /* ignore */
      }
    }
    return;
  }
  if (msg.type === 'speed' && (msg.mode === 'slow' || msg.mode === 'fast')) {
    const target = ctx.getSession();
    if (target?.type === 'z80') {
      try {
        await target.customRequest('debug80/tec1gSpeed', { mode: msg.mode });
      } catch {
        /* ignore */
      }
    }
    return;
  }
  if (msg.type === 'serialSend' && typeof msg.text === 'string') {
    const target = ctx.getSession();
    if (target?.type === 'z80') {
      try {
        await target.customRequest('debug80/tec1gSerialInput', { text: msg.text });
      } catch {
        /* ignore */
      }
    }
  }
}
