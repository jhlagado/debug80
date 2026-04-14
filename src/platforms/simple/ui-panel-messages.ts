/**
 * @file Simple platform panel message handlers.
 */

import { handleCommonPanelMessage, type PanelMessage, type PanelMessageContext } from '../panel-messages';

export type SimpleMessage = PanelMessage;

export type MessageContext = PanelMessageContext<'memory'>;

/**
 * Handles inbound webview messages for the simple platform panel.
 * Only memory panel messages (tab, refresh, registerEdit, memoryEdit) are
 * relevant — there is no hardware keypad, display, or serial port.
 */
export async function handleSimpleMessage(msg: SimpleMessage, ctx: MessageContext): Promise<void> {
  await handleCommonPanelMessage(msg, ctx, {
    key: 'debug80/tec1Key',
    reset: 'debug80/tec1Reset',
    speed: 'debug80/tec1Speed',
    serialSend: 'debug80/tec1SerialInput',
    registerWrite: 'debug80/registerWrite',
    memoryWrite: 'debug80/memoryWrite',
  });
}
