/**
 * @fileoverview Variable and scope builders for the debug adapter.
 */

import { Scope, Handles } from '@vscode/debugadapter';
import { DebugProtocol } from '@vscode/debugprotocol';
import { Cpu, Flags } from '../z80/types';

type RegisterRuntime = {
  getRegisters: () => Cpu;
  getPC: () => number;
};

/**
 * Builds variable scopes and register variables.
 */
export class VariableService {
  constructor(private readonly variableHandles: Handles<string>) {}

  createScopes(): DebugProtocol.Scope[] {
    const registersRef = this.variableHandles.create('registers');
    return [new Scope('Registers', registersRef, false)];
  }

  resolveVariables(
    variablesReference: number,
    runtime?: RegisterRuntime
  ): DebugProtocol.Variable[] {
    const scopeType = this.variableHandles.get(variablesReference);
    if (scopeType !== 'registers' || runtime === undefined) {
      return [];
    }

    const regs = runtime.getRegisters();
    const flagByte = this.flagsToByte(regs.flags);
    const flagBytePrime = this.flagsToByte(regs.flags_prime);

    const af = ((regs.a & 0xff) << 8) | (flagByte & 0xff);
    const bc = ((regs.b & 0xff) << 8) | (regs.c & 0xff);
    const de = ((regs.d & 0xff) << 8) | (regs.e & 0xff);
    const hl = ((regs.h & 0xff) << 8) | (regs.l & 0xff);
    const afp = ((regs.a_prime & 0xff) << 8) | (flagBytePrime & 0xff);
    const bcp = ((regs.b_prime & 0xff) << 8) | (regs.c_prime & 0xff);
    const dep = ((regs.d_prime & 0xff) << 8) | (regs.e_prime & 0xff);
    const hlp = ((regs.h_prime & 0xff) << 8) | (regs.l_prime & 0xff);

    return [
      { name: 'Flags', value: this.flagsToString(regs.flags), variablesReference: 0 },
      { name: 'PC', value: this.format16(runtime.getPC()), variablesReference: 0 },
      { name: 'SP', value: this.format16(regs.sp), variablesReference: 0 },

      { name: 'AF', value: this.format16(af), variablesReference: 0 },
      { name: 'BC', value: this.format16(bc), variablesReference: 0 },
      { name: 'DE', value: this.format16(de), variablesReference: 0 },
      { name: 'HL', value: this.format16(hl), variablesReference: 0 },

      { name: "AF'", value: this.format16(afp), variablesReference: 0 },
      { name: "BC'", value: this.format16(bcp), variablesReference: 0 },
      { name: "DE'", value: this.format16(dep), variablesReference: 0 },
      { name: "HL'", value: this.format16(hlp), variablesReference: 0 },

      { name: 'IX', value: this.format16(regs.ix), variablesReference: 0 },
      { name: 'IY', value: this.format16(regs.iy), variablesReference: 0 },

      { name: 'I', value: this.format8(regs.i), variablesReference: 0 },
      { name: 'R', value: this.format8(regs.r), variablesReference: 0 },
    ];
  }

  private format16(value: number): string {
    return `0x${value.toString(16).padStart(4, '0')}`;
  }

  private format8(value: number): string {
    return `0x${value.toString(16).padStart(2, '0')}`;
  }

  private flagsToByte(flags: Flags): number {
    return (
      (flags.S << 7) |
      (flags.Z << 6) |
      (flags.Y << 5) |
      (flags.H << 4) |
      (flags.X << 3) |
      (flags.P << 2) |
      (flags.N << 1) |
      flags.C
    );
  }

  private flagsToString(flags: Flags): string {
    const letters: [keyof Flags, string][] = [
      ['S', 's'],
      ['Z', 'z'],
      ['Y', 'y'],
      ['H', 'h'],
      ['X', 'x'],
      ['P', 'p'],
      ['N', 'n'],
      ['C', 'c'],
    ];
    return letters.map(([key, ch]) => (flags[key] ? ch.toUpperCase() : ch)).join('');
  }
}
