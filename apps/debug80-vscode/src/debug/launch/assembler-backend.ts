/**
 * @fileoverview Assembler backend abstraction for debug80 launch and mapping flows.
 */

import * as path from 'path';
import type { MappingParseResult } from '../../mapping/types';
import type {
  AzmLaunchOptions,
  GlimmerLaunchOptions,
  NucleusLaunchOptions,
} from '../session/types';
import type { AssembleResult } from './assembler';
import { AtomBackend } from './atom-backend';
import { AzmBackend } from './azm-backend';
import { GlimmerBackend } from './glimmer-backend';
import { NucleusBackend } from './nucleus-backend';
import {
  selectConcreteZ80AssemblerFlavour,
  Z80_ASSEMBLER_FLAVOUR,
} from '@jhlagado/z80-tool-services';

const assemblySourceExtensions = new Set(['.asm', '.inc', '.z80']);

export interface AssembleOptions {
  asmPath: string;
  hexPath: string;
  sourceRoot?: string;
  azm?: AzmLaunchOptions;
  glimmer?: GlimmerLaunchOptions;
  nucleus?: NucleusLaunchOptions;
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
  if (assemblySourceExtensions.has(extension)) {
    return 'atom';
  }
  if (extension === '.glim') {
    return 'glimmer';
  }
  if (extension === '.nu') {
    return 'nucleus';
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

  if (id === undefined || id === '') {
    return new AtomBackend();
  }
  if (id === 'glimmer') {
    return new GlimmerBackend();
  }
  if (id === 'nucleus') {
    return new NucleusBackend();
  }
  try {
    const z80Assembler = selectConcreteZ80AssemblerFlavour({
      requested: id,
      defaultFlavour: Z80_ASSEMBLER_FLAVOUR.atom,
      ...(asmPath === undefined ? {} : { sourcePath: asmPath }),
    });
    if (z80Assembler === Z80_ASSEMBLER_FLAVOUR.atom) {
      return new AtomBackend();
    }
    if (z80Assembler === Z80_ASSEMBLER_FLAVOUR.azm) {
      return new AzmBackend();
    }
  } catch {
    // Report the original backend value below.
  }

  throw new Error(`Unknown assembler backend: "${assembler}"`);
}
