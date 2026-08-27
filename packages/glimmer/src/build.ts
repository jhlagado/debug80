/**
 * `glimmer build`: assembly and debug-map attribution.
 *
 * AZM's `.d8.json` map attributes address ranges to generated-asm lines.
 * Glimmer wrote those lines, so it knows which came from `.glim` block
 * bodies: every block compiles under a `Glim_<Name>:` entry label and
 * its body is copied byte-for-byte verbatim (the label-anchored mapping
 * contract). This module re-attributes body segments to their `.glim`
 * source, leaving generated glue attributed to the generated `.asm` —
 * stepping lands in Glimmer source for user code and drops into readable
 * generated assembly for glue.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { compile } from '@jhlagado/azm/compile';
import { assembleResolvedAtomProject, renderAtomArtifacts } from 'atom-z80';

import type { EffectDecl, GlimmerDiagnostic, GlimmerProgram, RoutineDecl } from './model.js';
import { blockEntryLabel } from './emit.js';
import { generateAtomProjectProjection, generateAtomProjection } from './atom.js';
import { generateAzm } from './generate.js';
import { loadGlimmerProgram } from './load.js';
import { profileFor } from './profiles/index.js';

/** One body line's position: generated-asm line -> .glim file/line. */
export interface BlockLineMapping {
  /** Block the line belongs to (diagnostics only). */
  name: string;
  /** 1-based line in the generated asm. */
  asmLine: number;
  /** Map key of the .glim file the line came from. */
  glimFile: string;
  /** 1-based line in that .glim file. */
  glimLine: number;
}

export interface BlockMappingsResult {
  mappings: BlockLineMapping[];
  /** Blocks that could not be anchored (label missing or body mismatch). */
  warnings: string[];
}

/** Anything with a verbatim body anchored at a generated entry label. */
export interface MappableBlock {
  /** The entry-label line that anchors the body, without the colon. */
  label: string;
  name: string;
  body: readonly string[];
  bodyLine: number;
  file?: string;
}

/** Effects anchor at Glim_<Name>, routines at their own <Name>. */
export function mappableBlocks(
  effects: readonly EffectDecl[],
  routines: readonly RoutineDecl[] = [],
): MappableBlock[] {
  return [
    ...effects.map((effect) => ({
      label: blockEntryLabel(effect.name),
      name: effect.name,
      body: effect.body,
      bodyLine: effect.bodyLine,
      ...(effect.file !== undefined ? { file: effect.file } : {}),
    })),
    ...routines.map((routine) => ({
      label: routine.name,
      name: routine.name,
      body: routine.body,
      bodyLine: routine.bodyLine,
      ...(routine.file !== undefined ? { file: routine.file } : {}),
    })),
  ];
}

/**
 * Locate every block body line in the generated asm text — the file on
 * disk is exactly what the generator wrote (AZM 0.3 never rewrites
 * it), so line numbers agree with the `.d8.json` produced from it.
 * Bodies are matched line by line; a body line that does not match is
 * skipped with a warning rather than mapped wrongly.
 */
export function computeBlockMappings(
  asmText: string,
  blocks: readonly MappableBlock[],
  entryGlimFile: string,
  glimFileKey: (declaredFile: string | undefined) => string = (file): string =>
    file ?? entryGlimFile,
): BlockMappingsResult {
  const lines = asmText.split('\n');
  const mappings: BlockLineMapping[] = [];
  const warnings: string[] = [];

  for (const block of blocks) {
    const label = `${block.label}:`;
    const labelIndex = lines.findIndex((line) => line.trimEnd() === label);
    if (labelIndex === -1) {
      warnings.push(`block ${block.name}: label ${label} not found in generated asm.`);
      continue;
    }
    const glimFile = glimFileKey(block.file);
    let cursor = labelIndex + 1;
    let matched = true;
    const blockMappings: BlockLineMapping[] = [];
    for (let k = 0; k < block.body.length; k += 1) {
      if (lines[cursor] !== block.body[k]) {
        warnings.push(`block ${block.name}: body is not verbatim at ${label}; not mapped.`);
        matched = false;
        break;
      }
      blockMappings.push({
        name: block.name,
        asmLine: cursor + 1,
        glimFile,
        glimLine: block.bodyLine + k,
      });
      cursor += 1;
    }
    if (matched) mappings.push(...blockMappings);
  }

  return { mappings, warnings };
}

/** Fast lookup from a generated-asm line to its .glim origin. */
export function mappingByAsmLine(
  mappings: readonly BlockLineMapping[],
): Map<number, BlockLineMapping> {
  return new Map(mappings.map((mapping) => [mapping.asmLine, mapping]));
}

interface D8Segment {
  line?: number;
  [key: string]: unknown;
}

interface D8FileEntry {
  segments?: D8Segment[];
  symbols?: unknown[];
  [key: string]: unknown;
}

/** The subset of the d8-debug-map format the rewrite touches. */
export interface D8Map {
  files?: Record<string, D8FileEntry>;
  fileList?: string[];
  [key: string]: unknown;
}

/**
 * Move the generated-asm segments that fall inside block bodies onto
 * their `.glim` files. Mutates and returns the map. Glue segments and
 * symbols stay attributed to the generated asm.
 */
export function rewriteD8Map(
  map: D8Map,
  asmFileKey: string,
  mappings: readonly BlockLineMapping[],
): { moved: number } {
  const asmEntry = map.files?.[asmFileKey];
  if (asmEntry?.segments === undefined || mappings.length === 0) return { moved: 0 };

  const byLine = mappingByAsmLine(mappings);
  const kept: D8Segment[] = [];
  const movedByFile = new Map<string, D8Segment[]>();
  let moved = 0;

  for (const segment of asmEntry.segments) {
    const line = segment.line;
    const mapping = typeof line === 'number' ? byLine.get(line) : undefined;
    if (mapping === undefined) {
      kept.push(segment);
      continue;
    }
    const glimSegments = movedByFile.get(mapping.glimFile) ?? [];
    glimSegments.push({ ...segment, line: mapping.glimLine });
    movedByFile.set(mapping.glimFile, glimSegments);
    moved += 1;
  }

  if (moved === 0) return { moved };
  asmEntry.segments = kept;
  map.files ??= {};
  for (const [glimFile, segments] of movedByFile) {
    const existing = map.files[glimFile];
    if (existing === undefined) {
      map.files[glimFile] = { segments, symbols: [] };
    } else {
      existing.segments = [...(existing.segments ?? []), ...segments];
    }
    if (map.fileList !== undefined && !map.fileList.includes(glimFile)) {
      map.fileList.push(glimFile);
    }
  }
  return { moved };
}

/**
 * Diagnostic shape shared with AZM (severity, absolute sourceName,
 * line/column) so a host like Debug80 can report Glimmer and AZM
 * problems through one path.
 */
export interface BuildDiagnostic {
  severity: 'error' | 'warning';
  message: string;
  /** Absolute path of the file the diagnostic points at. */
  sourceName: string;
  line?: number;
  column?: number;
  code?: string;
}

export interface GlimmerBuildOptions {
  /** Output assembly path (default: `<entry>.main.asm` beside the entry). */
  outputPath?: string;
  /** Assembly origin (default $4000). */
  org?: number;
  /**
   * How far to take the build:
   * - 'generate' — write generated assembly only;
   * - 'check' — also run register-contract checking without assembling;
   * - 'build' (default) — also assemble `.hex`/`.bin`/`.d8.json` and
   *   rewrite the debug map to step block bodies in `.glim` source.
   */
  stage?: 'generate' | 'check' | 'build';
  /** Assembly source/backend projection (default: Atom). */
  assembler?: 'azm' | 'atom';
}

export interface GlimmerBuildArtifacts {
  asm: string;
  hex?: string;
  bin?: string;
  d8?: string;
}

export interface GlimmerBuildResult {
  diagnostics: BuildDiagnostic[];
  /** Absolute paths of the files written; absent when the build failed. */
  artifacts?: GlimmerBuildArtifacts;
  /** Debug-map segments re-attributed to `.glim` source. */
  mappedSegments?: number;
  /** Non-fatal notes (e.g. blocks the map rewrite skipped). */
  warnings: string[];
}

function hasErrors(diagnostics: readonly BuildDiagnostic[]): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === 'error');
}

function atomImportSources(
  program: GlimmerProgram,
  entryPath: string,
): { sources: Array<{ logicalIdentity: string; source: string }>; diagnostics: BuildDiagnostic[] } {
  const entryDir = path.dirname(path.resolve(entryPath));
  const sources: Array<{ logicalIdentity: string; source: string }> = [];
  const diagnostics: BuildDiagnostic[] = [];
  const seen = new Set<string>();
  for (const declaration of program.imports) {
    if (seen.has(declaration.path)) continue;
    seen.add(declaration.path);
    const physical = path.resolve(entryDir, declaration.path);
    const relative = path.relative(entryDir, physical);
    if (
      relative === '' ||
      relative === '..' ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      diagnostics.push({
        severity: 'error',
        message: `Imported module escapes the Glimmer project root: ${declaration.path}`,
        sourceName: path.resolve(entryPath),
        line: declaration.line,
        code: 'GLIM',
      });
      continue;
    }
    try {
      sources.push({
        logicalIdentity: relative.split(path.sep).join('/'),
        source: readFileSync(physical, 'utf8'),
      });
    } catch (error) {
      diagnostics.push({
        severity: 'error',
        message: `Cannot read imported module ${declaration.path}: ${error instanceof Error ? error.message : String(error)}`,
        sourceName: path.resolve(entryPath),
        line: declaration.line,
        code: 'GLIM',
      });
    }
  }
  return { sources, diagnostics };
}

function fromGlimmerDiagnostics(
  diagnostics: readonly GlimmerDiagnostic[],
  entryPath: string,
): BuildDiagnostic[] {
  const entryDir = path.dirname(entryPath);
  return diagnostics.map((diagnostic) => ({
    severity: diagnostic.severity ?? 'error',
    message: diagnostic.message,
    sourceName:
      diagnostic.file === undefined
        ? path.resolve(entryPath)
        : path.resolve(entryDir, diagnostic.file),
    ...(diagnostic.line > 0 ? { line: diagnostic.line } : {}),
    code: 'GLIM',
  }));
}

interface AzmDiagnosticLike {
  severity?: string;
  message?: string;
  sourceName?: string;
  line?: number;
  column?: number;
  code?: string;
}

function fromAzmDiagnostics(diagnostics: readonly AzmDiagnosticLike[]): BuildDiagnostic[] {
  return diagnostics.map((diagnostic) => ({
    severity: diagnostic.severity === 'warning' ? 'warning' : 'error',
    message: diagnostic.message ?? 'unknown AZM diagnostic',
    sourceName: diagnostic.sourceName ?? '',
    ...(diagnostic.line !== undefined ? { line: diagnostic.line } : {}),
    ...(diagnostic.column !== undefined ? { column: diagnostic.column } : {}),
    ...(diagnostic.code !== undefined ? { code: diagnostic.code } : {}),
  }));
}

function fromAtomError(error: unknown, asmPath: string): BuildDiagnostic {
  const value = typeof error === 'object' && error !== null ? error : {};
  const details = value as {
    message?: unknown;
    line?: unknown;
    column?: unknown;
    diagnostic?: { logicalIdentity?: unknown; line?: unknown; column?: unknown };
  };
  const identity = details.diagnostic?.logicalIdentity;
  const sourceName =
    typeof identity === 'string'
      ? path.resolve(path.dirname(asmPath), identity)
      : path.resolve(asmPath);
  const line = details.diagnostic?.line ?? details.line;
  const column = details.diagnostic?.column ?? details.column;
  return {
    severity: 'error',
    message: typeof details.message === 'string' ? details.message : String(error),
    sourceName,
    ...(typeof line === 'number' ? { line } : {}),
    ...(typeof column === 'number' ? { column } : {}),
    code: 'ATOM',
  };
}

/**
 * Point AZM diagnostics at the `.glim` source when they fall inside a
 * block or routine body — the debug-map rewrite pointed the other way.
 * Verbatim bodies make the line arithmetic exact and columns carry
 * over unchanged; generated-glue diagnostics stay on the generated asm
 * (the same transparency split as stepping).
 */
function reattributeDiagnostics(
  diagnostics: BuildDiagnostic[],
  asmText: string,
  asmPath: string,
  program: GlimmerProgram,
  entryPath: string,
): BuildDiagnostic[] {
  if (diagnostics.length === 0) return diagnostics;
  const entryDir = path.dirname(entryPath);
  const entryBase = path.basename(entryPath);
  const { mappings } = computeBlockMappings(
    asmText,
    mappableBlocks(program.effects, program.routines),
    entryBase,
    (declared) => path.resolve(entryDir, declared ?? entryBase),
  );
  if (mappings.length === 0) return diagnostics;
  const byLine = mappingByAsmLine(mappings);
  const asmResolved = path.resolve(asmPath);
  return diagnostics.map((diagnostic) => {
    if (diagnostic.line === undefined) return diagnostic;
    if (path.resolve(diagnostic.sourceName) !== asmResolved) return diagnostic;
    const mapping = byLine.get(diagnostic.line);
    if (mapping === undefined) return diagnostic;
    return {
      ...diagnostic,
      sourceName: mapping.glimFile,
      line: mapping.glimLine,
    };
  });
}

/**
 * Compile a `.glim` program end to end. Generation retains the contract-rich
 * AZM form used for register checking. The requested output projection is then
 * assembled with AZM or Atom, and its debug map is attributed back to `.glim`
 * block bodies.
 *
 * This is the API a host (the CLI, Debug80) calls — it writes the
 * artifact files but never prints; all reporting comes back as values.
 */
export async function buildGlimmerProgram(
  entryPath: string,
  options: GlimmerBuildOptions = {},
): Promise<GlimmerBuildResult> {
  const warnings: string[] = [];

  const loaded = loadGlimmerProgram(entryPath);
  const loadDiagnostics = fromGlimmerDiagnostics(loaded.diagnostics, entryPath);
  if (loaded.program === null) {
    return { diagnostics: loadDiagnostics, warnings };
  }
  const program: GlimmerProgram = loaded.program;

  const assembler = options.assembler ?? 'atom';
  const generationOptions = options.org === undefined ? {} : { org: options.org };
  const imports = assembler === 'atom' ? atomImportSources(program, entryPath) : undefined;
  const atomProjection =
    assembler === 'atom'
      ? program.imports.length === 0
        ? generateAtomProjection(program, generationOptions)
        : generateAtomProjectProjection(program, imports?.sources ?? [], generationOptions)
      : undefined;
  const generated = atomProjection ?? generateAzm(program, generationOptions);
  const frontEndDiagnostics = [
    ...loadDiagnostics,
    ...(imports?.diagnostics ?? []),
    ...fromGlimmerDiagnostics(generated.diagnostics, entryPath),
  ];
  if (hasErrors(frontEndDiagnostics)) {
    return { diagnostics: frontEndDiagnostics, warnings };
  }

  const asmPath = path.resolve(
    options.outputPath ??
      path.join(
        path.dirname(entryPath),
        `${path.basename(entryPath, path.extname(entryPath))}.main.asm`,
      ),
  );
  writeFileSync(asmPath, generated.source);
  const stage = options.stage ?? 'build';
  if (stage === 'generate') {
    return { diagnostics: frontEndDiagnostics, artifacts: { asm: asmPath }, warnings };
  }

  // Contract checking runs at the same strength in both stages: the
  // generated file's `.contracts` directive governs it, the explicit
  // 'error' mode covers files without a directive (imported user
  // libraries), and the profile's register-contract profile models the
  // platform's monitor calls (RST $10 for MON-3).
  const profile = profileFor(program);
  const contractOptions = {
    registerContracts: 'error' as const,
    ...(profile.registerContractsProfile !== undefined
      ? { registerContractsProfile: profile.registerContractsProfile }
      : {}),
    // User routines carry bare .routine declarations: their outputs are
    // whatever the body produces, so AZM's inferred output candidates
    // are accepted rather than held for review.
    ...(program.routines.length > 0
      ? {
          acceptRegisterOutputCandidates: program.routines.map(
            (routine) => `${routine.name}:AF,BC,DE,HL,IX,IY`,
          ),
        }
      : {}),
  };
  const contractSource = atomProjection?.azmSource ?? generated.source;
  const attributed = (
    azmDiagnostics: readonly AzmDiagnosticLike[],
    diagnosticPath = asmPath,
  ): BuildDiagnostic[] => [
    ...frontEndDiagnostics,
    ...reattributeDiagnostics(
      fromAzmDiagnostics(azmDiagnostics),
      contractSource,
      diagnosticPath,
      program,
      entryPath,
    ),
  ];

  const checkContracts = async (): Promise<BuildDiagnostic[]> => {
    if (assembler === 'azm') {
      const checked = await compile(asmPath, { ...contractOptions, skipAssembly: true });
      return attributed(checked.diagnostics);
    }
    const temporary = mkdtempSync(path.join(os.tmpdir(), 'glimmer-atom-contracts-'));
    const contractPath = path.join(temporary, path.basename(asmPath));
    try {
      writeFileSync(contractPath, contractSource);
      for (const imported of imports?.sources ?? []) {
        const destination = path.join(temporary, imported.logicalIdentity);
        mkdirSync(path.dirname(destination), { recursive: true });
        writeFileSync(destination, imported.source);
      }
      const checked = await compile(contractPath, { ...contractOptions, skipAssembly: true });
      return attributed(checked.diagnostics, contractPath);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  };

  if (stage === 'check') {
    const checkDiagnostics = await checkContracts();
    return {
      diagnostics: checkDiagnostics,
      ...(hasErrors(checkDiagnostics) ? {} : { artifacts: { asm: asmPath } }),
      warnings,
    };
  }

  // AZM checks contracts while assembling. Atom uses the same checked
  // contracts, then assembles its source projection separately.
  const base = asmPath.replace(/\.asm$/, '');
  const hexPath = `${base}.hex`;
  const binPath = `${base}.bin`;
  const d8Path = `${base}.d8.json`;
  if (assembler === 'atom') {
    const checkDiagnostics = await checkContracts();
    if (hasErrors(checkDiagnostics)) return { diagnostics: checkDiagnostics, warnings };
    let atomResult: unknown;
    try {
      const start = options.org ?? 0x4000;
      const encoder = new TextEncoder();
      const project = {
        parts: (atomProjection?.parts ?? []).map((part, ordinal) => {
          return {
            ordinal,
            bank: 0,
            logicalIdentity: ordinal === 0 ? path.basename(asmPath) : part.logicalIdentity,
            // Atom's native ABI reports byte offsets into an equal-length
            // original/compiler pair. Glimmer retains the physical source and
            // line origins in the projection, but executes and renders from
            // this compiler-aligned source view until the host artifact layer
            // accepts an explicit line map.
            originalBytes: encoder.encode(part.source),
            compilerBytes: encoder.encode(part.source),
          };
        }),
      };
      const assembled = await assembleResolvedAtomProject(project, {
        target: { start, capacity: 0xffff - start },
        maxInstructions: 400_000_000,
        maxCycles: 4_000_000_000,
      });
      atomResult = { project, ...(assembled as object) };
    } catch (error) {
      return {
        diagnostics: [...frontEndDiagnostics, fromAtomError(error, asmPath)],
        warnings,
      };
    }
    const rendered = renderAtomArtifacts(atomResult, {
      base: options.org ?? 0x4000,
      entryAddress: options.org ?? 0x4000,
    }) as unknown as { bin: Uint8Array; hex: string; d8: D8Map };
    const entryDir = path.dirname(entryPath);
    const outDir = path.dirname(asmPath);
    const entryBase = path.basename(entryPath);
    const originalMappings = computeBlockMappings(
      contractSource,
      mappableBlocks(program.effects, program.routines),
      entryBase,
      (declared) =>
        path.relative(outDir, path.resolve(entryDir, declared ?? entryBase)) || entryBase,
    );
    warnings.push(...originalMappings.warnings);
    const atomLinesByOrigin = new Map<number, number[]>();
    for (let index = 0; index < (atomProjection?.lineOrigins.length ?? 0); index += 1) {
      const origin = atomProjection?.lineOrigins[index];
      if (origin === undefined) continue;
      const lines = atomLinesByOrigin.get(origin) ?? [];
      lines.push(index + 1);
      atomLinesByOrigin.set(origin, lines);
    }
    const atomMappings = originalMappings.mappings.flatMap((mapping) =>
      (atomLinesByOrigin.get(mapping.asmLine) ?? []).map((asmLine) => ({ ...mapping, asmLine })),
    );
    const mappedSegments = rewriteD8Map(rendered.d8, path.basename(asmPath), atomMappings).moved;
    writeFileSync(hexPath, rendered.hex);
    writeFileSync(binPath, rendered.bin);
    writeFileSync(d8Path, `${JSON.stringify(rendered.d8, null, 2)}\n`);
    return {
      diagnostics: checkDiagnostics,
      artifacts: { asm: asmPath, hex: hexPath, bin: binPath, d8: d8Path },
      mappedSegments,
      warnings,
    };
  }
  const assembled = await compile(asmPath, {
    outputType: 'hex',
    emitHex: true,
    emitBin: true,
    emitD8m: true,
    ...contractOptions,
    d8mInputs: { hex: path.basename(hexPath), bin: path.basename(binPath) },
  });
  const diagnostics = attributed(assembled.diagnostics);
  if (hasErrors(diagnostics)) {
    return { diagnostics, warnings };
  }

  // Rewrite the map against the generated asm, then write everything.
  const asmText = generated.source;
  const entryDir = path.dirname(entryPath);
  const outDir = path.dirname(asmPath);
  const entryBase = path.basename(entryPath);
  const mappingsResult = computeBlockMappings(
    asmText,
    mappableBlocks(program.effects, program.routines),
    entryBase,
    (declared) => path.relative(outDir, path.resolve(entryDir, declared ?? entryBase)) || entryBase,
  );
  warnings.push(...mappingsResult.warnings);

  let mappedSegments = 0;
  const artifacts: GlimmerBuildArtifacts = { asm: asmPath };
  for (const artifact of assembled.artifacts) {
    if (artifact.kind === 'hex') {
      writeFileSync(hexPath, artifact.text);
      artifacts.hex = hexPath;
    } else if (artifact.kind === 'bin') {
      writeFileSync(binPath, artifact.bytes);
      artifacts.bin = binPath;
    } else if (artifact.kind === 'd8m') {
      const map = artifact.json as unknown as D8Map;
      mappedSegments = rewriteD8Map(map, path.basename(asmPath), mappingsResult.mappings).moved;
      writeFileSync(d8Path, `${JSON.stringify(map, null, 2)}\n`);
      artifacts.d8 = d8Path;
    }
  }

  return { diagnostics, artifacts, mappedSegments, warnings };
}
