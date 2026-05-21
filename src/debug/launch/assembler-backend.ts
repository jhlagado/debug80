/**
 * @fileoverview Assembler backend abstraction for debug80 launch and mapping flows.
 */

import * as path from 'path';
import type { MappingParseResult } from '../../mapping/parser';
import type { AssembleResult } from './assembler';
import { AzmBackend } from './azm-backend';

const azmSourceExtensions = new Set(['.a80', '.asm', '.inc', '.s', '.z80']);

export interface AssembleOptions {
  asmPath: string;
  hexPath: string;
  listingPath: string;
  sourceRoot?: string;
  onOutput?: (message: string) => void;
}

export interface AssembleBinOptions {
  asmPath: string;
  hexPath: string;
  binFrom: number;
  binTo: number;
  sourceRoot?: string;
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
  if (azmSourceExtensions.has(extension)) {
    return 'azm';
  }

  return undefined;
}

export function resolveAssemblerBackend(
  assembler: string | undefined,
  asmPath: string | undefined
): AssemblerBackend {
  const explicitId = assembler?.trim().toLowerCase();
  const id =
    explicitId === undefined || explicitId === '' ? inferAssemblerBackend(asmPath) : explicitId;

  if (id === undefined || id === '' || id === 'azm' || id === 'asm80') {
    return new AzmBackend();
  }

  throw new Error(`Unknown assembler backend: "${assembler}"`);
}
