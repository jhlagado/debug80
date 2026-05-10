/**
 * @fileoverview Assembly toolchain integration for the Z80 debug adapter.
 * Handles running asm80 assembler and related build operations.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';
import * as asm80Module from 'asm80/asm.js';
import * as asm80Monolith from 'asm80/monolith.js';

const moduleRequire = createRequire(__filename);

/**
 * Result of running the assembler.
 */
export interface AssembleResult {
  /** Whether assembly succeeded */
  success: boolean;
  /** Error message if failed */
  error?: string;
  /** Stdout content */
  stdout?: string;
  /** Stderr content */
  stderr?: string;
  /** Parsed assembler diagnostic if available */
  diagnostic?: AssemblyDiagnostic;
}

export interface AssemblyDiagnostic {
  /** Source file associated with the diagnostic */
  path?: string;
  /** 1-based source line */
  line?: number;
  /** 1-based source column */
  column?: number;
  /** Primary diagnostic message */
  message: string;
  /** Source line text when available */
  sourceLine?: string;
}

export class AssembleFailureError extends Error {
  public readonly result: AssembleResult;

  public constructor(result: AssembleResult) {
    super(result.error ?? 'Assembly failed');
    this.name = 'AssembleFailureError';
    this.result = result;
  }
}

function extractQuotedValue(output: string, key: string): string | undefined {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escapedKey}:\\s*'([^'\\n\\r]+)'`, 'i').exec(output);
  return match?.[1]?.trim();
}

function extractNumericValue(output: string, key: string): number | undefined {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escapedKey}:\\s*(\\d+)`, 'i').exec(output);
  if (!match) {
    return undefined;
  }
  const value = Number.parseInt(match[1] ?? '', 10);
  return Number.isFinite(value) ? value : undefined;
}

function formatAsm80Error(err: unknown, asmPath?: string): string {
  if (typeof err === 'string') {
    return err;
  }
  if (err !== null && typeof err === 'object') {
    const record = err as Record<string, unknown>;
    const message = typeof record.msg === 'string' ? record.msg : JSON.stringify(record);
    const source = record.s;
    const line =
      source !== null &&
      typeof source === 'object' &&
      typeof (source as Record<string, unknown>).numline === 'number'
        ? (source as Record<string, number>).numline
        : undefined;
    const sourceLine =
      source !== null &&
      typeof source === 'object' &&
      typeof (source as Record<string, unknown>).line === 'string'
        ? (source as Record<string, string>).line
        : undefined;
    const diagnostic: AssemblyDiagnostic = {
      message,
      ...(asmPath !== undefined ? { path: asmPath } : {}),
      ...(line !== undefined ? { line } : {}),
      ...(sourceLine !== undefined ? { sourceLine: sourceLine.trim() } : {}),
    };
    return formatAssemblyDiagnostic(diagnostic);
  }
  return String(err);
}

export function parseAsm80Diagnostic(output: string, asmPath?: string): AssemblyDiagnostic | undefined {
  const trimmed = output.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const pathMatch = /Processing:\s+([^\n\r]+)/i.exec(trimmed);
  const errorMatch = /ERROR\s+([^\n\r]+)/i.exec(trimmed);
  const sourceMatch = />>>\s*(.+)/.exec(trimmed);
  const lineMatch = /at line\s+(\d+)/i.exec(trimmed);

  const message =
    errorMatch?.[1]?.trim() ??
    extractQuotedValue(trimmed, 'msg') ??
    trimmed.split(/\r?\n/, 1)[0]?.trim();
  if (message === undefined || message.length === 0) {
    return undefined;
  }

  const parsedLine =
    (lineMatch?.[1] !== undefined ? Number.parseInt(lineMatch[1], 10) : undefined) ??
    extractNumericValue(trimmed, 'numline');
  const parsedColumn = extractNumericValue(trimmed, 'col');
  const sourceLine = sourceMatch?.[1]?.trim() ?? extractQuotedValue(trimmed, 'line');

  return {
    message,
    ...(pathMatch?.[1] !== undefined
      ? { path: pathMatch[1].trim() }
      : asmPath !== undefined && asmPath.length > 0
        ? { path: asmPath }
        : {}),
    ...(parsedLine !== undefined && Number.isFinite(parsedLine) ? { line: parsedLine } : {}),
    ...(parsedColumn !== undefined && Number.isFinite(parsedColumn) ? { column: parsedColumn } : {}),
    ...(sourceLine !== undefined && sourceLine.length > 0 ? { sourceLine } : {}),
  };
}

export function formatAssemblyDiagnostic(diagnostic: AssemblyDiagnostic): string {
  const location =
    diagnostic.path !== undefined
      ? `${path.basename(diagnostic.path)}${
          diagnostic.line !== undefined ? `:${diagnostic.line}` : ''
        }`
      : diagnostic.line !== undefined
        ? `line ${diagnostic.line}`
        : undefined;
  return [location, diagnostic.message, diagnostic.sourceLine]
    .filter((value): value is string => value !== undefined && value.length > 0)
    .join('\n');
}

function configureAsm80FileResolver(sourceDir: string): void {
  asm80Module.fileGet((file: string, binary?: boolean) => {
    const resolved = path.resolve(sourceDir, file);
    if (!fs.existsSync(resolved)) {
      return null;
    }
    return binary === true ? fs.readFileSync(resolved) : fs.readFileSync(resolved, 'utf-8');
  });
}

function compileAsm80Source(
  asmPath: string
): [ReturnType<typeof asm80Module.compile>[0], NonNullable<ReturnType<typeof asm80Module.compile>[1]>] {
  const asmDir = path.dirname(asmPath);
  configureAsm80FileResolver(asmDir);
  const sourceText = fs.readFileSync(asmPath, 'utf-8');
  // asm80 logs caught compile errors to console before returning them. Suppress that
  // here so failed project builds report through Debug80 diagnostics only.
  // eslint-disable-next-line no-console
  const originalConsoleLog = console.log;
  // eslint-disable-next-line no-console
  console.log = (): void => undefined;
  let result: ReturnType<typeof asm80Module.compile>;
  try {
    result = asm80Module.compile(sourceText, asm80Monolith.Z80);
  } finally {
    // eslint-disable-next-line no-console
    console.log = originalConsoleLog;
  }
  const [err, compiled] = result;
  if (compiled === null) {
    return [err ?? 'asm80 did not produce compiled output', [[], {}]];
  }
  return [err, compiled];
}

function binaryFromCompiledLines(
  lines: asm80Module.Asm80CompileLine[],
  from = 0x0000,
  to = 0xffff
): Buffer {
  const bytes = new Map<number, number>();
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const line of lines) {
    if (typeof line.addr !== 'number' || !Array.isArray(line.lens)) {
      continue;
    }
    for (let offset = 0; offset < line.lens.length; offset += 1) {
      const address = line.addr + offset;
      if (address < from || address > to) {
        continue;
      }
      const value = line.lens[offset];
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        continue;
      }
      bytes.set(address, value & 0xff);
      min = Math.min(min, address);
      max = Math.max(max, address);
    }
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return Buffer.alloc(0);
  }

  const out = Buffer.alloc(max - min + 1);
  for (let address = min; address <= max; address += 1) {
    out[address - min] = bytes.get(address) ?? 0;
  }
  return out;
}

function resolveBinPath(hexPath: string): string {
  return path.join(path.dirname(hexPath), `${path.basename(hexPath, path.extname(hexPath))}.bin`);
}

/**
 * Runs the asm80 assembler to produce HEX and LST files.
 *
 * @param asmPath - Path to the assembly source file
 * @param hexPath - Path for the output HEX file
 * @param listingPath - Path for the output listing file
 * @param onOutput - Callback for assembler output
 * @returns Assembly result
 */
export function runAssembler(
  asmPath: string,
  hexPath: string,
  listingPath: string,
  onOutput?: (message: string) => void
): AssembleResult {
  const outDir = path.dirname(hexPath);

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  try {
    const [err, compiled] = compileAsm80Source(asmPath);
    if (err !== null && err !== undefined) {
      const error = formatAsm80Error(err, asmPath);
      const diagnostic = parseAsm80Diagnostic(error, asmPath);
      return {
        success: false,
        error,
        ...(diagnostic !== undefined ? { diagnostic } : {}),
      };
    }

    const [lines, symbols] = compiled;
    fs.writeFileSync(hexPath, asm80Module.hex(lines), 'utf-8');
    fs.writeFileSync(resolveBinPath(hexPath), binaryFromCompiledLines(lines));

    const listingDir = path.dirname(listingPath);
    if (!fs.existsSync(listingDir)) {
      fs.mkdirSync(listingDir, { recursive: true });
    }
    fs.writeFileSync(listingPath, asm80Module.lst(lines, symbols), 'utf-8');

    return {
      success: true,
    };
  } catch (err) {
    const message = `asm80 failed: ${err instanceof Error ? err.message : String(err)}`;
    onOutput?.(`${message}\n`);
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Runs the asm80 assembler to produce a binary file with BINFROM/BINTO directives.
 *
 * @param asmPath - Path to the assembly source file
 * @param hexPath - Path for reference (binary will be in same directory)
 * @param binFrom - Start address for binary
 * @param binTo - End address for binary
 * @param onOutput - Callback for assembler output
 * @returns Assembly result
 */
export function runAssemblerBin(
  asmPath: string,
  hexPath: string,
  binFrom: number,
  binTo: number,
  onOutput?: (message: string) => void
): AssembleResult {
  const outDir = path.dirname(hexPath);
  const binPath = resolveBinPath(hexPath);

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  try {
    const [err, compiled] = compileAsm80Source(asmPath);
    if (err !== null && err !== undefined) {
      return { success: false, error: formatAsm80Error(err, asmPath) };
    }

    const [lines] = compiled;
    fs.writeFileSync(binPath, binaryFromCompiledLines(lines, binFrom, binTo));

    return {
      success: true,
    };
  } catch (err) {
    const message = `asm80 bin failed: ${err instanceof Error ? err.message : String(err)}`;
    onOutput?.(`${message}\n`);
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Resolves the bundled TEC-1 ROM path.
 *
 * @returns Path to the bundled ROM, or undefined
 */
export function resolveBundledTec1Rom(): string | undefined {
  let vscodeModule: typeof import('vscode') | undefined;
  try {
    vscodeModule = moduleRequire('vscode') as typeof import('vscode');
  } catch {
    vscodeModule = undefined;
  }

  const extension = vscodeModule?.extensions.getExtension('jhlagado.debug80');
  if (!extension) {
    return undefined;
  }

  const candidate = path.join(extension.extensionPath, 'roms', 'tec1', 'mon-1b', 'mon-1b.hex');

  if (fs.existsSync(candidate)) {
    return candidate;
  }

  return undefined;
}
