/**
 * @fileoverview Assembler backend abstraction for debug80 launch and mapping flows.
 */

import type { MappingParseResult } from '../mapping/parser';
import type { AssembleResult } from './assembler';
import { Asm80Backend } from './asm80-backend';

export interface AssembleOptions {
  asmPath: string;
  hexPath: string;
  listingPath: string;
  onOutput?: (message: string) => void;
}

export interface AssembleBinOptions {
  asmPath: string;
  hexPath: string;
  binFrom: number;
  binTo: number;
  onOutput?: (message: string) => void;
}

export interface AssemblerBackend {
  readonly id: string;
  assemble(options: AssembleOptions): AssembleResult;
  assembleBin?(options: AssembleBinOptions): AssembleResult;
  compileMappingInProcess?(sourcePath: string, baseDir: string): MappingParseResult | undefined;
}

export function resolveAssemblerBackend(
  assembler: string | undefined,
  _asmPath: string | undefined
): AssemblerBackend {
  const id = assembler?.trim().toLowerCase();

  if (id === undefined || id === '' || id === 'asm80') {
    return new Asm80Backend();
  }

  throw new Error(`Unknown assembler backend: "${assembler}"`);
}
