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

interface RegisterContractsReportArtifact {
  kind: 'register-contracts-report';
  text: string;
}

interface RegisterContractsInterfaceArtifact {
  kind: 'register-contracts-interface';
  text: string;
}

interface LstArtifact {
  kind: 'lst';
  text: string;
}

type Artifact =
  | HexArtifact
  | BinArtifact
  | D8mArtifact
  | RegisterContractsReportArtifact
  | RegisterContractsInterfaceArtifact
  | LstArtifact;

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
  emitLst?: boolean;
  symbolCase?: 'strict' | 'insensitive';
  registerContracts?: 'off' | 'audit' | 'warn' | 'error' | 'strict';
  registerContractsPolicy?: {
    strict?: string[];
    audit?: string[];
    off?: string[];
  };
  emitRegisterReport?: boolean;
  emitRegisterInterface?: boolean;
  registerContractsProfile?: 'mon3';
  registerContractsInterfaces?: string[];
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
type LoadAzmFailure = { success: false; result: AssembleResult };
type LoadAzmResult = { success: true; modules: AzmModules } | LoadAzmFailure;
type RequiredArtifactResult<K extends Artifact['kind']> =
  { ok: true; artifact: Extract<Artifact, { kind: K }> } | { ok: false; result: AssembleResult };

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
        : file !== ''
          ? file
          : 'azm';
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

function resolveRegisterContractsReportPath(hexPath: string): string {
  return `${artifactBase(hexPath)}.regcontracts.txt`;
}

async function loadAzmModulesForAssembly(
  onOutput: AssembleOptions['onOutput']
): Promise<LoadAzmResult> {
  try {
    return { success: true, modules: await loadAzmModules() };
  } catch (err) {
    const message = `azm library failed to load: ${err instanceof Error ? err.message : String(err)}`;
    onOutput?.(`${message}\n`);
    return { success: false, result: azmFailure(message) };
  }
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

function requireArtifact<K extends Artifact['kind']>(
  artifacts: Artifact[],
  kind: K,
  label: string,
  asmPath: string
): RequiredArtifactResult<K> {
  const artifact = findArtifact(artifacts, kind);
  if (artifact === undefined) {
    return {
      ok: false,
      result: azmFailure(`azm succeeded but did not produce ${label} output for "${asmPath}".`),
    };
  }
  return { ok: true, artifact };
}

function writeOptionalTextArtifact(
  artifacts: Artifact[],
  kind: 'register-contracts-report' | 'register-contracts-interface' | 'lst',
  filePath: string
): void {
  const artifact = findArtifact(artifacts, kind);
  if (artifact !== undefined) {
    writeTextArtifact(filePath, artifact.text);
  }
}

function writeBinArtifactFromCompile(
  artifacts: Artifact[],
  binPath: string,
  asmPath: string
): AssembleResult | undefined {
  const binResult = requireArtifact(artifacts, 'bin', 'BIN', asmPath);
  if (!binResult.ok) {
    return binResult.result;
  }
  writeBinaryArtifact(binPath, binResult.artifact.bytes);
  return undefined;
}

function writeAssemblyArtifacts(
  options: AssembleOptions,
  artifacts: Artifact[],
  binPath: string
): AssembleResult | undefined {
  const hexResult = requireArtifact(artifacts, 'hex', 'HEX', options.asmPath);
  if (!hexResult.ok) {
    return hexResult.result;
  }

  const d8Result = requireArtifact(artifacts, 'd8m', 'D8', options.asmPath);
  if (!d8Result.ok) {
    return d8Result.result;
  }

  if (!hasIntelHexDataRecords(hexResult.artifact.text)) {
    return azmFailure(`azm succeeded but produced no HEX data records for "${options.asmPath}".`);
  }

  const base = artifactBase(options.hexPath);
  writeTextArtifact(options.hexPath, hexResult.artifact.text);

  const bin = findArtifact(artifacts, 'bin');
  if (bin !== undefined) {
    writeBinaryArtifact(binPath, bin.bytes);
  }

  writeJsonArtifact(`${base}${D8_DEBUG_MAP_EXT}`, d8Result.artifact.json);
  writeOptionalTextArtifact(artifacts, 'lst', `${base}.lst`);
  writeOptionalTextArtifact(
    artifacts,
    'register-contracts-report',
    resolveRegisterContractsReportPath(options.hexPath)
  );
  writeOptionalTextArtifact(artifacts, 'register-contracts-interface', `${base}.asmi`);

  return undefined;
}

function compileOutcome(
  compiled: { diagnostics: Diagnostic[]; artifacts: Artifact[] },
  sourceRoot: string | undefined,
  onOutput: AssembleOptions['onOutput']
): CompileOutcome {
  emitDiagnostics(compiled.diagnostics, onOutput);
  return compileResultToAssembleResult(compiled.diagnostics, compiled.artifacts, sourceRoot);
}

async function runAzmCompile(
  compileTask: () => Promise<{ diagnostics: Diagnostic[]; artifacts: Artifact[] }>,
  sourceRoot: string | undefined,
  onOutput: AssembleOptions['onOutput'],
  failurePrefix: string
): Promise<CompileOutcome> {
  try {
    return compileOutcome(await compileTask(), sourceRoot, onOutput);
  } catch (err) {
    const message = `${failurePrefix}: ${err instanceof Error ? err.message : String(err)}`;
    onOutput?.(`${message}\n`);
    return azmFailure(message);
  }
}

export class AzmBackend implements AssemblerBackend {
  public readonly id = 'azm';

  public async assemble(options: AssembleOptions): Promise<AssembleResult> {
    const outDir = path.dirname(options.hexPath);
    const binPath = resolveBinPath(options.hexPath);
    const sourceRoot = options.sourceRoot ?? path.dirname(options.asmPath);
    fs.mkdirSync(outDir, { recursive: true });

    const loaded = await loadAzmModulesForAssembly(options.onOutput);
    if (!loaded.success) {
      return loaded.result;
    }
    const { modules } = loaded;

    const result = await runAzmCompile(
      () =>
        modules.compile(
          options.asmPath,
          {
            outputType: 'hex',
            emitBin: true,
            emitHex: true,
            emitD8m: true,
            emitLst: true,
            sourceRoot,
            ...(options.azm ?? {}),
            d8mInputs: {
              hex: options.hexPath,
              bin: binPath,
            },
          },
          { formats: modules.defaultFormatWriters }
        ),
      sourceRoot,
      options.onOutput,
      'azm failed'
    );

    if (!isCompileSuccess(result)) {
      return result;
    }

    const artifactFailure = writeAssemblyArtifacts(options, result.artifacts, binPath);
    if (artifactFailure !== undefined) {
      return artifactFailure;
    }

    return {
      success: true,
      stdout: `${options.hexPath}\n`,
    };
  }

  public async assembleBin(options: AssembleBinOptions): Promise<AssembleResult> {
    const loaded = await loadAzmModulesForAssembly(options.onOutput);
    if (!loaded.success) {
      return loaded.result;
    }
    const { modules } = loaded;

    const result = await runAzmCompile(
      () => {
        const formats = withRangedBinaryWriter(
          modules.defaultFormatWriters,
          options.binFrom,
          options.binTo
        );
        return modules.compile(
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
      },
      options.sourceRoot,
      options.onOutput,
      'azm bin failed'
    );

    if (!isCompileSuccess(result)) {
      return result;
    }

    const artifactFailure = writeBinArtifactFromCompile(
      result.artifacts,
      resolveBinPath(options.hexPath),
      options.asmPath
    );
    if (artifactFailure !== undefined) {
      return artifactFailure;
    }
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
