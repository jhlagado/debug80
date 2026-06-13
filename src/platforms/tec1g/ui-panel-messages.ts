/**
 * @file TEC-1G panel message handlers.
 */

import {
  handleCommonPanelMessage,
  type PanelMessage,
  type PanelMessageContext,
} from '../panel-messages';

export type Tec1gMessage = PanelMessage & {
  key?: string;
  pressed?: boolean;
  shift?: boolean;
  ctrl?: boolean;
  fn?: boolean;
  alt?: boolean;
  enabled?: boolean;
  matrixModeAfterReset?: boolean;
};

/**
 * Context required for TEC-1G message handling.
 */
export type MessageContext = PanelMessageContext<'ui' | 'memory'>;

/**
 * Handles inbound webview messages for the TEC-1G panel.
 */
export async function handleTec1gMessage(msg: Tec1gMessage, ctx: MessageContext): Promise<void> {
  if (msg.type === 'reset') {
    if (
      await handleCommonPanelMessage(msg, ctx, {
        reset: 'debug80/tec1gReset',
        registerWrite: 'debug80/registerWrite',
        memoryWrite: 'debug80/memoryWrite',
      })
    ) {
      if (msg.matrixModeAfterReset === true) {
        const target = ctx.getSession();
        if (target?.type === 'z80') {
          try {
            await target.customRequest('debug80/tec1gMatrixMode', { enabled: true });
          } catch {
            /* ignore */
          }
        }
      }
      return;
    }
  }

  if (
    await handleCommonPanelMessage(msg, ctx, {
      key: 'debug80/tec1gKey',
      reset: 'debug80/tec1gReset',
      speed: 'debug80/tec1gSpeed',
      serialSend: 'debug80/tec1gSerialInput',
      registerWrite: 'debug80/registerWrite',
      memoryWrite: 'debug80/memoryWrite',
    })
  ) {
    return;
  }
  const target = ctx.getSession();
  if (target?.type !== 'z80') {
    if (msg.type === 'matrixKey') {
      ctx.logger?.warn('Debug80 matrix trace webview message dropped: no active z80 session', msg);
    }
    return;
  }
  if (msg.type === 'matrixKey' && typeof msg.key === 'string' && typeof msg.pressed === 'boolean') {
    const payload = {
      key: msg.key,
      pressed: msg.pressed,
      shift: msg.shift,
      ctrl: msg.ctrl,
      fn: msg.fn,
      alt: msg.alt,
    };
    ctx.logger?.info('Debug80 matrix trace webview message', payload);
    try {
      await target.customRequest('debug80/tec1gMatrixKey', payload);
      ctx.logger?.info('Debug80 matrix trace custom request accepted', payload);
    } catch (err) {
      ctx.logger?.warn('Debug80 matrix trace custom request failed', {
        payload,
        error: String(err),
      });
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
