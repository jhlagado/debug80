/**
 * @fileoverview In-process Nucleus compiler backend.
 *
 * Standalone Nucleus owns project and import resolution, target validation,
 * compilation, and artifact rendering. Debug80 selects the launch inputs,
 * validates the returned D8 map, and publishes the complete launch generation
 * in one filesystem transaction.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  createNucleusCompiler,
  parseNucleusTargetProfile,
  resolveNucleusImportGraph,
  type NucleusBuildArtifacts,
  type NucleusBuildResult,
  type NucleusCompiler,
  type NucleusSourcePart,
  type NucleusTarget,
} from '@jhlagado/nucleus';
import { publishOutputFiles } from '@jhlagado/z80-tool-services';
import { parseD8DebugMap } from '../../mapping/d8-map';
import type { AssembleResult } from './assembler';
import type { AssembleOptions, AssemblerBackend } from './assembler-backend';

export type NucleusCompilerApi = Pick<NucleusCompiler, 'build'>;

interface LoadedNucleusBuild {
  readonly sources: readonly NucleusSourcePart[];
  readonly target: NucleusTarget;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function readProjectFile(projectPath: string): {
  readonly root: string;
  readonly entry: string;
  readonly target?: string;
} {
  const parsed = JSON.parse(fs.readFileSync(projectPath, 'utf8')) as unknown;
  if (!isObject(parsed)) {
    throw new Error('Nucleus project file must contain a JSON object');
  }
  const root = typeof parsed.root === 'string' && parsed.root.length > 0 ? parsed.root : '.';
  if (typeof parsed.entry !== 'string' || parsed.entry.length === 0) {
    throw new Error(
      'Nucleus project files must name one entry source; source ordering now comes from leading //% import directives'
    );
  }
  return {
    root,
    entry: parsed.entry,
    ...(typeof parsed.target === 'string' && parsed.target.length > 0
      ? { target: parsed.target }
      : {}),
  };
}

function sourcePath(root: string, name: string): string {
  const resolved = path.resolve(root, name);
  const relative = path.relative(root, resolved);
  if (
    relative === '' ||
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Nucleus source "${name}" lies outside project root "${root}"`);
  }
  return resolved;
}

async function loadNucleusBuild(options: AssembleOptions): Promise<LoadedNucleusBuild> {
  const sourceRoot = path.resolve(options.sourceRoot ?? path.dirname(options.asmPath));
  const configuredProject = options.nucleus?.project;
  const conventionalProject = path.join(sourceRoot, 'nucleus-project.json');
  const projectPath =
    configuredProject !== undefined
      ? path.resolve(sourceRoot, configuredProject)
      : fs.existsSync(conventionalProject)
        ? conventionalProject
        : undefined;

  if (projectPath !== undefined) {
    const project = readProjectFile(projectPath);
    const root = path.resolve(path.dirname(projectPath), project.root);
    const targetFile = path.resolve(
      root,
      options.nucleus?.targetProfile ?? project.target ?? 'nucleus-target.json'
    );
    if (!fs.existsSync(targetFile)) {
      throw new Error(
        `Nucleus target profile not found at "${targetFile}"; define a launchable nucleus-target/v1 profile before launching`
      );
    }
    const graph = await resolveNucleusImportGraph({ root, entry: project.entry });
    const target = parseNucleusTargetProfile(fs.readFileSync(targetFile, 'utf8'), {
      requireServices: true,
      sourcePartCount: graph.sources.length,
    });
    return { sources: graph.sources, target };
  }

  const absoluteSource = sourcePath(
    sourceRoot,
    path.relative(sourceRoot, path.resolve(options.asmPath))
  );
  const entry = path.relative(sourceRoot, absoluteSource).split(path.sep).join('/');
  const targetFile = path.resolve(
    sourceRoot,
    options.nucleus?.targetProfile ?? 'nucleus-target.json'
  );
  if (!fs.existsSync(targetFile)) {
    throw new Error(
      `Nucleus target profile not found at "${targetFile}"; define a launchable nucleus-target/v1 profile before launching`
    );
  }
  const graph = await resolveNucleusImportGraph({ root: sourceRoot, entry });
  const target = parseNucleusTargetProfile(fs.readFileSync(targetFile, 'utf8'), {
    requireServices: true,
    sourcePartCount: graph.sources.length,
  });
  return { sources: graph.sources, target };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatBuildFailure(result: Exclude<NucleusBuildResult, { success: true }>): string {
  if (result.kind === 'source') {
    const source = result.diagnostic.sourceName ?? `source part ${result.diagnostic.sourcePart}`;
    return `${source}:${result.diagnostic.line}:${result.diagnostic.column}: ${result.message} (${result.diagnostic.code})`;
  }
  if (result.kind === 'configuration') {
    const details = result.issues.map(({ path: issuePath, message }) => `${issuePath} ${message}`);
    return details.length === 0 ? result.message : `${result.message}: ${details.join('; ')}`;
  }
  return result.message;
}

function pathHasSuffix(filePath: string, suffix: string): boolean {
  return filePath.toLowerCase().endsWith(suffix);
}

function uniqueOutputPaths(paths: readonly string[]): string[] {
  const result: string[] = [];
  for (const candidate of paths) {
    if (!result.some((existing) => path.resolve(existing) === path.resolve(candidate))) {
      result.push(candidate);
    }
  }
  return result;
}

function selectDebugMapPath(outputPaths: readonly string[] | undefined, fallback: string): string {
  return outputPaths?.find((output) => pathHasSuffix(output, '.d8.json')) ?? fallback;
}

function nucleusOutputBytes(
  filePath: string,
  artifacts: NucleusBuildArtifacts,
  d8: string
): Uint8Array | string {
  if (pathHasSuffix(filePath, '.nobj')) {
    return artifacts.nobj;
  }
  if (pathHasSuffix(filePath, '.hex') && artifacts.hex !== undefined) {
    return artifacts.hex;
  }
  if (pathHasSuffix(filePath, '.bin') && artifacts.bin !== undefined) {
    return artifacts.bin;
  }
  if (pathHasSuffix(filePath, '.d8.json')) {
    return d8;
  }
  throw new Error(`Nucleus cannot publish unsupported or omitted output path "${filePath}"`);
}

export class NucleusBackend implements AssemblerBackend {
  public readonly id = 'nucleus';

  public constructor(private readonly compiler: NucleusCompilerApi = createNucleusCompiler()) {}

  public async assemble(options: AssembleOptions): Promise<AssembleResult> {
    let loaded: LoadedNucleusBuild;
    try {
      loaded = await loadNucleusBuild(options);
    } catch (error) {
      return {
        success: false,
        error: `Nucleus project could not be loaded: ${formatError(error)}`,
      };
    }

    let result: NucleusBuildResult;
    try {
      result = await this.compiler.build({
        sources: loaded.sources,
        target: loaded.target,
        artifacts: { bin: true, hex: true, d8: true },
      });
    } catch (error) {
      const message = `Nucleus build failed: ${formatError(error)}`;
      options.onOutput?.(`${message}\n`);
      return { success: false, error: message };
    }
    if (!result.success) {
      const message = `Nucleus build failed: ${formatBuildFailure(result)}`;
      options.onOutput?.(`${message}\n`);
      return { success: false, error: message };
    }

    const artifacts = result.artifacts;
    const d8Artifact = artifacts.d8?.[0];
    if (artifacts.d8?.length !== 1 || d8Artifact === undefined) {
      return {
        success: false,
        error: 'Nucleus compiler did not produce exactly one flat-target D8 artifact',
      };
    }
    const d8 = d8Artifact.json;
    const parsedD8 = parseD8DebugMap(d8);
    if (parsedD8.map === undefined) {
      return {
        success: false,
        error: `Nucleus compiler produced an invalid D8 artifact: ${parsedD8.error ?? 'unknown validation failure'}`,
      };
    }

    const extension = path.extname(options.hexPath);
    const artifactBase =
      extension.length === 0 ? options.hexPath : options.hexPath.slice(0, -extension.length);
    const debugMapPath = selectDebugMapPath(options.outputPaths, `${artifactBase}.d8.json`);
    const outputPaths =
      options.outputPaths === undefined
        ? [`${artifactBase}.nobj`, options.hexPath, debugMapPath]
        : uniqueOutputPaths([...options.outputPaths, options.hexPath, debugMapPath]);
    const published = await publishOutputFiles(
      outputPaths.map((outputPath) => ({
        path: outputPath,
        bytes: nucleusOutputBytes(outputPath, artifacts, d8),
      })),
      { tagPrefix: 'nucleus' }
    );
    const message = `Nucleus wrote ${published.length} build artifacts\n`;
    options.onOutput?.(message);
    return { success: true, stdout: message, stderr: '' };
  }
}
