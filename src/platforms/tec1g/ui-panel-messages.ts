/**
 * @file TEC-1G panel message handlers.
 */

import { handleCommonPanelMessage, type PanelMessage, type PanelMessageContext } from '../panel-messages';

export type Tec1gMessage = PanelMessage & {
  key?: string;
  pressed?: boolean;
  shift?: boolean;
  ctrl?: boolean;
  alt?: boolean;
  enabled?: boolean;
};

/**
 * Context required for TEC-1G message handling.
 */
export type MessageContext = PanelMessageContext<'ui' | 'memory'>;

/**
 * Handles inbound webview messages for the TEC-1G panel.
 */
export async function handleTec1gMessage(msg: Tec1gMessage, ctx: MessageContext): Promise<void> {
  if (await handleCommonPanelMessage(msg, ctx, {
    key: 'debug80/tec1gKey',
    reset: 'debug80/tec1gReset',
    speed: 'debug80/tec1gSpeed',
    serialSend: 'debug80/tec1gSerialInput',
    registerWrite: 'debug80/registerWrite',
    memoryWrite: 'debug80/memoryWrite',
  })) {
    return;
  }
  const target = ctx.getSession();
  if (target?.type !== 'z80') {
    return;
  }
  if (msg.type === 'matrixKey' && typeof msg.key === 'string' && typeof msg.pressed === 'boolean') {
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
    return;
  }
  if (msg.type === 'matrixMode' && typeof msg.enabled === 'boolean') {
    try {
      await target.customRequest('debug80/tec1gMatrixMode', { enabled: msg.enabled });
    } catch {
      /* ignore */
    }
  }
}
