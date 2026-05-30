/**
 * @fileoverview AZM library-backed implementation of the debug80 assembler backend interface.
 */

import * as fs from 'fs';
import * as path from 'path';
import { D8_DEBUG_MAP_EXT } from '../mapping/d8-map-paths';
import type { AssemblyDiagnostic, AssembleResult } from './assembler';
import type { AssembleBinOptions, AssembleOptions, AssemblerBackend } from './assembler-backend';

type DiagnosticSeverity = 'error' | 'warning' | 'info';

interface Diagnostic {
  id?: string;
  code?: string;
  severity?: DiagnosticSeverity;
  message?: string;
  file?: string;
  sourceName?: string;
  line?: number;
  column?: number;
}

interface HexArtifact {
  kind: 'hex';
  text: string;
}

interface BinArtifact {
  kind: 'bin';
  bytes: Uint8Array;
}

interface D8mArtifact {
  kind: 'd8m';
  json: unknown;
}

interface RegisterCareReportArtifact {
  kind: 'register-care-report';
  text: string;
}

interface RegisterCareInterfaceArtifact {
  kind: 'register-care-interface';
  text: string;
}

type Artifact =
  | HexArtifact
  | BinArtifact
  | D8mArtifact
  | RegisterCareReportArtifact
  | RegisterCareInterfaceArtifact;

interface CompilerOptions {
  outputType: 'bin' | 'hex';
  sourceRoot?: string;
  d8mInputs?: {
    hex?: string;
    bin?: string;
  };
  emitBin?: boolean;
  emitHex?: boolean;
  emitD8m?: boolean;
  registerCare?: 'off' | 'audit' | 'warn' | 'error' | 'strict';
  emitRegisterReport?: boolean;
  emitRegisterInterface?: boolean;
  registerCareProfile?: 'mon3';
  registerCareInterfaces?: string[];
}

interface EmittedByteMap {
  bytes: Map<number, number>;
}

interface FormatWriters {
  writeBin(map: EmittedByteMap): BinArtifact;
  [name: string]: unknown;
}

type CompileFn = (
  entryFile: string,
  options: CompilerOptions,
  deps: { formats: FormatWriters }
) => Promise<{ diagnostics: Diagnostic[]; artifacts: Artifact[] }>;

type AzmModules = {
  compile: CompileFn;
  defaultFormatWriters: FormatWriters;
};

type CompileSuccess = { success: true; artifacts: Artifact[] };
type CompileOutcome = AssembleResult | CompileSuccess;

async function loadAzmModules(): Promise<AzmModules> {
  const { compile, defaultFormatWriters } =
    (await import('@jhlagado/azm/compile')) as unknown as AzmModules;
  return { compile, defaultFormatWriters };
}

function artifactBase(filePath: string): string {
  const extension = path.extname(filePath);
  return extension.length > 0 ? filePath.slice(0, -extension.length) : filePath;
}

function findArtifact<K extends Artifact['kind']>(
  artifacts: Artifact[],
  kind: K
): Extract<Artifact, { kind: K }> | undefined {
  return artifacts.find((artifact): artifact is Extract<Artifact, { kind: K }> => {
    return artifact.kind === kind;
  });
}

function compareDiagnostics(a: Diagnostic, b: Diagnostic): number {
  const fileCmp = diagnosticFile(a).localeCompare(diagnosticFile(b));
  if (fileCmp !== 0) {
    return fileCmp;
  }
  const lineCmp = (a.line ?? Number.POSITIVE_INFINITY) - (b.line ?? Number.POSITIVE_INFINITY);
  if (lineCmp !== 0) {
    return lineCmp;
  }
  return (a.column ?? Number.POSITIVE_INFINITY) - (b.column ?? Number.POSITIVE_INFINITY);
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function diagnosticFile(diagnostic: Diagnostic): string {
  return nonEmptyString(diagnostic.file) ?? nonEmptyString(diagnostic.sourceName) ?? '';
}

function diagnosticId(diagnostic: Diagnostic): string {
  return nonEmptyString(diagnostic.id) ?? nonEmptyString(diagnostic.code) ?? 'AZM000';
}

function diagnosticSeverity(diagnostic: Diagnostic): DiagnosticSeverity {
  return diagnostic.severity === 'warning' || diagnostic.severity === 'info'
    ? diagnostic.severity
    : 'error';
}

function diagnosticMessage(diagnostic: Diagnostic): string {
  return nonEmptyString(diagnostic.message) ?? 'AZM diagnostic';
}

function formatDiagnostic(diagnostic: Diagnostic): string {
  const file = diagnosticFile(diagnostic);
  const location =
    diagnostic.line !== undefined && diagnostic.column !== undefined
      ? `${file !== '' ? file : 'azm'}:${diagnostic.line}:${diagnostic.column}`
      : diagnostic.line !== undefined
        ? `${file !== '' ? file : 'azm'}:${diagnostic.line}`
        : (file !== '' ? file : 'azm');
  return `${location}: ${diagnosticSeverity(diagnostic)}: [${diagnosticId(diagnostic)}] ${diagnosticMessage(diagnostic)}`;
}

function resolveDiagnosticPath(file: string, sourceRoot: string | undefined): string {
  if (path.isAbsolute(file) || sourceRoot === undefined || sourceRoot.length === 0) {
    return file;
  }
  return path.resolve(sourceRoot, file);
}

function readDiagnosticSourceLine(filePath: string, line: number | undefined): string | undefined {
  if (line === undefined || line <= 0) {
    return undefined;
  }
  try {
    return fs.readFileSync(filePath, 'utf-8').split(/\r?\n/)[line - 1];
  } catch {
    return undefined;
  }
}

function toAssemblyDiagnostic(
  diagnostic: Diagnostic,
  sourceRoot: string | undefined
): AssemblyDiagnostic {
  const file = diagnosticFile(diagnostic);
  const resolvedFile = file !== '' ? resolveDiagnosticPath(file, sourceRoot) : '';
  const sourceLine =
    resolvedFile !== '' ? readDiagnosticSourceLine(resolvedFile, diagnostic.line) : undefined;
  return {
    ...(resolvedFile !== '' ? { path: resolvedFile } : {}),
    ...(diagnostic.line !== undefined ? { line: diagnostic.line } : {}),
    ...(diagnostic.column !== undefined ? { column: diagnostic.column } : {}),
    message: diagnosticMessage(diagnostic),
    ...(sourceLine !== undefined ? { sourceLine } : {}),
  };
}

function writeTextArtifact(filePath: string, text: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf-8');
}

function writeBinaryArtifact(filePath: string, bytes: Uint8Array): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, Buffer.from(bytes));
}

function writeJsonArtifact(filePath: string, value: unknown): void {
  writeTextArtifact(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function azmFailure(message: string, diagnostic?: AssemblyDiagnostic): AssembleResult {
  return {
    success: false,
    error: message,
    ...(diagnostic !== undefined ? { diagnostic } : {}),
  };
}

function resolveBinPath(hexPath: string): string {
  return path.join(path.dirname(hexPath), `${path.basename(hexPath, path.extname(hexPath))}.bin`);
}

function resolveRegisterCareReportPath(hexPath: string): string {
  return `${artifactBase(hexPath)}.regcare.txt`;
}

function compactBinaryFromEmittedMap(map: EmittedByteMap, from = 0x0000, to = 0xffff): Uint8Array {
  const bytes = new Map<number, number>();
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const [address, rawValue] of map.bytes.entries()) {
    if (address < from || address > to) {
      continue;
    }
    if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
      continue;
    }
    bytes.set(address, rawValue & 0xff);
    min = Math.min(min, address);
    max = Math.max(max, address);
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return new Uint8Array();
  }

  const out = new Uint8Array(max - min + 1);
  for (let address = min; address <= max; address += 1) {
    out[address - min] = bytes.get(address) ?? 0;
  }
  return out;
}

function withRangedBinaryWriter(
  formats: FormatWriters,
  binFrom: number,
  binTo: number
): FormatWriters {
  return {
    ...formats,
    writeBin(map: EmittedByteMap): BinArtifact {
      return {
        kind: 'bin',
        bytes: compactBinaryFromEmittedMap(map, binFrom, binTo),
      };
    },
  };
}

function emitDiagnostics(diagnostics: Diagnostic[], onOutput: AssembleOptions['onOutput']): void {
  const sorted = [...diagnostics].sort(compareDiagnostics);
  if (sorted.length > 0) {
    onOutput?.(`${sorted.map(formatDiagnostic).join('\n')}\n`);
  }
}

function hasIntelHexDataRecords(text: string): boolean {
  return text.split(/\r?\n/).some((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith(':') || trimmed.length < 11) {
      return false;
    }
    const byteCount = Number.parseInt(trimmed.slice(1, 3), 16);
    const recordType = Number.parseInt(trimmed.slice(7, 9), 16);
    return Number.isFinite(byteCount) && byteCount > 0 && recordType === 0;
  });
}

function isCompileSuccess(result: CompileOutcome): result is CompileSuccess {
  return result.success === true && 'artifacts' in result;
}

export class AzmBackend implements AssemblerBackend {
  public readonly id = 'azm';

  public async assemble(options: AssembleOptions): Promise<AssembleResult> {
    const outDir = path.dirname(options.hexPath);
    const binPath = resolveBinPath(options.hexPath);
    const sourceRoot = options.sourceRoot ?? path.dirname(options.asmPath);
    fs.mkdirSync(outDir, { recursive: true });

    let modules: AzmModules;
    try {
      modules = await loadAzmModules();
    } catch (err) {
      const message = `azm library failed to load: ${err instanceof Error ? err.message : String(err)}`;
      options.onOutput?.(`${message}\n`);
      return azmFailure(message);
    }

    let result: CompileOutcome;
    try {
      const compiled = await modules.compile(
        options.asmPath,
        {
          outputType: 'hex',
          emitBin: true,
          emitHex: true,
          emitD8m: true,
          sourceRoot,
          ...(options.azm ?? {}),
          d8mInputs: {
            hex: options.hexPath,
            bin: binPath,
          },
        },
        { formats: modules.defaultFormatWriters }
      );
      emitDiagnostics(compiled.diagnostics, options.onOutput);
      result = compileResultToAssembleResult(
        compiled.diagnostics,
        compiled.artifacts,
        sourceRoot
      );
    } catch (err) {
      const message = `azm failed: ${err instanceof Error ? err.message : String(err)}`;
      options.onOutput?.(`${message}\n`);
      return azmFailure(message);
    }

    if (!isCompileSuccess(result)) {
      return result;
    }

    const artifacts = result.artifacts;
    const hex = findArtifact(artifacts, 'hex');
    if (hex === undefined) {
      return azmFailure(`azm succeeded but did not produce HEX output for "${options.asmPath}".`);
    }

    const base = artifactBase(options.hexPath);
    const d8 = findArtifact(artifacts, 'd8m');
    if (d8 === undefined) {
      return azmFailure(`azm succeeded but did not produce D8 output for "${options.asmPath}".`);
    }

    if (!hasIntelHexDataRecords(hex.text)) {
      return azmFailure(
        `azm succeeded but produced no HEX data records for "${options.asmPath}".`
      );
    }

    writeTextArtifact(options.hexPath, hex.text);

    const bin = findArtifact(artifacts, 'bin');
    if (bin !== undefined) {
      writeBinaryArtifact(binPath, bin.bytes);
    }

    writeJsonArtifact(`${base}${D8_DEBUG_MAP_EXT}`, d8.json);

    const registerCareReport = findArtifact(artifacts, 'register-care-report');
    if (registerCareReport !== undefined) {
      writeTextArtifact(resolveRegisterCareReportPath(options.hexPath), registerCareReport.text);
    }

    const registerCareInterface = findArtifact(artifacts, 'register-care-interface');
    if (registerCareInterface !== undefined) {
      writeTextArtifact(`${base}.asmi`, registerCareInterface.text);
    }

    return {
      success: true,
      stdout: `${options.hexPath}\n`,
    };
  }

  public async assembleBin(options: AssembleBinOptions): Promise<AssembleResult> {
    let modules: AzmModules;
    try {
      modules = await loadAzmModules();
    } catch (err) {
      const message = `azm library failed to load: ${err instanceof Error ? err.message : String(err)}`;
      options.onOutput?.(`${message}\n`);
      return azmFailure(message);
    }

    let result: CompileOutcome;
    try {
      const formats = withRangedBinaryWriter(
        modules.defaultFormatWriters,
        options.binFrom,
        options.binTo
      );
      const compiled = await modules.compile(
        options.asmPath,
        {
          outputType: 'bin',
          emitBin: true,
          emitHex: false,
          emitD8m: false,
          ...(options.azm ?? {}),
          ...(options.sourceRoot !== undefined ? { sourceRoot: options.sourceRoot } : {}),
        },
        { formats }
      );
      emitDiagnostics(compiled.diagnostics, options.onOutput);
      result = compileResultToAssembleResult(
        compiled.diagnostics,
        compiled.artifacts,
        options.sourceRoot
      );
    } catch (err) {
      const message = `azm bin failed: ${err instanceof Error ? err.message : String(err)}`;
      options.onOutput?.(`${message}\n`);
      return azmFailure(message);
    }

    if (!isCompileSuccess(result)) {
      return result;
    }

    const bin = findArtifact(result.artifacts, 'bin');
    if (bin === undefined) {
      return azmFailure(`azm succeeded but did not produce BIN output for "${options.asmPath}".`);
    }

    writeBinaryArtifact(resolveBinPath(options.hexPath), bin.bytes);
    return { success: true };
  }
}

function compileResultToAssembleResult(
  diagnostics: Diagnostic[],
  artifacts: Artifact[],
  sourceRoot: string | undefined
): CompileOutcome {
  const sorted = [...diagnostics].sort(compareDiagnostics);
  const firstError = sorted.find((diagnostic) => diagnosticSeverity(diagnostic) === 'error');
  if (firstError !== undefined) {
    return azmFailure(formatDiagnostic(firstError), toAssemblyDiagnostic(firstError, sourceRoot));
  }
  return {
    success: true,
    artifacts,
  };
}
