/**
 * @file Build explicit TEC-1G ROM artifacts declared by launch configuration.
 */

import * as path from 'path';
import * as fs from 'fs';
import { AssembleFailureError } from './assembler';
import { resolveAssemblerBackend, type AssemblerBackend } from './assembler-backend';
import { emitConsoleOutput, type EventSender } from '../session/adapter-ui';
import type { LaunchRequestArguments } from '../session/types';
import type { Tec1gRomArtifactConfig, Tec1gSourceRomArtifactConfig } from '../../platforms/types';

export interface Tec1gBuiltRomArtifact {
  id: string;
  role: 'monitor' | 'expansion';
  sourceFile: string;
  outputBin: string;
  outputDebugMap?: string;
  sourceRoot: string;
}

export async function buildTec1gRomArtifactsIfRequested(options: {
  baseDir: string;
  args: LaunchRequestArguments;
  sendEvent: EventSender;
  backendFactory?: (artifact: Tec1gSourceRomArtifactConfig) => AssemblerBackend;
}): Promise<Tec1gBuiltRomArtifact[]> {
  const artifacts = activeSourceBackedTec1gRomArtifacts(options.args.tec1g?.romArtifacts);
  const built: Tec1gBuiltRomArtifact[] = [];

  for (const artifact of artifacts) {
    const backend = options.backendFactory?.(artifact) ?? resolveAssemblerBackend('azm', artifact.sourceFile);
    const sourceFile = resolveWorkspacePath(options.baseDir, artifact.sourceFile);
    const outputBin = resolveWorkspacePath(options.baseDir, artifact.outputBin);
    assertAzmCompatibleOutputPaths(artifact, options.baseDir, outputBin);
    const hexPath = replaceExtension(outputBin, '.hex');
    const outputDebugMap =
      artifact.outputDebugMap !== undefined
        ? resolveWorkspacePath(options.baseDir, artifact.outputDebugMap)
        : replaceExtension(outputBin, '.d8.json');

    const assembleResult = await backend.assemble({
      asmPath: sourceFile,
      hexPath,
      sourceRoot: options.baseDir,
      ...(options.args.azm !== undefined ? { azm: options.args.azm } : {}),
      onOutput: (message) => {
        emitConsoleOutput(options.sendEvent, message, { newline: false });
      },
    });
    if (!assembleResult.success) {
      throw new AssembleFailureError({
        ...assembleResult,
        error: assembleResult.error ?? `${backend.id} failed to assemble ROM artifact ${artifact.id}`,
      });
    }

    if (backend.assembleBin === undefined) {
      throw new AssembleFailureError({
        success: false,
        error: `${backend.id} cannot emit binary ROM artifact ${artifact.id}`,
      });
    }

    const binResult = await backend.assembleBin({
      asmPath: sourceFile,
      hexPath,
      ...romArtifactBinaryRange(artifact),
      sourceRoot: options.baseDir,
      ...(options.args.azm !== undefined ? { azm: options.args.azm } : {}),
      onOutput: (message) => {
        emitConsoleOutput(options.sendEvent, message, { newline: false });
      },
    });
    if (!binResult.success) {
      throw new AssembleFailureError({
        ...binResult,
        error: binResult.error ?? `${backend.id} failed to build ROM artifact ${artifact.id}`,
      });
    }

    if (!fs.existsSync(outputBin)) {
      throw new AssembleFailureError({
        success: false,
        error: `ROM artifact ${artifact.id} did not produce binary ${outputBin}`,
      });
    }
    if (!fs.existsSync(outputDebugMap)) {
      throw new AssembleFailureError({
        success: false,
        error: `ROM artifact ${artifact.id} did not produce debug map ${outputDebugMap}`,
      });
    }

    built.push({
      id: artifact.id,
      role: artifact.role,
      sourceFile,
      outputBin,
      outputDebugMap,
      sourceRoot: path.dirname(artifact.sourceFile),
    });
  }

  return built;
}

export function applyTec1gRomArtifactsToLaunchArgs(
  args: LaunchRequestArguments,
  artifacts: Tec1gBuiltRomArtifact[]
): void {
  if (artifacts.length === 0) {
    return;
  }

  args.tec1g = { ...(args.tec1g ?? {}) };
  const generatedDebugMaps: string[] = [];
  for (const artifact of artifacts) {
    if (artifact.role === 'monitor') {
      args.tec1g.romHex = artifact.outputBin;
    } else {
      args.tec1g.expansionRomHex = artifact.outputBin;
    }

    if (artifact.outputDebugMap !== undefined) {
      generatedDebugMaps.push(artifact.outputDebugMap);
    }

    args.sourceRoots = appendUnique(args.sourceRoots ?? [], artifact.sourceRoot);
  }

  args.debugMaps = prependUniqueGroup(args.debugMaps ?? [], generatedDebugMaps);
}

export function hasActiveTec1gMonitorRomArtifact(args: LaunchRequestArguments): boolean {
  return activeSourceBackedTec1gRomArtifacts(args.tec1g?.romArtifacts).some(
    (artifact) => artifact.role === 'monitor'
  );
}

export function hasActiveTec1gRomArtifacts(args: LaunchRequestArguments): boolean {
  return activeSourceBackedTec1gRomArtifacts(args.tec1g?.romArtifacts).length > 0;
}

function activeSourceBackedTec1gRomArtifacts(
  artifacts: Tec1gRomArtifactConfig[] | undefined
): Tec1gSourceRomArtifactConfig[] {
  return (artifacts ?? []).filter(
    (artifact): artifact is Tec1gSourceRomArtifactConfig =>
      artifact.active !== false && 'sourceFile' in artifact && 'outputBin' in artifact
  );
}

function romArtifactBinaryRange(artifact: Tec1gSourceRomArtifactConfig): {
  binFrom: number;
  binTo: number;
} {
  if (artifact.role === 'monitor') {
    return { binFrom: artifact.address ?? 0xc000, binTo: (artifact.address ?? 0xc000) + (artifact.size ?? 0x4000) - 1 };
  }

  return {
    binFrom: artifact.windowAddress ?? 0x8000,
    binTo: (artifact.windowAddress ?? 0x8000) + (artifact.imageSize ?? 0x4000) - 1,
  };
}

function resolveWorkspacePath(baseDir: string, filePath: string): string {
  return path.isAbsolute(filePath) ? path.normalize(filePath) : path.resolve(baseDir, filePath);
}

function replaceExtension(filePath: string, extension: string): string {
  return path.join(
    path.dirname(filePath),
    `${path.basename(filePath, path.extname(filePath))}${extension}`
  );
}

function assertAzmCompatibleOutputPaths(
  artifact: Tec1gSourceRomArtifactConfig,
  baseDir: string,
  outputBin: string
): void {
  if (path.extname(outputBin).toLowerCase() !== '.bin') {
    throw new AssembleFailureError({
      success: false,
      error: `ROM artifact ${artifact.id} outputBin must use .bin so AZM writes the configured binary`,
    });
  }

  if (artifact.outputDebugMap !== undefined) {
    const outputDebugMap = resolveWorkspacePath(baseDir, artifact.outputDebugMap);
    const expectedDebugMap = replaceExtension(outputBin, '.d8.json');
    if (path.normalize(outputDebugMap) !== path.normalize(expectedDebugMap)) {
      throw new AssembleFailureError({
        success: false,
        error: `ROM artifact ${artifact.id} outputDebugMap must match ${expectedDebugMap}`,
      });
    }
  }
}

function prependUniqueGroup(values: string[], group: string[]): string[] {
  if (group.length === 0) {
    return values;
  }
  return [...group, ...values.filter((existing) => !group.includes(existing))];
}

function appendUnique(values: string[], value: string): string[] {
  return values.includes(value) ? values : [...values, value];
}
