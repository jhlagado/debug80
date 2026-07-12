/**
 * @file Shared message handling helpers for platform panels.
 */

import { handlePanelEditMessage } from './panel-edit-messages';
import { handlePanelRuntimeMessage } from './panel-runtime-messages';
import { handlePanelLayoutMessage } from './panel-tab-messages';
import type { PanelCommands, PanelMessage, PanelMessageContext } from './panel-message-types';

export type { PanelCommands, PanelMessage, PanelMessageContext } from './panel-message-types';

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
  if (handlePanelLayoutMessage(msg, ctx)) {
    return true;
  }

  const session = ctx.getSession();
  if (await handlePanelEditMessage(msg, session, ctx, commands)) {
    return true;
  }
  return handlePanelRuntimeMessage(msg, session, commands);
}
