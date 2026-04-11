/**
 * @fileoverview Helpers for paused-session register write requests.
 */

import type { SessionStateShape } from './session-state';
import type { DebugProtocol } from '@vscode/debugprotocol';
import type { Cpu } from '../z80/types';

type RegisterWriteArgs = {
  register?: string;
  value?: unknown;
};

const WRITABLE_REGISTERS = new Set(['bc', 'de', 'hl', 'bcp', 'dep', 'hlp', 'ix', 'iy', 'pc', 'sp']);

function parseHexValue(value: unknown): number | null {
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
  return Number.isFinite(parsed) ? parsed : null;
}

function setRegisterPair(cpu: Cpu, name: string, value: number): void {
  switch (name) {
    case 'bc':
      cpu.b = (value >> 8) & 0xff;
      cpu.c = value & 0xff;
      return;
    case 'de':
      cpu.d = (value >> 8) & 0xff;
      cpu.e = value & 0xff;
      return;
    case 'hl':
      cpu.h = (value >> 8) & 0xff;
      cpu.l = value & 0xff;
      return;
    case 'bcp':
      cpu.b_prime = (value >> 8) & 0xff;
      cpu.c_prime = value & 0xff;
      return;
    case 'dep':
      cpu.d_prime = (value >> 8) & 0xff;
      cpu.e_prime = value & 0xff;
      return;
    case 'hlp':
      cpu.h_prime = (value >> 8) & 0xff;
      cpu.l_prime = value & 0xff;
      return;
    case 'ix':
      cpu.ix = value & 0xffff;
      return;
    case 'iy':
      cpu.iy = value & 0xffff;
      return;
    case 'pc':
      cpu.pc = value & 0xffff;
      return;
    case 'sp':
      cpu.sp = value & 0xffff;
      return;
    default:
      return;
  }
}

export function handleRegisterWriteRequest(
  sessionState: SessionStateShape,
  args: unknown
): string | null {
  if (sessionState.runtime === undefined) {
    return 'Debug80: No program loaded.';
  }
  if (sessionState.runState.isRunning) {
    return 'Debug80: Registers can only be edited while paused.';
  }
  if (args === null || typeof args !== 'object') {
    return 'Debug80: Invalid register write request.';
  }

  const payload = args as RegisterWriteArgs;
  const register = payload.register?.toLowerCase();
  if (register === undefined || !WRITABLE_REGISTERS.has(register)) {
    return 'Debug80: Unsupported register.';
  }

  const value = parseHexValue(payload.value);
  if (value === null) {
    return 'Debug80: Invalid hex value.';
  }

  const cpu = sessionState.runtime.getRegisters();
  setRegisterPair(cpu, register, value);
  return null;
}

export function sendRegisterWriteResponse(
  response: DebugProtocol.Response,
  error: string | null,
  sendResponse: (response: DebugProtocol.Response) => void,
  sendErrorResponse: (response: DebugProtocol.Response, id: number, message: string) => void
): boolean {
  if (error !== null) {
    sendErrorResponse(response, 1, error);
    return true;
  }
  sendResponse(response);
  return true;
}
