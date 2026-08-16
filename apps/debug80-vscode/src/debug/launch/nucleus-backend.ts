/**
 * @fileoverview In-process standalone Nucleus compiler backend.
 *
 * The package executes the authoritative Z80 compiler and returns NOBJ, flat
 * Intel HEX and D8 artifacts in memory. Debug80 validates the D8 map before the
 * package publishes the complete artifact set as one transaction.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  createNucleusCompiler,
  formatNucleusDiagnostic,
  parseNucleusTargetProfile,
  prepareNucleusProject,
  publishNucleusBuildOutputs,
  type NucleusBuildRequest,
  type NucleusBuildResult,
  type NucleusSourcePart,
  type NucleusTarget,
} from '@jhlagado/nucleus';
import { parseD8DebugMap } from '../../mapping/d8-map';
import type { AssemblyDiagnostic, AssembleResult } from './assembler';
import type { AssembleOptions, AssemblerBackend } from './assembler-backend';

export interface NucleusCompilerApi {
  readonly build: (request: NucleusBuildRequest) => Promise<NucleusBuildResult>;
}

const defaultCompiler = (): NucleusCompilerApi => createNucleusCompiler();

function sourceLine(filePath: string, line: number): string | undefined {
  try {
    return fs.readFileSync(filePath, 'utf8').split(/\r?\n/)[line - 1];
  } catch {
    return undefined;
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

function sourceDiagnostic(
  result: Extract<NucleusBuildResult, { success: false; kind: 'source' }>,
  root: string
): AssemblyDiagnostic {
  const diagnosticPath =
    result.diagnostic.sourceName === undefined
      ? ''
      : sourcePath(root, result.diagnostic.sourceName);
  const lineText =
    diagnosticPath === '' ? undefined : sourceLine(diagnosticPath, result.diagnostic.line);
  return {
    path: diagnosticPath,
    line: result.diagnostic.line,
    column: result.diagnostic.column,
    message: `${result.message} [N${result.diagnostic.code}]`,
    ...(lineText === undefined ? {} : { sourceLine: lineText }),
  };
}

function configurationMessage(result: Exclude<NucleusBuildResult, { success: true }>): string {
  if (result.kind !== 'configuration') {
    return result.message;
  }
  return [
    result.message,
    ...result.issues.map((issue) => `  ${issue.path}: ${issue.message}`),
  ].join('\n');
}

interface LoadedNucleusBuild {
  readonly root: string;
  readonly sources: readonly NucleusSourcePart[];
  readonly targetProfilePath: string;
  readonly target?: NucleusTarget;
}

async function loadNucleusBuild(options: AssembleOptions): Promise<LoadedNucleusBuild> {
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
    const prepared = await prepareNucleusProject(projectPath, {
      ...(options.nucleus?.targetProfile === undefined
        ? {}
        : { targetProfile: options.nucleus.targetProfile }),
      requireServices: true,
    });
    return {
      root: prepared.root,
      sources: prepared.sources,
      targetProfilePath: prepared.targetProfilePath,
      target: prepared.target,
    };
  }

  const root = sourceRoot;
  const absoluteSource = sourcePath(root, path.relative(root, options.asmPath));
  return {
    root,
    sources: [
      {
        name: path.relative(root, absoluteSource).split(path.sep).join('/'),
        source: fs.readFileSync(absoluteSource),
      },
    ],
    targetProfilePath: path.resolve(root, options.nucleus?.targetProfile ?? 'nucleus-target.json'),
  };
}

export class NucleusBackend implements AssemblerBackend {
  public readonly id = 'nucleus';

  public constructor(private readonly compiler: NucleusCompilerApi = defaultCompiler()) {}

  public async assemble(options: AssembleOptions): Promise<AssembleResult> {
    let loaded: LoadedNucleusBuild;
    try {
      loaded = await loadNucleusBuild(options);
    } catch (error) {
      return {
        success: false,
        error: `Nucleus project could not be loaded: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
    if (!fs.existsSync(loaded.targetProfilePath)) {
      return {
        success: false,
        error: `Nucleus target profile not found at "${loaded.targetProfilePath}"; define real service destinations before launching`,
      };
    }

    let target = loaded.target;
    if (target === undefined) {
      try {
        target = parseNucleusTargetProfile(fs.readFileSync(loaded.targetProfilePath, 'utf8'), {
          requireServices: true,
          sourcePartCount: loaded.sources.length,
        });
      } catch (error) {
        return {
          success: false,
          error: `Nucleus target profile is invalid: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
    if ('bankCount' in target && target.bankCount > 1) {
      return {
        success: false,
        error:
          `Debug80 Nucleus launch requires a flat target; profile "${loaded.targetProfilePath}" declares bankCount ${target.bankCount}. ` +
          'Use the standalone Nucleus API or CLI for banked NOBJ and per-bank D8 output.',
      };
    }

    const result = await this.compiler.build({
      sources: loaded.sources,
      target,
      artifacts: { hex: true, d8: true },
    });
    if (!result.success) {
      if (result.kind === 'source') {
        const diagnostic = sourceDiagnostic(result, loaded.root);
        const error = formatNucleusDiagnostic(result.diagnostic);
        options.onOutput?.(`${error}\n`);
        return { success: false, error, diagnostic };
      }
      const error = configurationMessage(result);
      options.onOutput?.(`${error}\n`);
      return { success: false, error };
    }

    if (result.artifacts.hex === undefined || result.artifacts.d8 === undefined) {
      return { success: false, error: 'Nucleus compiler omitted requested HEX or D8 artifacts' };
    }
    for (const artifact of result.artifacts.d8) {
      const parsed = parseD8DebugMap(artifact.json);
      if (parsed.map === undefined) {
        return {
          success: false,
          error: `Nucleus compiler produced an invalid D8 artifact: ${parsed.error ?? 'unknown validation failure'}`,
        };
      }
    }

    const extension = path.extname(options.hexPath);
    const artifactBase =
      extension.length === 0 ? options.hexPath : options.hexPath.slice(0, -extension.length);
    const published = await publishNucleusBuildOutputs(
      {
        nobj: `${artifactBase}.nobj`,
        hex: options.hexPath,
        d8: `${artifactBase}.d8.json`,
      },
      result.artifacts
    );
    const message = `Nucleus wrote ${published.length} build artifacts\n`;
    options.onOutput?.(message);
    return { success: true, stdout: message, stderr: '' };
  }
}
