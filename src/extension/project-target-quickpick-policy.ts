/**
 * Pure QuickPick row construction policy for Debug80 project targets.
 */

import { entrySourceKey } from './project-target-source-policy';

export type QuickPickPolicyTargetChoice = {
  name: string;
  description?: string;
  detail?: string;
};

export type TargetPickRow = {
  label: string;
  description?: string;
  detail?: string;
  targetName: string;
  applyEntrySource?: string;
};

export type SeparatorPickRow = {
  kind: number;
  label: string;
};

export type TargetQuickPickRow = TargetPickRow | SeparatorPickRow;

export type BuildTargetChoicePickRowsOptions = {
  choices: readonly QuickPickPolicyTargetChoice[];
  storedTarget?: string | undefined;
  defaultTarget?: string | undefined;
};

export function buildTargetChoicePickRows({
  choices,
  storedTarget,
  defaultTarget,
}: BuildTargetChoicePickRowsOptions): TargetPickRow[] {
  return choices.map((choice) => {
    const status =
      choice.name === storedTarget
        ? 'current'
        : choice.name === defaultTarget
          ? 'default'
          : undefined;
    const descriptionParts = [choice.description, status].filter(
      (value): value is string => value !== undefined && value.length > 0
    );
    return {
      label: choice.name,
      ...(descriptionParts.length > 0 ? { description: descriptionParts.join(' • ') } : {}),
      ...(choice.detail !== undefined ? { detail: choice.detail } : {}),
      targetName: choice.name,
    };
  });
}

export type BuildEntrySourcePickRowsOptions = {
  paths: readonly string[];
  separatorKind: number;
  separatorLabel: string;
  detail: 'AZM';
  projectRoot: string;
  targetsPerPath: ReadonlyMap<string, readonly string[]>;
  bindTarget?: string | undefined;
};

export function buildEntrySourcePickRows({
  paths,
  separatorKind,
  separatorLabel,
  detail,
  projectRoot,
  targetsPerPath,
  bindTarget,
}: BuildEntrySourcePickRowsOptions): TargetQuickPickRow[] {
  if (paths.length === 0) {
    return [];
  }

  const rows: TargetQuickPickRow[] = [
    {
      kind: separatorKind,
      label: separatorLabel,
    },
  ];

  for (const filePath of paths) {
    const key = entrySourceKey(projectRoot, filePath);
    const boundTargets = targetsPerPath.get(key) ?? [];
    if (boundTargets.length > 0) {
      const primary = boundTargets[0];
      if (primary === undefined) {
        continue;
      }
      rows.push({
        label: filePath,
        description:
          boundTargets.length > 1 ? `Targets: ${boundTargets.join(', ')}` : `Target: ${primary}`,
        detail,
        targetName: primary,
      });
      continue;
    }

    if (bindTarget === undefined) {
      continue;
    }

    rows.push({
      label: filePath,
      description: `Set as entry for target "${bindTarget}"`,
      detail,
      targetName: bindTarget,
      applyEntrySource: filePath,
    });
  }

  return rows;
}
