/**
 * @fileoverview Helpers for paused-session memory write requests.
 */

import type { SessionStateShape } from './session-state';

type MemoryWriteArgs = {
  address?: unknown;
  value?: unknown;
};

function parseAddress(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value & 0xffff : null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
    return null;
  }
  if (!/^[0-9a-fA-F]+$/.test(trimmed)) {
    return null;
  }
  const parsed = Number.parseInt(trimmed, 16);
  return Number.isFinite(parsed) ? parsed & 0xffff : null;
}

function parseByteValue(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isInteger(value) && value >= 0 && value <= 0xff ? value & 0xff : null;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
    return null;
  }
  if (!/^[0-9a-fA-F]+$/.test(trimmed) || trimmed.length > 2) {
    return null;
  }
  const parsed = Number.parseInt(trimmed, 16);
  return Number.isFinite(parsed) ? parsed & 0xff : null;
}

export function handleMemoryWriteRequest(
  sessionState: SessionStateShape,
  args: unknown
): string | null {
  if (sessionState.runtime === undefined) {
    return 'Debug80: No program loaded.';
  }
  if (sessionState.runState.isRunning) {
    return 'Debug80: Memory can only be edited while paused.';
  }
  if (args === null || typeof args !== 'object') {
    return 'Debug80: Invalid memory write request.';
  }

  const payload = args as MemoryWriteArgs;
  const address = parseAddress(payload.address);
  if (address === null) {
    return 'Debug80: Invalid memory address.';
  }
  const value = parseByteValue(payload.value);
  if (value === null) {
    return 'Debug80: Invalid hex byte.';
  }

  const runtime = sessionState.runtime;
  if (typeof runtime.hardware.memWrite === 'function') {
    runtime.hardware.memWrite(address, value);
  } else {
    runtime.hardware.memory[address] = value;
  }
  return null;
}
