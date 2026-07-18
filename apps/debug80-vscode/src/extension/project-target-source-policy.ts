/**
 * Pure source-discovery policy for Debug80 project targets.
 */

import * as path from 'path';

export type TargetConfigRecord = Record<string, unknown>;

export type SourcePolicyTargetChoice = {
  name: string;
  description?: string;
  detail?: string;
};

export type SourcePolicyDiscoverableTargetChoice = SourcePolicyTargetChoice & {
  discovered?: true;
  sourceFile?: string;
};

export function normalizeProjectRelativePath(p: string): string {
  return p.replace(/\\/g, '/').trim();
}

/** Keys match target entry source paths (relative to project root, forward slashes). */
export function entrySourceKey(projectRoot: string, src: string): string {
  const norm = normalizeProjectRelativePath(src);
  if (path.isAbsolute(src)) {
    return normalizeProjectRelativePath(path.relative(projectRoot, src));
  }
  return norm;
}

export function getTargetEntrySource(target: TargetConfigRecord): string | undefined {
  const sourcePath = target.sourceFile ?? target.asm ?? target.source;
  return typeof sourcePath === 'string' ? sourcePath : undefined;
}

export function targetNameFromSourcePath(sourceFile: string): string {
  const extension = path.extname(sourceFile);
  const withoutExtension = path.basename(sourceFile, extension);
  return withoutExtension.toLowerCase().endsWith('.main')
    ? withoutExtension.slice(0, -'.main'.length)
    : withoutExtension;
}

export function buildCoveredEntrySourceKeys(
  projectRoot: string,
  targets: Record<string, unknown>,
  targetExists: (target: TargetConfigRecord) => boolean
): Set<string> {
  const coveredSources = new Set<string>();
  for (const target of Object.values(targets)) {
    if (target === null || typeof target !== 'object' || Array.isArray(target)) {
      continue;
    }
    const t = target as TargetConfigRecord;
    if (!targetExists(t)) {
      continue;
    }
    const src = getTargetEntrySource(t);
    if (src !== undefined) {
      coveredSources.add(entrySourceKey(projectRoot, src));
    }
  }
  return coveredSources;
}

export function buildTargetsPerEntrySourcePath(
  projectRoot: string,
  targets: Record<string, unknown>,
  isEntrySourcePath: (sourcePath: string) => boolean
): Map<string, string[]> {
  const targetsPerSourcePath = new Map<string, string[]>();
  for (const [name, target] of Object.entries(targets)) {
    if (target === null || typeof target !== 'object' || Array.isArray(target)) {
      continue;
    }
    const src = getTargetEntrySource(target as TargetConfigRecord);
    if (src === undefined || !isEntrySourcePath(src)) {
      continue;
    }
    const key = entrySourceKey(projectRoot, src);
    const list = targetsPerSourcePath.get(key) ?? [];
    list.push(name);
    targetsPerSourcePath.set(key, list);
  }
  return targetsPerSourcePath;
}

export type WithDiscoverableTargetChoicesOptions = {
  choices: readonly SourcePolicyTargetChoice[];
  projectRoot: string;
  coveredSources: ReadonlySet<string>;
  sourceFiles: readonly string[];
};

export function withDiscoverableTargetChoices({
  choices,
  projectRoot,
  coveredSources,
  sourceFiles,
}: WithDiscoverableTargetChoicesOptions): SourcePolicyDiscoverableTargetChoice[] {
  const result: SourcePolicyDiscoverableTargetChoice[] = choices.map((choice) => ({ ...choice }));
  const existingNames = new Set(result.map((choice) => choice.name));

  for (const sourceFile of sourceFiles) {
    if (coveredSources.has(entrySourceKey(projectRoot, sourceFile))) {
      continue;
    }

    const baseName = targetNameFromSourcePath(sourceFile);
    let candidateName = baseName;
    let counter = 2;
    while (existingNames.has(candidateName)) {
      candidateName = `${baseName}-${counter}`;
      counter += 1;
    }
    existingNames.add(candidateName);

    result.push({
      name: candidateName,
      description: `${sourceFile} • new`,
      detail: sourceFile,
      discovered: true,
      sourceFile,
    });
  }

  return result;
}
