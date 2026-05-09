/**
 * @file Shared message handling helpers for platform panels.
 */

import { applyMemoryViews, type MemoryViewState } from './panel-memory';
import {
  refreshSnapshot,
  startAutoRefresh,
  stopAutoRefresh,
  type RefreshController,
} from './panel-refresh';

export type PanelMessage = {
  type?: string;
  code?: number;
  mode?: string;
  register?: string;
  address?: number;
  value?: string;
  allowReadOnly?: boolean;
  text?: string;
  tab?: string;
  views?: Array<{ id?: string; view?: string; after?: number; address?: number }>;
};

export type PanelSession = {
  type: string;
  customRequest: (command: string, payload: unknown) => Promise<unknown> | Thenable<unknown>;
} | undefined;

export type PanelMessageContext<TTab extends string> = {
  getSession: () => PanelSession;
  refreshController: RefreshController;
  autoRefreshMs: number;
  setActiveTab: (tab: TTab) => void;
  getActiveTab: () => TTab;
  isPanelVisible: () => boolean;
  memoryViews: MemoryViewState;
};

export type PanelCommands = {
  key: string;
  reset: string;
  speed: string;
  serialSend: string;
  registerWrite: string;
  memoryWrite: string;
};

async function sendCommand(
  session: Exclude<PanelSession, undefined>,
  command: string,
  payload: unknown
): Promise<boolean> {
  try {
    await session.customRequest(command, payload);
    return true;
  } catch {
    return false;
  }
}

/**
 * Handles the shared subset of TEC-1/TEC-1G panel messages.
 *
 * Returns true when the message was handled by the shared layer.
 */
export async function handleCommonPanelMessage<TTab extends string>(
  msg: PanelMessage,
  ctx: PanelMessageContext<TTab>,
  commands: PanelCommands
): Promise<boolean> {
  if (msg.type === 'tab' && (msg.tab === 'ui' || msg.tab === 'memory')) {
    ctx.setActiveTab(msg.tab as TTab);
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
    return true;
  }
  if (msg.type === 'refresh' && Array.isArray(msg.views)) {
    applyMemoryViews(ctx.memoryViews, msg.views);
    void refreshSnapshot(
      ctx.refreshController.state,
      ctx.refreshController.handlers,
      ctx.refreshController.snapshotPayload(),
      { allowErrors: true }
    );
    return true;
  }
  const session = ctx.getSession();
  if (msg.type === 'registerEdit' && typeof msg.register === 'string' && typeof msg.value === 'string') {
    if (session?.type !== 'z80') {
      return true;
    }
    const ok = await sendCommand(session, commands.registerWrite, {
      register: msg.register,
      value: msg.value,
    });
    if (!ok && ctx.isPanelVisible()) {
      // Rehydrate from the runtime when the adapter rejects the write so the UI snaps back.
      void refreshSnapshot(
        ctx.refreshController.state,
        ctx.refreshController.handlers,
        ctx.refreshController.snapshotPayload(),
        { allowErrors: true }
      );
      return true;
    }
    void refreshSnapshot(
      ctx.refreshController.state,
      ctx.refreshController.handlers,
      ctx.refreshController.snapshotPayload(),
      { allowErrors: true }
    );
    return true;
  }
  if (msg.type === 'memoryEdit' && typeof msg.address === 'number' && typeof msg.value === 'string') {
    if (session?.type !== 'z80') {
      return true;
    }
    const payload = {
      address: msg.address,
      value: msg.value,
      ...(msg.allowReadOnly === true ? { allowReadOnly: true } : {}),
    };
    const ok = await sendCommand(session, commands.memoryWrite, payload);
    if (!ok && ctx.isPanelVisible()) {
      void refreshSnapshot(
        ctx.refreshController.state,
        ctx.refreshController.handlers,
        ctx.refreshController.snapshotPayload(),
        { allowErrors: true }
      );
      return true;
    }
    void refreshSnapshot(
      ctx.refreshController.state,
      ctx.refreshController.handlers,
      ctx.refreshController.snapshotPayload(),
      { allowErrors: true }
    );
    return true;
  }
  if (session?.type !== 'z80') {
    return msg.type === 'key' ||
      msg.type === 'reset' ||
      msg.type === 'speed' ||
      msg.type === 'serialSend';
  }
  if (msg.type === 'key' && typeof msg.code === 'number') {
    await sendCommand(session, commands.key, { code: msg.code });
    return true;
  }
  if (msg.type === 'reset') {
    await sendCommand(session, commands.reset, {});
    return true;
  }
  if (msg.type === 'speed' && (msg.mode === 'slow' || msg.mode === 'fast')) {
    await sendCommand(session, commands.speed, { mode: msg.mode });
    return true;
  }
  if (msg.type === 'serialSend' && typeof msg.text === 'string') {
    await sendCommand(session, commands.serialSend, { text: msg.text });
    return true;
  }
  return false;
}
