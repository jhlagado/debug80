/**
 * @file TEC-1 panel message handlers.
 */

import { handleCommonPanelMessage, type PanelMessage, type PanelMessageContext } from '../panel-messages';

export type Tec1Message = PanelMessage;

/**
 * Context required for TEC-1 message handling.
 */
export type MessageContext = PanelMessageContext<'home' | 'ui' | 'memory'>;

/**
 * Handles inbound webview messages for the TEC-1 panel.
 */
export async function handleTec1Message(msg: Tec1Message, ctx: MessageContext): Promise<void> {
  await handleCommonPanelMessage(msg, ctx, {
    key: 'debug80/tec1Key',
    reset: 'debug80/tec1Reset',
    speed: 'debug80/tec1Speed',
    serialSend: 'debug80/tec1SerialInput',
  });
}
