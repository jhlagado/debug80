/**
 * @file Runtime control message handling for shared platform panels.
 */

import {
  sendPanelCommand,
  type PanelCommands,
  type PanelMessage,
  type PanelSession,
} from './panel-message-types';

const RUNTIME_MESSAGE_TYPES = new Set(['key', 'reset', 'speed', 'serialSend']);

export async function handlePanelRuntimeMessage(
  msg: PanelMessage,
  session: PanelSession,
  commands: PanelCommands
): Promise<boolean> {
  if (session?.type !== 'z80') {
    return msg.type !== undefined && RUNTIME_MESSAGE_TYPES.has(msg.type);
  }
  return (
    (await handleKeyMessage(msg, session, commands)) ||
    (await handleResetMessage(msg, session, commands)) ||
    (await handleSpeedMessage(msg, session, commands)) ||
    (await handleSerialMessage(msg, session, commands))
  );
}

async function handleKeyMessage(
  msg: PanelMessage,
  session: Exclude<PanelSession, undefined>,
  commands: PanelCommands
): Promise<boolean> {
  if (msg.type !== 'key' || typeof msg.code !== 'number' || commands.key === undefined) {
    return false;
  }
  await sendPanelCommand(session, commands.key, { code: msg.code });
  return true;
}

async function handleResetMessage(
  msg: PanelMessage,
  session: Exclude<PanelSession, undefined>,
  commands: PanelCommands
): Promise<boolean> {
  if (msg.type !== 'reset' || commands.reset === undefined) {
    return false;
  }
  await sendPanelCommand(session, commands.reset, {});
  return true;
}

async function handleSpeedMessage(
  msg: PanelMessage,
  session: Exclude<PanelSession, undefined>,
  commands: PanelCommands
): Promise<boolean> {
  if (msg.type !== 'speed' || (msg.mode !== 'slow' && msg.mode !== 'fast')) {
    return false;
  }
  if (commands.speed === undefined) {
    return false;
  }
  await sendPanelCommand(session, commands.speed, { mode: msg.mode });
  return true;
}

async function handleSerialMessage(
  msg: PanelMessage,
  session: Exclude<PanelSession, undefined>,
  commands: PanelCommands
): Promise<boolean> {
  if (msg.type !== 'serialSend' || typeof msg.text !== 'string' || commands.serialSend === undefined) {
    return false;
  }
  await sendPanelCommand(session, commands.serialSend, { text: msg.text });
  return true;
}
