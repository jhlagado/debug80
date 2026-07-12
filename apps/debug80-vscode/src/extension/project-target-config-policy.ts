/**
 * Pure config-to-target-choice policy for Debug80 project targets.
 */

import type { TargetConfigRecord } from './project-target-source-policy';
import { getTargetEntrySource } from './project-target-source-policy';

export type ConfigPolicyTargetChoice = {
  name: string;
  description?: string;
  detail?: string;
};

export type ProjectTargetConfigPolicyInput = {
  targets?: Record<string, unknown>;
  target?: string;
  defaultTarget?: string;
};

export type LoadedTargetChoices = {
  choices: ConfigPolicyTargetChoice[];
  defaultTarget?: string;
};

export type LoadVisibleTargetChoicesOptions = {
  projectRoot: string;
  config: ProjectTargetConfigPolicyInput | undefined;
  targetExists: (target: TargetConfigRecord) => boolean;
};

export function loadVisibleTargetChoices({
  config,
  targetExists,
}: LoadVisibleTargetChoicesOptions): LoadedTargetChoices {
  const targets = config?.targets ?? {};
  const choices = Object.entries(targets)
    .filter(([, target]) => isTargetConfigRecord(target) && targetExists(target))
    .map(([name, target]) => buildTargetChoice(name, target as TargetConfigRecord));

  const defaultTarget = config?.target ?? config?.defaultTarget;
  return {
    choices,
    ...(defaultTarget !== undefined ? { defaultTarget } : {}),
  };
}

export function isTargetConfigRecord(target: unknown): target is TargetConfigRecord {
  return target !== null && typeof target === 'object' && !Array.isArray(target);
}

function buildTargetChoice(name: string, target: TargetConfigRecord): ConfigPolicyTargetChoice {
  const sourcePath = getTargetEntrySource(target);
  const tags: string[] = [];
  if (target.platform !== undefined && target.platform !== '') {
    tags.push(String(target.platform));
  }
  const description =
    sourcePath !== undefined && sourcePath.length > 0
      ? [sourcePath, ...tags].join(' • ')
      : tags.length > 0
        ? tags.join(' • ')
        : undefined;

  return {
    name,
    ...(description !== undefined ? { description } : {}),
    ...(sourcePath !== undefined && sourcePath.length > 0 ? { detail: sourcePath } : {}),
  };
}
