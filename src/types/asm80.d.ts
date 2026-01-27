/// <reference types="node" />

declare module 'asm80/asm.js' {
  export interface Asm80CompileLine {
    addr?: number;
    lens?: number[];
    numline?: number;
    includedFile?: string;
    line?: string;
  }

  export interface Asm80SymbolDefinition {
    line?: number;
    file?: string;
  }

  export interface Asm80Symbol {
    value?: number;
    defined?: Asm80SymbolDefinition;
  }

  export type Asm80SymbolTable = Record<string, Asm80Symbol>;
  export type Asm80CompileListing = [Asm80CompileLine[], unknown];
  export type Asm80CompileResult = Asm80CompileListing | null;
  export type Asm80Error = string | Record<string, unknown>;

  export function compile(
    content: string,
    machine: unknown
  ): [Asm80Error | null, Asm80CompileResult, Asm80SymbolTable | null];

  export function fileGet(
    resolver: (file: string, binary?: boolean) => string | Buffer | null
  ): void;
}

declare module 'asm80/monolith.js' {
  export const Z80: unknown;
}
