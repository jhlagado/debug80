/**
 * @file Variable service tests.
 */

import { describe, it, expect } from 'vitest';
import { Handles } from '@vscode/debugadapter';
import { VariableService } from '../../src/debug/variable-service';
import { Cpu } from '../../src/z80/types';

const buildCpu = (): Cpu => ({
  a: 0x12,
  b: 0x34,
  c: 0x56,
  d: 0x78,
  e: 0x9a,
  h: 0xbc,
  l: 0xde,
  a_prime: 0x01,
  b_prime: 0x02,
  c_prime: 0x03,
  d_prime: 0x04,
  e_prime: 0x05,
  h_prime: 0x06,
  l_prime: 0x07,
  ix: 0x1234,
  iy: 0xabcd,
  i: 0x11,
  r: 0x22,
  sp: 0xbeef,
  pc: 0x1000,
  flags: { S: 1, Z: 0, Y: 1, H: 0, X: 1, P: 0, N: 1, C: 0 },
  flags_prime: { S: 0, Z: 1, Y: 0, H: 1, X: 0, P: 1, N: 0, C: 1 },
  imode: 0,
  iff1: 0,
  iff2: 0,
  halted: false,
  do_delayed_di: false,
  do_delayed_ei: false,
  cycle_counter: 0,
});

describe('VariableService', () => {
  it('creates a registers scope', () => {
    const handles = new Handles<string>();
    const service = new VariableService(handles);
    const scopes = service.createScopes();
    expect(scopes).toHaveLength(1);
    expect(scopes[0]?.name).toBe('Registers');
    expect(handles.get(scopes[0]?.variablesReference ?? 0)).toBe('registers');
  });

  it('returns register variables for the registers scope', () => {
    const handles = new Handles<string>();
    const service = new VariableService(handles);
    const scopeRef = service.createScopes()[0]?.variablesReference ?? 0;
    const cpu = buildCpu();
    const runtime = {
      getRegisters: () => cpu,
      getPC: () => cpu.pc,
    };

    const variables = service.resolveVariables(scopeRef, runtime);
    const flags = variables.find((entry) => entry.name === 'Flags');
    const pc = variables.find((entry) => entry.name === 'PC');
    const af = variables.find((entry) => entry.name === 'AF');

    expect(flags?.value).toBe('SzYhXpNc');
    expect(pc?.value).toBe('0x1000');
    expect(af?.value).toBe('0x12aa');
  });

  it('returns no variables for unknown scopes', () => {
    const handles = new Handles<string>();
    const service = new VariableService(handles);
    const variables = service.resolveVariables(999, undefined);
    expect(variables).toEqual([]);
  });
});
