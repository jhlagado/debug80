/**
 * @fileoverview Atom library-backed assembler backend.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parseD8DebugMap } from '../../mapping/d8-map';
import type { AssemblyDiagnostic, AssembleResult } from './assembler';
import type { AssembleBinOptions, AssembleOptions, AssemblerBackend } from './assembler-backend';

interface AtomDiagnosticLocation {
  logicalIdentity?: string;
  path?: string;
  line?: number;
  column?: number;
}

interface AtomFailure extends Error {
  category?: string;
  code?: string;
  diagnostic?: AtomDiagnosticLocation;
  location?: AtomDiagnosticLocation;
}

interface AtomGeneration {
  finalCursor: number;
  images: readonly { address: number; bytes: Uint8Array | readonly number[] }[];
  patches?: readonly { address: number; bytes: Uint8Array | readonly number[] }[];
  layout?: readonly { kind: string; address: number; count?: number }[];
}

interface AtomBuildResult {
  project: unknown;
  generation: AtomGeneration;
}

interface AtomArtifacts {
  bin: Uint8Array;
  hex: string;
  listing: string;
  d8Text: string;
  d8: unknown;
}

export interface AtomCompilerApi {
  readonly assembleAtomProject: (options: {
    root: string;
    entry: string;
    assembler?: string;
    target: { start: number; capacity: number };
  }) => Promise<AtomBuildResult>;
  readonly renderAtomArtifacts: (
    result: AtomBuildResult,
    options: { base: number; entryAddress: number }
  ) => AtomArtifacts;
  readonly publishAtomOutputFiles: (
    outputs: readonly { path: string; bytes: Uint8Array | string }[]
  ) => Promise<readonly string[]>;
}

async function loadAtomCompiler(): Promise<AtomCompilerApi> {
  return (await import('atom-z80')) as unknown as AtomCompilerApi;
}

function contentBase(generation: AtomGeneration): number {
  const addresses = generation.images.map(({ address }) => address);
  for (const event of generation.layout ?? []) {
    if (event.kind === 'reserve' && event.count !== 0) {
      addresses.push(event.address);
    }
  }
  return addresses.length === 0 ? generation.finalCursor : Math.min(...addresses);
}

function binPathFromHexPath(hexPath: string): string {
  return path.join(path.dirname(hexPath), `${path.basename(hexPath, path.extname(hexPath))}.bin`);
}

function renderBinaryRange(
  result: AtomBuildResult,
  options: { binFrom: number; binTo: number }
): Uint8Array {
  const length = options.binTo - options.binFrom + 1;
  if (length < 1) {
    throw new RangeError('Atom binary range must contain at least one byte');
  }
  const bytes = new Uint8Array(length);
  const copy = (address: number, source: Uint8Array | readonly number[]): void => {
    const sourceBytes = source instanceof Uint8Array ? source : Uint8Array.from(source);
    const start = Math.max(address, options.binFrom);
    const end = Math.min(address + sourceBytes.length, options.binTo + 1);
    if (end <= start) {
      return;
    }
    bytes.set(sourceBytes.slice(start - address, end - address), start - options.binFrom);
  };
  for (const operation of result.generation.images) {
    copy(operation.address, operation.bytes);
  }
  for (const operation of result.generation.patches ?? []) {
    copy(operation.address, operation.bytes);
  }
  return bytes;
}

function sourceLine(filePath: string | undefined, line: number | undefined): string | undefined {
  if (filePath === undefined || line === undefined || line < 1) {
    return undefined;
  }
  try {
    return fs.readFileSync(filePath, 'utf8').split(/\r\n|\n|\r/)[line - 1];
  } catch {
    return undefined;
  }
}

function diagnosticFrom(error: AtomFailure, root: string): AssemblyDiagnostic | undefined {
  const location = error.diagnostic ?? error.location;
  if (location === undefined) {
    return undefined;
  }
  const logicalIdentity = location.logicalIdentity ?? location.path;
  const diagnosticPath =
    logicalIdentity === undefined ? undefined : path.resolve(root, logicalIdentity);
  const lineText = sourceLine(diagnosticPath, location.line);
  return {
    ...(diagnosticPath === undefined ? {} : { path: diagnosticPath }),
    ...(location.line === undefined ? {} : { line: location.line }),
    ...(location.column === undefined ? {} : { column: location.column }),
    message: error.message,
    ...(lineText === undefined ? {} : { sourceLine: lineText }),
  };
}

function failure(error: unknown, root: string): AssembleResult {
  const atomError = error instanceof Error ? (error as AtomFailure) : new Error(String(error));
  const diagnostic = diagnosticFrom(atomError, root);
  const message =
    diagnostic === undefined
      ? `Atom failed: ${atomError.message}`
      : `${diagnostic.path ?? 'Atom'}:${diagnostic.line ?? 0}:${diagnostic.column ?? 0}: ${atomError.message}${
          diagnostic.sourceLine === undefined ? '' : `\n${diagnostic.sourceLine}`
        }`;
  return {
    success: false,
    error: message,
    ...(diagnostic === undefined ? {} : { diagnostic }),
  };
}

export class AtomBackend implements AssemblerBackend {
  public readonly id = 'atom';
  public readonly supportsRangedBinary = true;

  public constructor(private readonly compiler?: AtomCompilerApi) {}

  public async assemble(options: AssembleOptions): Promise<AssembleResult> {
    const root = options.sourceRoot ?? path.dirname(options.asmPath);
    const entry = path.relative(root, options.asmPath);
    const extension = path.extname(options.hexPath);
    const artifactBase =
      extension.length === 0 ? options.hexPath : options.hexPath.slice(0, -extension.length);
    try {
      const compiler = this.compiler ?? (await loadAtomCompiler());
      const result = await compiler.assembleAtomProject({
        root,
        entry,
        assembler: 'atom',
        target: { start: 0, capacity: 0xffff },
      });
      const base = contentBase(result.generation);
      const artifacts = compiler.renderAtomArtifacts(result, { base, entryAddress: base });
      const binBytes =
        options.binaryRange === undefined
          ? artifacts.bin
          : renderBinaryRange(result, options.binaryRange);
      const parsed = parseD8DebugMap(artifacts.d8Text);
      if (parsed.map === undefined) {
        return {
          success: false,
          error: `Atom produced an invalid D8 artifact: ${parsed.error ?? 'unknown validation failure'}`,
        };
      }
      const published = await compiler.publishAtomOutputFiles([
        { path: options.hexPath, bytes: artifacts.hex },
        { path: `${artifactBase}.bin`, bytes: binBytes },
        { path: `${artifactBase}.d8.json`, bytes: artifacts.d8Text },
        { path: `${artifactBase}.lst`, bytes: artifacts.listing },
      ]);
      const message = `Atom wrote ${published.length} build artifacts\n`;
      options.onOutput?.(message);
      return { success: true, stdout: message, stderr: '' };
    } catch (error) {
      const result = failure(error, root);
      options.onOutput?.(`${result.error ?? 'Atom failed'}\n`);
      return result;
    }
  }

  public async assembleBin(options: AssembleBinOptions): Promise<AssembleResult> {
    const root = options.sourceRoot ?? path.dirname(options.asmPath);
    const entry = path.relative(root, options.asmPath);
    try {
      const compiler = this.compiler ?? (await loadAtomCompiler());
      const result = await compiler.assembleAtomProject({
        root,
        entry,
        assembler: 'atom',
        target: { start: 0, capacity: 0xffff },
      });
      const binPath = binPathFromHexPath(options.hexPath);
      const bytes = renderBinaryRange(result, options);
      await compiler.publishAtomOutputFiles([{ path: binPath, bytes }]);
      return { success: true };
    } catch (error) {
      const result = failure(error, root);
      options.onOutput?.(`${result.error ?? 'Atom failed'}\n`);
      return result;
    }
  }
}
