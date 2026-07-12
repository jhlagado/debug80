/**
 * @fileoverview Glimmer library-backed assembler backend: builds .glim
 * sources through @jhlagado/glimmer's in-process build API (generate,
 * AZM contract injection/check, assembly, and the debug-map rewrite
 * that attributes block-body lines to .glim source).
 */

import * as fs from 'fs';
import * as path from 'path';
import type { AssemblyDiagnostic, AssembleResult } from './assembler';
import type { AssembleOptions, AssemblerBackend } from './assembler-backend';

type GlimmerSeverity = 'error' | 'warning';

interface GlimmerDiagnostic {
  severity: GlimmerSeverity;
  message: string;
  sourceName: string;
  line?: number;
  column?: number;
  code?: string;
}

interface GlimmerArtifacts {
  asm: string;
  hex?: string;
  bin?: string;
  d8?: string;
}

interface GlimmerBuildResult {
  diagnostics: GlimmerDiagnostic[];
  artifacts?: GlimmerArtifacts;
  mappedSegments?: number;
  warnings: string[];
}

type BuildFn = (
  entryPath: string,
  options: { outputPath?: string; org?: number; stage?: 'generate' | 'check' | 'build' }
) => Promise<GlimmerBuildResult>;

type GlimmerModules = { buildGlimmerProgram: BuildFn };

async function loadGlimmerModules(): Promise<GlimmerModules> {
  const { buildGlimmerProgram } =
    (await import('@jhlagado/glimmer/build')) as unknown as GlimmerModules;
  return { buildGlimmerProgram };
}

function artifactBase(filePath: string): string {
  const extension = path.extname(filePath);
  return extension.length > 0 ? filePath.slice(0, -extension.length) : filePath;
}

function formatDiagnostic(diagnostic: GlimmerDiagnostic): string {
  const location =
    diagnostic.line !== undefined && diagnostic.column !== undefined
      ? `${diagnostic.sourceName}:${diagnostic.line}:${diagnostic.column}`
      : diagnostic.line !== undefined
        ? `${diagnostic.sourceName}:${diagnostic.line}`
        : diagnostic.sourceName;
  const code = diagnostic.code !== undefined ? `[${diagnostic.code}] ` : '';
  return `${location}: ${diagnostic.severity}: ${code}${diagnostic.message}`;
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

function toAssemblyDiagnostic(diagnostic: GlimmerDiagnostic): AssemblyDiagnostic {
  const sourceLine = readDiagnosticSourceLine(diagnostic.sourceName, diagnostic.line);
  return {
    path: diagnostic.sourceName,
    ...(diagnostic.line !== undefined ? { line: diagnostic.line } : {}),
    ...(diagnostic.column !== undefined ? { column: diagnostic.column } : {}),
    message: diagnostic.message,
    ...(sourceLine !== undefined ? { sourceLine } : {}),
  };
}

function glimmerFailure(message: string, diagnostic?: AssemblyDiagnostic): AssembleResult {
  return {
    success: false,
    error: message,
    ...(diagnostic !== undefined ? { diagnostic } : {}),
  };
}

export class GlimmerBackend implements AssemblerBackend {
  public readonly id = 'glimmer';

  public async assemble(options: AssembleOptions): Promise<AssembleResult> {
    const outDir = path.dirname(options.hexPath);
    fs.mkdirSync(outDir, { recursive: true });

    let modules: GlimmerModules;
    try {
      modules = await loadGlimmerModules();
    } catch (err) {
      const message = `glimmer library failed to load: ${err instanceof Error ? err.message : String(err)}`;
      options.onOutput?.(`${message}\n`);
      return glimmerFailure(message);
    }

    // Glimmer derives .hex/.bin/.d8.json paths from the generated asm
    // path, so placing the asm at <artifactBase>.asm makes every
    // artifact land exactly where debug80 expects it (the hex at
    // options.hexPath, the map at <artifactBase>.d8.json).
    const generatedAsmPath = `${artifactBase(options.hexPath)}.asm`;

    let result: GlimmerBuildResult;
    try {
      result = await modules.buildGlimmerProgram(options.asmPath, {
        stage: 'build',
        outputPath: generatedAsmPath,
      });
    } catch (err) {
      const message = `glimmer failed: ${err instanceof Error ? err.message : String(err)}`;
      options.onOutput?.(`${message}\n`);
      return glimmerFailure(message);
    }

    if (result.diagnostics.length > 0) {
      options.onOutput?.(`${result.diagnostics.map(formatDiagnostic).join('\n')}\n`);
    }
    for (const warning of result.warnings) {
      options.onOutput?.(`glimmer warning: ${warning}\n`);
    }

    const firstError = result.diagnostics.find((diagnostic) => diagnostic.severity === 'error');
    if (firstError !== undefined) {
      return glimmerFailure(formatDiagnostic(firstError), toAssemblyDiagnostic(firstError));
    }
    if (result.artifacts?.hex === undefined || result.artifacts.d8 === undefined) {
      return glimmerFailure(
        `glimmer succeeded but did not produce HEX/D8 output for "${options.asmPath}".`
      );
    }

    return {
      success: true,
      stdout: `${result.artifacts.hex}\n`,
    };
  }
}
