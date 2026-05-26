import * as fs from 'fs';
import * as path from 'path';

import { findProjectConfigPath, readProjectConfig } from '../project-config';

export type CoolTermHexArtifactResult =
  | { kind: 'found'; path: string }
  | { kind: 'missing'; path: string }
  | { kind: 'unresolved'; reason: string };

export function resolveCoolTermHexArtifact(
  projectRoot: string,
  targetName: string | undefined
): CoolTermHexArtifactResult {
  const configPath = findProjectConfigPath({
    name: path.basename(projectRoot),
    index: 0,
    uri: { fsPath: projectRoot } as never,
  });
  if (configPath === undefined) {
    return { kind: 'unresolved', reason: 'No debug80.json project config was found.' };
  }

  const config = readProjectConfig(configPath);
  if (config === undefined) {
    return { kind: 'unresolved', reason: 'The debug80.json project config could not be read.' };
  }

  const selectedTargetName = targetName ?? config.target ?? config.defaultTarget;
  const target =
    selectedTargetName !== undefined ? config.targets?.[selectedTargetName] : undefined;
  if (selectedTargetName !== undefined && target === undefined) {
    return { kind: 'unresolved', reason: `Target "${selectedTargetName}" was not found.` };
  }

  const explicitHex = target?.hex ?? config.hex;
  const resolved = explicitHex !== undefined && explicitHex.trim() !== ''
    ? resolveProjectPath(projectRoot, explicitHex)
    : inferHexPath(projectRoot, compactHexInferenceOptions({
        outputDir: target?.outputDir ?? config.outputDir,
        artifactBase: target?.artifactBase ?? config.artifactBase,
        sourcePath:
          target?.sourceFile ??
          target?.asm ??
          target?.source ??
          config.sourceFile ??
          config.asm ??
          config.source,
      }));

  if (resolved === undefined) {
    return {
      kind: 'unresolved',
      reason: 'No HEX path could be inferred for the selected target.',
    };
  }

  return fs.existsSync(resolved) ? { kind: 'found', path: resolved } : { kind: 'missing', path: resolved };
}

function inferHexPath(
  projectRoot: string,
  options: { outputDir?: string; artifactBase?: string; sourcePath?: string }
): string | undefined {
  const base =
    options.artifactBase ??
    (options.sourcePath !== undefined ? path.basename(options.sourcePath, path.extname(options.sourcePath)) : undefined);
  if (base === undefined || base.trim() === '') {
    return undefined;
  }
  const outputDir =
    options.outputDir !== undefined && options.outputDir.trim() !== ''
      ? resolveProjectPath(projectRoot, options.outputDir)
      : projectRoot;
  return path.join(outputDir, `${base}.hex`);
}

function compactHexInferenceOptions(options: {
  outputDir: string | undefined;
  artifactBase: string | undefined;
  sourcePath: string | undefined;
}): { outputDir?: string; artifactBase?: string; sourcePath?: string } {
  return {
    ...(options.outputDir !== undefined ? { outputDir: options.outputDir } : {}),
    ...(options.artifactBase !== undefined ? { artifactBase: options.artifactBase } : {}),
    ...(options.sourcePath !== undefined ? { sourcePath: options.sourcePath } : {}),
  };
}

function resolveProjectPath(projectRoot: string, value: string): string {
  return path.isAbsolute(value) ? value : path.join(projectRoot, value);
}
