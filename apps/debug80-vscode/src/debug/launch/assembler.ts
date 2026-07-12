/**
 * @fileoverview Shared assembler result types and diagnostics for Debug80 launch flows.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';

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
