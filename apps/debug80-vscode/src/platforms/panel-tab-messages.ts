/**
 * @file Panel tab and refresh message handling.
 */

import { applyMemoryViews } from './panel-memory';
import { refreshSnapshot, startAutoRefresh, stopAutoRefresh } from './panel-refresh';
import type { PanelMessage, PanelMessageContext } from './panel-message-types';

export function handlePanelLayoutMessage<TTab extends string>(
  msg: PanelMessage,
  ctx: PanelMessageContext<TTab>
): boolean {
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
  return false;
}
