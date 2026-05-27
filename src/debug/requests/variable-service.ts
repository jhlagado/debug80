/**
 * @fileoverview Variable and scope builders for the debug adapter.
 */

import { Scope, Handles } from '@vscode/debugadapter';
import { DebugProtocol } from '@vscode/debugprotocol';
import { Cpu, Flags } from '../../z80/types';
import type { SourceMapDebugSymbol } from '../session/session-state';

type RegisterRuntime = {
  getRegisters: () => Cpu;
  getPC: () => number;
  hardware?: {
    memory?: Uint8Array;
    memRead?: (address: number) => number;
  };
};

/**
 * Builds variable scopes and register variables.
 */
export class VariableService {
  private symbolsScopeRef: number | undefined;
  private constantsScopeRef: number | undefined;
  private symbolRefs = new Map<number, SourceMapDebugSymbol>();

  constructor(private readonly variableHandles: Handles<string>) {}

  createScopes(symbols: SourceMapDebugSymbol[] = []): DebugProtocol.Scope[] {
    this.latestSymbols = symbols;
    this.symbolRefs.clear();
    if (this.symbolsScopeRef === undefined) {
      this.symbolsScopeRef = this.variableHandles.create('source-map-symbols');
    }
    if (this.constantsScopeRef === undefined) {
      this.constantsScopeRef = this.variableHandles.create('source-map-constants');
    }
    const hasSourceMapSymbols = symbols.length > 0;
    return [
      new Scope('Symbols', this.symbolsScopeRef, false),
      new Scope('Constants', this.constantsScopeRef, false),
    ].map((scope) => {
      if (!hasSourceMapSymbols) {
        scope.expensive = true;
      }
      return scope;
    });
  }

  isRegistersVariablesReference(variablesReference: number): boolean {
    return this.variableHandles.get(variablesReference) === 'registers';
  }

  resolveVariables(
    variablesReference: number,
    runtime?: RegisterRuntime
  ): DebugProtocol.Variable[] {
    const scopeType = this.variableHandles.get(variablesReference);
    if (runtime === undefined) {
      return [];
    }
    if (scopeType === 'source-map-symbols') {
      return this.buildSymbolVariables(runtime, variablesReference, false);
    }
    if (scopeType === 'source-map-constants') {
      return this.buildSymbolVariables(runtime, variablesReference, true);
    }
    if (typeof scopeType === 'string' && scopeType.startsWith('source-map-symbol:')) {
      const symbol = this.symbolRefs.get(variablesReference);
      return symbol ? this.expandMemorySymbol(symbol, runtime) : [];
    }
    if (scopeType !== 'registers') {
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

    const readOnly = { attributes: ['readOnly' as const] };

    return [
      {
        name: 'Flags',
        value: this.flagsToString(regs.flags),
        variablesReference: 0,
        presentationHint: readOnly,
      },
      { name: 'PC', value: this.format16(runtime.getPC()), variablesReference: 0 },
      { name: 'SP', value: this.format16(regs.sp), variablesReference: 0 },

      {
        name: 'AF',
        value: this.format16(af),
        variablesReference: 0,
        presentationHint: readOnly,
      },
      { name: 'BC', value: this.format16(bc), variablesReference: 0 },
      { name: 'DE', value: this.format16(de), variablesReference: 0 },
      { name: 'HL', value: this.format16(hl), variablesReference: 0 },

      {
        name: "AF'",
        value: this.format16(afp),
        variablesReference: 0,
        presentationHint: readOnly,
      },
      { name: "BC'", value: this.format16(bcp), variablesReference: 0 },
      { name: "DE'", value: this.format16(dep), variablesReference: 0 },
      { name: "HL'", value: this.format16(hlp), variablesReference: 0 },

      { name: 'IX', value: this.format16(regs.ix), variablesReference: 0 },
      { name: 'IY', value: this.format16(regs.iy), variablesReference: 0 },

      {
        name: 'I',
        value: this.format8(regs.i),
        variablesReference: 0,
        presentationHint: readOnly,
      },
      {
        name: 'R',
        value: this.format8(regs.r),
        variablesReference: 0,
        presentationHint: readOnly,
      },
    ];
  }

  setSourceMapSymbols(symbols: SourceMapDebugSymbol[]): void {
    this.latestSymbols = symbols;
  }

  private latestSymbols: SourceMapDebugSymbol[] = [];

  private buildSymbolVariables(
    runtime: RegisterRuntime,
    parentReference: number,
    constantsOnly: boolean
  ): DebugProtocol.Variable[] {
    const symbols = this.latestSymbols.filter((symbol) =>
      constantsOnly
        ? symbol.value !== undefined && symbol.address === undefined
        : symbol.address !== undefined
    );
    if (symbols.length === 0) {
      return [];
    }
    const sorted = [...symbols].sort((a, b) =>
      constantsOnly
        ? a.name.localeCompare(b.name)
        : (a.address ?? 0) - (b.address ?? 0) || a.name.localeCompare(b.name)
    );
    return sorted.slice(0, 250).map((symbol, index) => {
      const variableReference =
        !constantsOnly && symbol.address !== undefined
          ? this.createSymbolReference(parentReference, index, symbol)
          : 0;
      return {
        name: symbol.name,
        value: constantsOnly
          ? this.formatConstant(symbol.value ?? 0)
          : this.formatSymbolValue(symbol, runtime),
        variablesReference: variableReference,
        presentationHint: {
          attributes: ['readOnly' as const],
        },
      };
    });
  }

  private createSymbolReference(
    _parentReference: number,
    _index: number,
    symbol: SourceMapDebugSymbol
  ): number {
    const ref = this.variableHandles.create(`source-map-symbol:${symbol.name}`);
    this.symbolRefs.set(ref, symbol);
    return ref;
  }

  private expandMemorySymbol(
    symbol: SourceMapDebugSymbol,
    runtime: RegisterRuntime
  ): DebugProtocol.Variable[] {
    const address = symbol.address;
    if (address === undefined) {
      return [];
    }
    const previewLength = Math.max(1, Math.min(symbol.size ?? 8, 32));
    const bytes = Array.from({ length: previewLength }, (_unused, offset) =>
      this.readByte(runtime, address + offset)
    );
    const word = bytes.length >= 2 ? bytes[0]! | (bytes[1]! << 8) : undefined;
    const variables: DebugProtocol.Variable[] = [
      { name: 'address', value: this.format16(address), variablesReference: 0 },
      ...(symbol.kind !== undefined
        ? [{ name: 'kind', value: symbol.kind, variablesReference: 0 }]
        : []),
      ...(symbol.size !== undefined
        ? [
            {
              name: 'size',
              value: `${symbol.size} byte${symbol.size === 1 ? '' : 's'}`,
              variablesReference: 0,
            },
          ]
        : []),
      { name: 'byte', value: this.format8(bytes[0] ?? 0), variablesReference: 0 },
    ];
    if (word !== undefined && (symbol.size === undefined || symbol.size >= 2)) {
      variables.push({ name: 'word', value: this.format16(word), variablesReference: 0 });
    }
    variables.push({
      name: `bytes[${bytes.length}]`,
      value: bytes.map((byte) => this.format8(byte)).join(' '),
      variablesReference: 0,
    });
    const ascii = bytes
      .map((byte) => (byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '.'))
      .join('');
    if (ascii.replace(/\./g, '').length > 0) {
      variables.push({ name: 'ascii', value: JSON.stringify(ascii), variablesReference: 0 });
    }
    if (symbol.file !== '') {
      variables.push({
        name: 'source',
        value: `${symbol.file}${symbol.line !== undefined ? `:${symbol.line}` : ''}`,
        variablesReference: 0,
      });
    }
    return variables.map((variable) => ({
      ...variable,
      presentationHint: { attributes: ['readOnly' as const] },
    }));
  }

  private formatSymbolValue(symbol: SourceMapDebugSymbol, runtime: RegisterRuntime): string {
    const address = symbol.address ?? 0;
    const byte = this.readByte(runtime, address);
    const prefix = `${this.format16(address)} = ${this.format8(byte)}`;
    if (symbol.size === 2) {
      const word = byte | (this.readByte(runtime, address + 1) << 8);
      return `${prefix} / ${this.format16(word)}`;
    }
    if ((symbol.size ?? 0) > 2) {
      const preview = Array.from({ length: Math.min(symbol.size ?? 0, 8) }, (_unused, offset) =>
        this.format8(this.readByte(runtime, address + offset))
      ).join(' ');
      return `${this.format16(address)} (${symbol.size} bytes) ${preview}`;
    }
    return prefix;
  }

  private formatConstant(value: number): string {
    return `${this.format16(value & 0xffff)} / ${value}`;
  }

  private readByte(runtime: RegisterRuntime, address: number): number {
    const masked = address & 0xffff;
    if (runtime.hardware?.memRead) {
      return runtime.hardware.memRead(masked) & 0xff;
    }
    return runtime.hardware?.memory?.[masked] ?? 0;
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
