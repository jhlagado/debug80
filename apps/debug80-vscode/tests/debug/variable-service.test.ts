/**
 * @file Variable service tests.
 */

import { describe, it, expect } from 'vitest';
import { Handles } from '@vscode/debugadapter';
import { VariableService } from '../../src/debug/requests/variable-service';
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

function createVariableService(): {
  handles: Handles<string>;
  service: VariableService;
} {
  const handles = new Handles<string>();
  return { handles, service: new VariableService(handles) };
}

describe('VariableService', () => {
  it('creates source-map symbol scopes without exposing registers', () => {
    const { service } = createVariableService();
    const scopes = service.createScopes([
      { name: 'START', kind: 'label', file: 'src/main.z80', address: 0x4000 },
      { name: 'WIDTH', kind: 'constant', file: 'src/main.z80', value: 32 },
    ]);
    expect(scopes.map((scope) => scope.name)).toEqual(['Symbols', 'Constants']);
    expect(scopes.find((scope) => scope.name === 'Registers')).toBeUndefined();
  });

  it('hides the constants scope when the source map has no constants', () => {
    const { service } = createVariableService();
    const scopes = service.createScopes([
      { name: 'START', kind: 'label', file: 'src/main.z80', address: 0x4000 },
    ]);
    expect(scopes.map((scope) => scope.name)).toEqual(['Symbols']);
  });

  it('returns register variables for the registers scope', () => {
    const { handles, service } = createVariableService();
    const scopeRef = handles.create('registers');
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
    const { service } = createVariableService();
    const variables = service.resolveVariables(999, undefined);
    expect(variables).toEqual([]);
  });

  it('does not expose a Registers scope in Variables', () => {
    const { service } = createVariableService();
    const scopes = service.createScopes();
    expect(scopes.some((scope) => scope.name === 'Registers')).toBe(false);
    expect(service.isRegistersVariablesReference(scopes[0]?.variablesReference ?? 0)).toBe(false);
  });

  it('shows source-map symbols and constants as debugger variables', () => {
    const { service } = createVariableService();
    const memory = new Uint8Array(0x10000);
    memory[0x4200] = 0x41;
    memory[0x4201] = 0x42;
    const scopes = service.createScopes([
      {
        name: 'PLAYER_X',
        kind: 'data',
        file: 'src/main.z80',
        line: 12,
        address: 0x4200,
        size: 2,
      },
      {
        name: 'SCREEN_WIDTH',
        kind: 'constant',
        file: 'src/main.z80',
        line: 4,
        value: 32,
      },
    ]);
    const runtime = {
      getRegisters: buildCpu,
      getPC: () => 0x1000,
      hardware: { memory },
    };

    const symbolRef = scopes.find((scope) => scope.name === 'Symbols')?.variablesReference ?? 0;
    const constantRef = scopes.find((scope) => scope.name === 'Constants')?.variablesReference ?? 0;
    const symbols = service.resolveVariables(symbolRef, runtime);
    const constants = service.resolveVariables(constantRef, runtime);

    expect(symbols[0]).toMatchObject({
      name: 'PLAYER_X',
      value: '0x4200 = 0x41 / 0x4241',
    });
    expect(constants[0]).toMatchObject({
      name: 'SCREEN_WIDTH',
      value: '0x0020 / 32',
    });

    const expanded = service.resolveVariables(symbols[0]?.variablesReference ?? 0, runtime);
    expect(expanded.map((entry) => entry.name)).toEqual(
      expect.arrayContaining([
        'address',
        'kind',
        'size',
        'byte',
        'word',
        'bytes[2]',
        'ascii',
        'source',
      ])
    );
    expect(expanded.map((entry) => entry.name)).toContain('ascii');
  });
});
