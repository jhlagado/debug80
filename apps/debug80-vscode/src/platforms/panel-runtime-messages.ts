/**
 * @file Runtime control message handling for shared platform panels.
 */

import {
  sendPanelCommand,
  type PanelCommands,
  type PanelMessage,
  type PanelSession,
} from './panel-message-types';

const RUNTIME_MESSAGE_TYPES = ['key', 'reset', 'speed', 'serialSend'] as const;
const RUNTIME_MESSAGE_TYPE_SET = new Set<string>(RUNTIME_MESSAGE_TYPES);

type RuntimeMessageHandler = (
  msg: PanelMessage,
  session: Exclude<PanelSession, undefined>,
  commands: PanelCommands
) => Promise<boolean>;

export async function handlePanelRuntimeMessage(
  msg: PanelMessage,
  session: PanelSession,
  commands: PanelCommands
): Promise<boolean> {
  if (session?.type !== 'z80') {
    return isRuntimeMessageType(msg.type);
  }

  return handleActiveRuntimeMessage(msg, session, commands);
}

function isRuntimeMessageType(type: unknown): boolean {
  return typeof type === 'string' && RUNTIME_MESSAGE_TYPE_SET.has(type);
}

async function handleActiveRuntimeMessage(
  msg: PanelMessage,
  session: Exclude<PanelSession, undefined>,
  commands: PanelCommands
): Promise<boolean> {
  for (const handler of RUNTIME_MESSAGE_HANDLERS) {
    if (await handler(msg, session, commands)) {
      return true;
    }
  }
  return false;
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
  await sendPanelCommand(session, commands.reset, msg.fn === true ? { fn: true } : {});
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
  if (
    msg.type !== 'serialSend' ||
    typeof msg.text !== 'string' ||
    commands.serialSend === undefined
  ) {
    return false;
  }
  await sendPanelCommand(session, commands.serialSend, { text: msg.text });
  return true;
}

const RUNTIME_MESSAGE_HANDLERS: RuntimeMessageHandler[] = [
  handleKeyMessage,
  handleResetMessage,
  handleSpeedMessage,
  handleSerialMessage,
];
