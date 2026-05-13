/**
 * @file Simple platform panel message handlers.
 */

import {
  handleCommonPanelMessage,
  type PanelMessage,
  type PanelMessageContext,
} from '../panel-messages';

export type SimpleMessage = PanelMessage;

export type MessageContext = PanelMessageContext<'ui' | 'memory'>;

const SIMPLE_MESSAGE_TYPES = new Set(['tab', 'refresh', 'registerEdit', 'memoryEdit']);

/**
 * Handles inbound webview messages for the simple platform panel.
 * Only memory panel messages (tab, refresh, registerEdit, memoryEdit) are
 * relevant — there is no hardware keypad, display, or serial port.
 */
export async function handleSimpleMessage(msg: SimpleMessage, ctx: MessageContext): Promise<void> {
  if (msg.type === undefined || !SIMPLE_MESSAGE_TYPES.has(msg.type)) {
    return;
  }
  await handleCommonPanelMessage(msg, ctx, {
    registerWrite: 'debug80/registerWrite',
    memoryWrite: 'debug80/memoryWrite',
  });
}
