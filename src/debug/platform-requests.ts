/**
 * @fileoverview Platform-specific request handlers for debug adapter commands.
 */

import { Z80Runtime } from '../z80/runtime';
import { KEY_RESET } from '../platforms/tec-common';
import { applySerialInput, applySpeedChange, SerialTarget, SpeedTarget } from './io-requests';

export interface KeyTarget {
  applyKey: (code: number) => void;
  silenceSpeaker: () => void;
}

export interface ResettableTarget {
  resetState: () => void;
}

export type PlatformRuntime = KeyTarget & SerialTarget & SpeedTarget & ResettableTarget;

export function handleKeyRequest(
  runtime: KeyTarget | undefined,
  code: number | undefined,
  onReset?: () => void
): string | null {
  if (!runtime) {
    return 'Debug80: Platform not active.';
  }
  if (code === undefined) {
    return 'Debug80: Missing key code.';
  }
  if (code === KEY_RESET) {
    runtime.silenceSpeaker();
    onReset?.();
  }
  runtime.applyKey(code);
  return null;
}

export function handleResetRequest(
  runtime: Z80Runtime | undefined,
  program: unknown,
  entry: number | undefined,
  platformRuntime: ResettableTarget | undefined
): string | null {
  if (!runtime || program === undefined) {
    return 'Debug80: No program loaded.';
  }
  runtime.reset(program as never, entry);
  platformRuntime?.resetState();
  return null;
}

export function handleSpeedRequest(
  runtime: SpeedTarget | undefined,
  args: unknown
): string | null {
  if (!runtime) {
    return 'Debug80: Platform not active.';
  }
  return applySpeedChange(args, runtime);
}

export function handleSerialRequest(
  runtime: SerialTarget | undefined,
  args: unknown
): string | null {
  if (!runtime) {
    return 'Debug80: Platform not active.';
  }
  applySerialInput(args, runtime);
  return null;
}
