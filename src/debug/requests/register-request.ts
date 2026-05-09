/**
 * @fileoverview Helpers for paused-session register write requests.
 */

import type { SessionStateShape } from '../session/session-state';
import type { Cpu } from '../../z80/types';
import { setFlagsFromByte } from '../../z80/core-helpers';

type RegisterWriteArgs = {
  register?: string;
  value?: unknown;
};

const WRITABLE_REGISTERS = new Set([
  'af',
  'bc',
  'de',
  'hl',
  'afp',
  'bcp',
  'dep',
  'hlp',
  'ix',
  'iy',
  'pc',
  'sp',
]);

/** Parses hex for register writes; accepts plain hex or `0x` / `0X` prefixed values. */
export function parseHexValue(value: unknown): number | null {
  if (typeof value !== 'string') {
    return null;
  }
  let trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
    trimmed = trimmed.slice(2).trim();
  }
  if (trimmed.length === 0 || !/^[0-9a-fA-F]+$/.test(trimmed)) {
    return null;
  }
  const parsed = Number.parseInt(trimmed, 16);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeRegisterVariableQuotes(name: string): string {
  return name.trim().replace(/\u2032/g, "'").replace(/\u2019/g, "'");
}

/**
 * Maps a Registers-scope variable `name` (as shown in the Variables UI) to a
 * writable register key, or `null` if the name is unknown or read-only.
 */
export function writableRegisterKeyFromVariableName(variableName: string): string | null {
  const n = normalizeRegisterVariableQuotes(variableName);
  const lower = n.toLowerCase();
  const prime = lower.endsWith("'");
  const base = prime ? lower.slice(0, -1) : lower;

  if (prime) {
    if (base === 'af') {
      return 'afp';
    }
    if (base === 'bc') {
      return 'bcp';
    }
    if (base === 'de') {
      return 'dep';
    }
    if (base === 'hl') {
      return 'hlp';
    }
    return null;
  }

  if (base === 'af') {
    return 'af';
  }
  if (base === 'pc') {
    return 'pc';
  }
  if (base === 'sp') {
    return 'sp';
  }
  if (base === 'bc') {
    return 'bc';
  }
  if (base === 'de') {
    return 'de';
  }
  if (base === 'hl') {
    return 'hl';
  }
  if (base === 'ix') {
    return 'ix';
  }
  if (base === 'iy') {
    return 'iy';
  }
  return null;
}

export function tryWriteRegisterByKey(
  sessionState: SessionStateShape,
  registerKey: string,
  value: unknown
): string | null {
  if (sessionState.runtime === undefined) {
    return 'Debug80: No program loaded.';
  }
  if (sessionState.runState.isRunning) {
    return 'Debug80: Registers can only be edited while paused.';
  }
  if (!WRITABLE_REGISTERS.has(registerKey)) {
    return 'Debug80: Unsupported register.';
  }

  const parsed = parseHexValue(value);
  if (parsed === null) {
    return 'Debug80: Invalid hex value.';
  }

  const cpu = sessionState.runtime.getRegisters();
  setRegisterPair(cpu, registerKey, parsed);
  return null;
}

function setRegisterPair(cpu: Cpu, name: string, value: number): void {
  switch (name) {
    case 'af':
      cpu.a = (value >> 8) & 0xff;
      setFlagsFromByte(cpu.flags, value & 0xff);
      return;
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
    case 'afp':
      cpu.a_prime = (value >> 8) & 0xff;
      setFlagsFromByte(cpu.flags_prime, value & 0xff);
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
  if (args === null || typeof args !== 'object') {
    return 'Debug80: Invalid register write request.';
  }

  const payload = args as RegisterWriteArgs;
  const register = payload.register?.toLowerCase();
  if (register === undefined || !WRITABLE_REGISTERS.has(register)) {
    return 'Debug80: Unsupported register.';
  }

  return tryWriteRegisterByKey(sessionState, register, payload.value);
}
