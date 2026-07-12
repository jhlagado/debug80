/**
 * @file Register and memory edit message handling.
 */

import { refreshSnapshot } from './panel-refresh';
import {
  sendPanelCommand,
  type PanelCommands,
  type PanelMessage,
  type PanelMessageContext,
  type PanelSession,
} from './panel-message-types';

export async function handlePanelEditMessage<TTab extends string>(
  msg: PanelMessage,
  session: PanelSession,
  ctx: PanelMessageContext<TTab>,
  commands: PanelCommands
): Promise<boolean> {
  if (
    msg.type === 'registerEdit' &&
    typeof msg.register === 'string' &&
    typeof msg.value === 'string'
  ) {
    if (session?.type !== 'z80') {
      return true;
    }
    const ok = await sendPanelCommand(session, commands.registerWrite, {
      register: msg.register,
      value: msg.value,
    });
    refreshAfterEdit(ctx, ok);
    return true;
  }
  if (
    msg.type === 'memoryEdit' &&
    typeof msg.address === 'number' &&
    typeof msg.value === 'string'
  ) {
    if (session?.type !== 'z80') {
      return true;
    }
    const payload = {
      address: msg.address,
      value: msg.value,
      ...(msg.allowReadOnly === true ? { allowReadOnly: true } : {}),
    };
    const ok = await sendPanelCommand(session, commands.memoryWrite, payload);
    refreshAfterEdit(ctx, ok);
    return true;
  }
  return false;
}

function refreshAfterEdit<TTab extends string>(
  ctx: PanelMessageContext<TTab>,
  commandSucceeded: boolean
): void {
  if (!commandSucceeded && !ctx.isPanelVisible()) {
    return;
  }
  void refreshSnapshot(
    ctx.refreshController.state,
    ctx.refreshController.handlers,
    ctx.refreshController.snapshotPayload(),
    { allowErrors: true }
  );
}

