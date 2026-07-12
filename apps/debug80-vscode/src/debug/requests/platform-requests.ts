/**
 * @fileoverview Platform-specific request handlers for debug adapter commands.
 */

import { Z80Runtime } from '../../z80/runtime';
import type { HexProgram } from '../../z80/loaders';
import { KEY_RESET } from '../../platforms/tec-common';
import { applySerialInput, applySpeedChange, SerialTarget, SpeedTarget } from './io-requests';

export interface KeyTarget {
  applyKey: (code: number) => void;
  silenceSpeaker: () => void;
}

export interface ResettableTarget {
  resetState: () => void;
}

export type PlatformRuntime = KeyTarget & SerialTarget & SpeedTarget & ResettableTarget;

export type ResetPreserveRange = {
  start: number;
  end: number;
};

export type ResetOptions = {
  preserveRanges?: ResetPreserveRange[];
};

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
  program: HexProgram | undefined,
  entry: number | undefined,
  platformRuntime: ResettableTarget | undefined,
  options: ResetOptions = {}
): string | null {
  if (!runtime || program === undefined) {
    return 'Debug80: No program loaded.';
  }

  const preserveRanges = options.preserveRanges ?? [];
  const preserved =
    preserveRanges.length > 0
      ? capturePreservedRanges(runtime.hardware.memory, preserveRanges)
      : [];
  runtime.reset(program, entry);
  if (preserved.length > 0) {
    restorePreservedRanges(runtime.hardware.memory, preserved);
  }
  platformRuntime?.resetState();
  return null;
}

function capturePreservedRanges(
  memory: Uint8Array,
  ranges: ResetPreserveRange[]
): Array<{ start: number; bytes: Uint8Array }> {
  return ranges
    .map((range) => normalizeRange(range, memory.length))
    .filter((range): range is { start: number; end: number } => range !== undefined)
    .map((range) => ({
      start: range.start,
      bytes: memory.slice(range.start, range.end),
    }));
}

function restorePreservedRanges(
  memory: Uint8Array,
  preserved: Array<{ start: number; bytes: Uint8Array }>
): void {
  for (const range of preserved) {
    memory.set(range.bytes, range.start);
  }
}

function normalizeRange(
  range: ResetPreserveRange,
  memoryLength: number
): { start: number; end: number } | undefined {
  const start = Math.max(0, Math.min(memoryLength, Math.trunc(range.start)));
  const end = Math.max(start, Math.min(memoryLength, Math.trunc(range.end)));
  if (end <= start) {
    return undefined;
  }
  return { start, end };
}

export function handleSpeedRequest(runtime: SpeedTarget | undefined, args: unknown): string | null {
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
