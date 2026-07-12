/**
 * @fileoverview Assembler backend abstraction for debug80 launch and mapping flows.
 */

import * as path from 'path';
import type { MappingParseResult } from '../../mapping/types';
import type { AzmLaunchOptions } from '../session/types';
import type { AssembleResult } from './assembler';
import { AzmBackend } from './azm-backend';
import { GlimmerBackend } from './glimmer-backend';

const azmSourceExtensions = new Set(['.asm', '.inc', '.z80']);

export interface AssembleOptions {
  asmPath: string;
  hexPath: string;
  sourceRoot?: string;
  azm?: AzmLaunchOptions;
  onOutput?: (message: string) => void;
}

export interface AssembleBinOptions {
  asmPath: string;
  hexPath: string;
  binFrom: number;
  binTo: number;
  sourceRoot?: string;
  azm?: AzmLaunchOptions;
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
  if (extension === '.glim') {
    return 'glimmer';
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

  if (id === undefined || id === '' || id === 'azm') {
    return new AzmBackend();
  }
  if (id === 'glimmer') {
    return new GlimmerBackend();
  }

  throw new Error(`Unknown assembler backend: "${assembler}"`);
}
