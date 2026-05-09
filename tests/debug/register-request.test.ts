/**
 * @file Register write request tests.
 */

import { describe, expect, it } from 'vitest';
import { createSessionState } from '../../src/debug/session/session-state';
import {
  handleRegisterWriteRequest,
  parseHexValue,
  writableRegisterKeyFromVariableName,
} from '../../src/debug/requests/register-request';
import { createZ80Runtime } from '../../src/z80/runtime';

describe('register-request', () => {
  it('writes core register pairs when the session is paused', () => {
    const sessionState = createSessionState();
    sessionState.runtime = createZ80Runtime({
      memory: new Uint8Array(0x10000),
      startAddress: 0,
    });
    sessionState.runState.isRunning = false;

    const error = handleRegisterWriteRequest(sessionState, {
      register: 'bc',
      value: '1234',
    });

    expect(error).toBeNull();
    const cpu = sessionState.runtime.getRegisters();
    expect(cpu.b).toBe(0x12);
    expect(cpu.c).toBe(0x34);
  });

  it('writes AF and alternate AF as editable register pairs', () => {
    const sessionState = createSessionState();
    sessionState.runtime = createZ80Runtime({
      memory: new Uint8Array(0x10000),
      startAddress: 0,
    });
    sessionState.runState.isRunning = false;

    expect(handleRegisterWriteRequest(sessionState, {
      register: 'af',
      value: 'A5C3',
    })).toBeNull();
    expect(handleRegisterWriteRequest(sessionState, {
      register: 'afp',
      value: '5A3C',
    })).toBeNull();

    const cpu = sessionState.runtime.getRegisters();
    expect(cpu.a).toBe(0xa5);
    expect(cpu.flags).toEqual({
      S: 1,
      Z: 1,
      Y: 0,
      H: 0,
      X: 0,
      P: 0,
      N: 1,
      C: 1,
    });
    expect(cpu.a_prime).toBe(0x5a);
    expect(cpu.flags_prime).toEqual({
      S: 0,
      Z: 0,
      Y: 1,
      H: 1,
      X: 1,
      P: 1,
      N: 0,
      C: 0,
    });
  });

  it('rejects writes while the session is running', () => {
    const sessionState = createSessionState();
    sessionState.runtime = createZ80Runtime({
      memory: new Uint8Array(0x10000),
      startAddress: 0,
    });
    sessionState.runState.isRunning = true;

    const error = handleRegisterWriteRequest(sessionState, {
      register: 'bc',
      value: '1234',
    });

    expect(error).toBe('Debug80: Registers can only be edited while paused.');
  });

  it('accepts 0x-prefixed hex values for custom register writes', () => {
    const sessionState = createSessionState();
    sessionState.runtime = createZ80Runtime({
      memory: new Uint8Array(0x10000),
      startAddress: 0,
    });
    sessionState.runState.isRunning = false;

    const error = handleRegisterWriteRequest(sessionState, {
      register: 'hl',
      value: '0x4243',
    });

    expect(error).toBeNull();
    const cpu = sessionState.runtime.getRegisters();
    expect(cpu.h).toBe(0x42);
    expect(cpu.l).toBe(0x43);
  });

  it('maps Registers UI names to writable keys', () => {
    expect(writableRegisterKeyFromVariableName('BC')).toBe('bc');
    expect(writableRegisterKeyFromVariableName("BC'")).toBe('bcp');
    expect(writableRegisterKeyFromVariableName('IX')).toBe('ix');
    expect(writableRegisterKeyFromVariableName('AF')).toBe('af');
    expect(writableRegisterKeyFromVariableName("AF'")).toBe('afp');
  });

  it('parses hex with optional 0x prefix', () => {
    expect(parseHexValue('0x10')).toBe(0x10);
    expect(parseHexValue('ff')).toBe(0xff);
    expect(parseHexValue('0Xabcd')).toBe(0xabcd);
  });
});
