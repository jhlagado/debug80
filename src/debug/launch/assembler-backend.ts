/**
 * @fileoverview Assembler backend abstraction for debug80 launch and mapping flows.
 */

import * as path from 'path';
import type { MappingParseResult } from '../../mapping/parser';
import type { AssembleResult } from './assembler';
import { Asm80Backend } from './asm80-backend';
import { ZaxBackend } from './zax-backend';

const asm80SourceExtensions = new Set(['.a80', '.asm', '.inc', '.s', '.z80']);
const zaxSourceExtensions = new Set(['.zax']);

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
  assemble(options: AssembleOptions): Promise<AssembleResult>;
  assembleBin?(options: AssembleBinOptions): Promise<AssembleResult>;
  compileMappingInProcess?(sourcePath: string, baseDir: string): MappingParseResult | undefined;
}

function inferAssemblerBackend(asmPath: string | undefined): string | undefined {
  if (asmPath === undefined || asmPath.length === 0) {
    return undefined;
  }

  const extension = path.extname(asmPath).toLowerCase();
  if (asm80SourceExtensions.has(extension)) {
    return 'asm80';
  }
  if (zaxSourceExtensions.has(extension)) {
    return 'zax';
  }

  return undefined;
}

export function resolveAssemblerBackend(
  assembler: string | undefined,
  asmPath: string | undefined
): AssemblerBackend {
  const explicitId = assembler?.trim().toLowerCase();
  const id = explicitId === undefined || explicitId === '' ? inferAssemblerBackend(asmPath) : explicitId;

  if (id === undefined || id === '' || id === 'asm80') {
    return new Asm80Backend();
  }
  if (id === 'zax') {
    return new ZaxBackend();
  }

  throw new Error(`Unknown assembler backend: "${assembler}"`);
}
