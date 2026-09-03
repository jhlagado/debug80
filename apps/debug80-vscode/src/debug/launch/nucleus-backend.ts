/**
 * @fileoverview In-process Nucleus compiler backend.
 *
 * Debug80 runs the Nucleus resident compiler through the package's prepared
 * source publication API. Nucleus owns source resolution, Atom-selected proof
 * assembly, NOBJ publication, flat binary materialization, Intel HEX rendering
 * and D8 rendering. Debug80 validates the D8 map before publishing the launch
 * artifacts as one filesystem transaction.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  NucleusPreparedSourceArtifactBuild,
  NucleusPreparedSourceTargetPublicationOptions,
} from '@jhlagado/nucleus';
import { publishOutputFiles } from '@jhlagado/z80-tool-services';
import { parseD8DebugMap } from '../../mapping/d8-map';
import type { AssembleResult } from './assembler';
import type { AssembleOptions, AssemblerBackend } from './assembler-backend';

export interface NucleusCompilerApi {
  readonly buildPreparedSourceArtifacts: (
    options: NucleusPreparedSourceTargetPublicationOptions
  ) => Promise<NucleusPreparedSourceArtifactBuild>;
}

const defaultCompiler = (): NucleusCompilerApi => ({
  async buildPreparedSourceArtifacts(options): Promise<NucleusPreparedSourceArtifactBuild> {
    const { buildNucleusPreparedSourceArtifacts } = await import('@jhlagado/nucleus');
    return buildNucleusPreparedSourceArtifacts(options);
  },
});

const PACKAGED_NUCLEUS_COMPILER_MANIFEST = path.join(
  'resources',
  'nucleus',
  'proofs',
  'flat-target-z80-slice-proof.json'
);

function packagedNucleusCompilerManifest(): string | undefined {
  let current = path.dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const candidate = path.join(current, PACKAGED_NUCLEUS_COMPILER_MANIFEST);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
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

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

interface LoadedNucleusBuild {
  readonly root: string;
  readonly entry: string;
  readonly targetFile: string;
}

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
  if (typeof parsed.entry === 'string' && parsed.entry.length > 0) {
    return {
      root,
      entry: parsed.entry,
      ...(typeof parsed.target === 'string' && parsed.target.length > 0
        ? { target: parsed.target }
        : {}),
    };
  }
  if (
    Array.isArray(parsed.sources) &&
    parsed.sources.length === 1 &&
    typeof parsed.sources[0] === 'string'
  ) {
    return {
      root,
      entry: parsed.sources[0],
      ...(typeof parsed.target === 'string' && parsed.target.length > 0
        ? { target: parsed.target }
        : {}),
    };
  }
  throw new Error(
    'Nucleus project files must name one entry source; source ordering now comes from leading //% import directives'
  );
}

function loadNucleusBuild(options: AssembleOptions): LoadedNucleusBuild {
  const sourceRoot = options.sourceRoot ?? path.dirname(options.asmPath);
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
    const target = options.nucleus?.targetProfile ?? project.target ?? 'nucleus-target.json';
    return {
      root,
      entry: project.entry,
      targetFile: path.resolve(root, target),
    };
  }

  const root = sourceRoot;
  const absoluteSource = sourcePath(root, path.relative(root, options.asmPath));
  return {
    root,
    entry: path.relative(root, absoluteSource).split(path.sep).join('/'),
    targetFile: path.resolve(root, options.nucleus?.targetProfile ?? 'nucleus-target.json'),
  };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
  artifacts: NucleusPreparedSourceArtifactBuild['artifacts']
): Uint8Array | string {
  if (pathHasSuffix(filePath, '.nobj')) {
    return artifacts.nobj;
  }
  if (pathHasSuffix(filePath, '.hex')) {
    return artifacts.hex;
  }
  if (pathHasSuffix(filePath, '.bin')) {
    return artifacts.bin;
  }
  if (pathHasSuffix(filePath, '.d8.json')) {
    return artifacts.d8;
  }
  throw new Error(`Nucleus cannot publish unsupported Debug80 output path "${filePath}"`);
}

export class NucleusBackend implements AssemblerBackend {
  public readonly id = 'nucleus';

  public constructor(private readonly compiler: NucleusCompilerApi = defaultCompiler()) {}

  public async assemble(options: AssembleOptions): Promise<AssembleResult> {
    let loaded: LoadedNucleusBuild;
    try {
      loaded = loadNucleusBuild(options);
    } catch (error) {
      return {
        success: false,
        error: `Nucleus project could not be loaded: ${formatError(error)}`,
      };
    }
    if (!fs.existsSync(loaded.targetFile)) {
      return {
        success: false,
        error: `Nucleus target descriptor not found at "${loaded.targetFile}"; define a launchable target publication descriptor before launching`,
      };
    }

    let build: NucleusPreparedSourceArtifactBuild;
    try {
      const compilerManifest = packagedNucleusCompilerManifest();
      build = await this.compiler.buildPreparedSourceArtifacts({
        root: loaded.root,
        entry: loaded.entry,
        targetFile: loaded.targetFile,
        ...(compilerManifest === undefined ? {} : { compilerManifest }),
      });
    } catch (error) {
      const message = `Nucleus build failed: ${formatError(error)}`;
      options.onOutput?.(`${message}\n`);
      return { success: false, error: message };
    }

    const parsedD8 = parseD8DebugMap(build.artifacts.d8);
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
        bytes: nucleusOutputBytes(outputPath, build.artifacts),
      })),
      { tagPrefix: 'nucleus' }
    );
    const message = `Nucleus wrote ${published.length} build artifacts\n`;
    options.onOutput?.(message);
    return { success: true, stdout: message, stderr: '' };
  }
}
