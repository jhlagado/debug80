/**
 * @fileoverview Platform runtime and IO handler construction helpers.
 */

import type { IoHandlers } from '../z80/runtime';
import type { Tec1PlatformConfigNormalized, Tec1gPlatformConfigNormalized } from '../platforms/types';
import { createTec1Runtime, Tec1Runtime } from '../platforms/tec1/runtime';
import { createTec1gRuntime, Tec1gRuntime } from '../platforms/tec1g/runtime';
import type { PlatformKind } from './program-loader';
import type { TerminalConfig, TerminalConfigNormalized, TerminalState } from './types';

export interface PlatformIoBuildOptions {
  platform: PlatformKind;
  terminal?: TerminalConfig;
  tec1Config?: Tec1PlatformConfigNormalized;
  tec1gConfig?: Tec1gPlatformConfigNormalized;
  onTec1Update: (payload: unknown) => void;
  onTec1Serial: (payload: { byte: number; text: string }) => void;
  onTec1gUpdate: (payload: unknown) => void;
  onTec1gSerial: (payload: { byte: number; text: string }) => void;
  onTerminalOutput: (payload: { text: string }) => void;
}

export interface PlatformIoBuildResult {
  ioHandlers: IoHandlers | undefined;
  tec1Runtime?: Tec1Runtime;
  tec1gRuntime?: Tec1gRuntime;
  terminalState?: TerminalState;
}

/**
 * Builds platform-specific IO handlers and runtimes.
 */
export function buildPlatformIoHandlers(options: PlatformIoBuildOptions): PlatformIoBuildResult {
  const {
    platform,
    terminal,
    tec1Config,
    tec1gConfig,
    onTec1Update,
    onTec1Serial,
    onTec1gUpdate,
    onTec1gSerial,
    onTerminalOutput,
  } = options;

  if (platform === 'tec1') {
    if (!tec1Config) {
      return { ioHandlers: undefined };
    }
    const tec1Runtime = createTec1Runtime(
      tec1Config,
      (payload) => onTec1Update(payload),
      (byte) => {
        const value = byte & 0xff;
        const text = String.fromCharCode(value);
        onTec1Serial({ byte: value, text });
      }
    );
    return { ioHandlers: tec1Runtime.ioHandlers, tec1Runtime };
  }

  if (platform === 'tec1g') {
    if (!tec1gConfig) {
      return { ioHandlers: undefined };
    }
    const tec1gRuntime = createTec1gRuntime(
      tec1gConfig,
      (payload) => onTec1gUpdate(payload),
      (byte) => {
        const value = byte & 0xff;
        const text = String.fromCharCode(value);
        onTec1gSerial({ byte: value, text });
      }
    );
    return { ioHandlers: tec1gRuntime.ioHandlers, tec1gRuntime };
  }

  if (!terminal) {
    return { ioHandlers: undefined };
  }

  const config: TerminalConfigNormalized = {
    txPort: terminal.txPort ?? 0,
    rxPort: terminal.rxPort ?? 1,
    statusPort: terminal.statusPort ?? 2,
    interrupt: terminal.interrupt ?? false,
  };
  const terminalState: TerminalState = { config, input: [] };

  const ioHandlers: IoHandlers = {
    read: (port: number): number => {
      const p = port & 0xff;
      if (p === terminalState.config.rxPort) {
        const value = terminalState.input.shift();
        return value ?? 0;
      }
      if (p === terminalState.config.statusPort) {
        const rxAvail = terminalState.input.length > 0 ? 1 : 0;
        const txReady = 0b10;
        return rxAvail | txReady;
      }
      return 0;
    },
    write: (port: number, value: number): void => {
      const p = port & 0xff;
      if (p === terminalState.config.txPort) {
        const byte = value & 0xff;
        const ch = String.fromCharCode(byte);
        onTerminalOutput({ text: ch });
      }
    },
    tick: (): { interrupt?: { nonMaskable?: boolean; data?: number } } | void => {
      if (terminalState.breakRequested === true) {
        terminalState.breakRequested = false;
        return { interrupt: { nonMaskable: false, data: 0x38 } };
      }
      return undefined;
    },
  };

  return { ioHandlers, terminalState };
}
