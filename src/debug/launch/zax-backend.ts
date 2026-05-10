/**
 * @fileoverview ZAX library-backed implementation of the debug80 assembler backend interface.
 */

import * as fs from 'fs';
import * as path from 'path';
import { D8_DEBUG_MAP_EXT } from '../mapping/d8-map-paths';
import type { AssemblyDiagnostic, AssembleResult } from './assembler';
import type { AssembleOptions, AssemblerBackend } from './assembler-backend';

type ZaxSeverity = 'error' | 'warning' | 'info';

interface ZaxDiagnostic {
  id: string;
  severity: ZaxSeverity;
  message: string;
  file: string;
  line?: number;
  column?: number;
}

interface ZaxTextArtifact {
  kind: 'hex' | 'lst' | 'asm80';
  text: string;
}

interface ZaxBinArtifact {
  kind: 'bin';
  bytes: Uint8Array;
}

interface ZaxD8mArtifact {
  kind: 'd8m';
  json: unknown;
}

type ZaxArtifact = ZaxTextArtifact | ZaxBinArtifact | ZaxD8mArtifact;

interface ZaxCompileResult {
  diagnostics: ZaxDiagnostic[];
  artifacts: ZaxArtifact[];
}

type ZaxCompile = (
  entryFile: string,
  options: {
    emitBin: boolean;
    emitHex: boolean;
    emitD8m: boolean;
    emitListing: boolean;
    emitAsm80: boolean;
    requireMain: boolean;
    defaultCodeBase: number;
  },
  deps: { formats: unknown }
) => Promise<ZaxCompileResult>;

interface ZaxModules {
  compile: ZaxCompile;
  defaultFormatWriters: unknown;
}

async function loadZaxModules(): Promise<ZaxModules> {
  const [{ compile }, { defaultFormatWriters }] = await Promise.all([
    import('@jhlagado/zax/dist/src/compile.js') as Promise<{ compile: ZaxCompile }>,
    import('@jhlagado/zax/dist/src/formats/index.js') as Promise<{
      defaultFormatWriters: unknown;
    }>,
  ]);
  return { compile, defaultFormatWriters };
}

function artifactBase(filePath: string): string {
  const extension = path.extname(filePath);
  return extension.length > 0 ? filePath.slice(0, -extension.length) : filePath;
}

function findArtifact(artifacts: ZaxArtifact[], kind: ZaxArtifact['kind']): ZaxArtifact | undefined {
  return artifacts.find((artifact) => artifact.kind === kind);
}

function compareDiagnostics(a: ZaxDiagnostic, b: ZaxDiagnostic): number {
  const fileCmp = a.file.localeCompare(b.file);
  if (fileCmp !== 0) {
    return fileCmp;
  }
  const lineCmp = (a.line ?? Number.POSITIVE_INFINITY) - (b.line ?? Number.POSITIVE_INFINITY);
  if (lineCmp !== 0) {
    return lineCmp;
  }
  return (a.column ?? Number.POSITIVE_INFINITY) - (b.column ?? Number.POSITIVE_INFINITY);
}

function formatDiagnostic(diagnostic: ZaxDiagnostic): string {
  const location =
    diagnostic.line !== undefined && diagnostic.column !== undefined
      ? `${diagnostic.file}:${diagnostic.line}:${diagnostic.column}`
      : diagnostic.line !== undefined
        ? `${diagnostic.file}:${diagnostic.line}`
        : diagnostic.file;
  return `${location}: ${diagnostic.severity}: [${diagnostic.id}] ${diagnostic.message}`;
}

function toAssemblyDiagnostic(diagnostic: ZaxDiagnostic): AssemblyDiagnostic {
  return {
    path: diagnostic.file,
    ...(diagnostic.line !== undefined ? { line: diagnostic.line } : {}),
    ...(diagnostic.column !== undefined ? { column: diagnostic.column } : {}),
    message: diagnostic.message,
  };
}

function writeTextArtifact(filePath: string, text: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf-8');
}

function writeJsonArtifact(filePath: string, value: unknown): void {
  writeTextArtifact(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function zaxFailure(message: string, diagnostic?: AssemblyDiagnostic): AssembleResult {
  return {
    success: false,
    error: message,
    ...(diagnostic !== undefined ? { diagnostic } : {}),
  };
}

export class ZaxBackend implements AssemblerBackend {
  public readonly id = 'zax';

  public async assemble(options: AssembleOptions): Promise<AssembleResult> {
    const outDir = path.dirname(options.hexPath);
    fs.mkdirSync(outDir, { recursive: true });

    let modules: ZaxModules;
    try {
      modules = await loadZaxModules();
    } catch (err) {
      const message = `zax library failed to load: ${err instanceof Error ? err.message : String(err)}`;
      options.onOutput?.(`${message}\n`);
      return zaxFailure(message);
    }

    let result: ZaxCompileResult;
    try {
      result = await modules.compile(
        options.asmPath,
        {
          emitBin: false,
          emitHex: true,
          emitD8m: true,
          emitListing: true,
          emitAsm80: true,
          requireMain: true,
          defaultCodeBase: 0x0100,
        },
        { formats: modules.defaultFormatWriters }
      );
    } catch (err) {
      const message = `zax failed: ${err instanceof Error ? err.message : String(err)}`;
      options.onOutput?.(`${message}\n`);
      return zaxFailure(message);
    }

    const diagnostics = [...result.diagnostics].sort(compareDiagnostics);
    if (diagnostics.length > 0) {
      options.onOutput?.(`${diagnostics.map(formatDiagnostic).join('\n')}\n`);
    }
    const firstError = diagnostics.find((diagnostic) => diagnostic.severity === 'error');
    if (firstError !== undefined) {
      return zaxFailure(formatDiagnostic(firstError), toAssemblyDiagnostic(firstError));
    }

    const hex = findArtifact(result.artifacts, 'hex');
    const listing = findArtifact(result.artifacts, 'lst');
    if (hex === undefined || hex.kind !== 'hex') {
      return zaxFailure(`zax succeeded but did not produce HEX output for "${options.asmPath}".`);
    }
    if (listing === undefined || listing.kind !== 'lst') {
      return zaxFailure(`zax succeeded but did not produce listing output for "${options.asmPath}".`);
    }

    writeTextArtifact(options.hexPath, hex.text);
    writeTextArtifact(options.listingPath, listing.text);

    const base = artifactBase(options.hexPath);
    const d8 = findArtifact(result.artifacts, 'd8m');
    if (d8 !== undefined && d8.kind === 'd8m') {
      const hexD8Path = `${base}${D8_DEBUG_MAP_EXT}`;
      writeJsonArtifact(hexD8Path, d8.json);
      const listingD8Path = path.join(
        path.dirname(options.listingPath),
        `${path.basename(base)}${D8_DEBUG_MAP_EXT}`
      );
      if (listingD8Path !== hexD8Path) {
        writeJsonArtifact(listingD8Path, d8.json);
      }
    }

    const asm80 = findArtifact(result.artifacts, 'asm80');
    if (asm80 !== undefined && asm80.kind === 'asm80') {
      writeTextArtifact(`${base}.z80`, asm80.text);
    }

    return {
      success: true,
      stdout: `${options.hexPath}\n`,
    };
  }
}
