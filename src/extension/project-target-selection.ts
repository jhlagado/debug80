/**
 * @file Project target selection and persistence helpers.
 */

import * as path from 'path';
import * as vscode from 'vscode';
import { listProjectSourceFiles, readProjectConfig, updateProjectTargetSource } from './project-config';

const TARGET_KEY_PREFIX = 'debug80.selectedTarget:';

type ResolveTargetOptions = {
  prompt?: boolean;
  forcePrompt?: boolean;
  placeHolder?: string;
};

type TargetChoice = {
  name: string;
  description?: string;
  detail?: string;
};

type TargetQuickPickItem = vscode.QuickPickItem & {
  targetName: string;
  /** When set, selecting this row applies this path as sourceFile/asm for `targetName`. */
  applyEntrySource?: string;
};

function isTargetPickRow(item: vscode.QuickPickItem): item is TargetQuickPickItem {
  const row = item as TargetQuickPickItem;
  return typeof row.targetName === 'string' && row.targetName.length > 0;
}

type LoadedTargetChoices = {
  choices: TargetChoice[];
  defaultTarget?: string;
};

export type ProjectTargetChoice = TargetChoice;

export function getStoredTargetName(
  workspaceState: vscode.Memento,
  projectConfigPath: string
): string | undefined {
  return workspaceState.get<string>(targetKeyFor(projectConfigPath));
}

export function resolvePreferredTargetName(
  workspaceState: vscode.Memento,
  projectConfigPath: string
): string | undefined {
  const { choices, defaultTarget } = loadTargetChoices(projectConfigPath);
  if (choices.length === 0) {
    return undefined;
  }

  const stored = getStoredTargetName(workspaceState, projectConfigPath);
  if (stored !== undefined && choices.some((choice) => choice.name === stored)) {
    return stored;
  }

  if (defaultTarget !== undefined && choices.some((choice) => choice.name === defaultTarget)) {
    return defaultTarget;
  }

  if (choices.length === 1) {
    return choices[0]?.name;
  }

  return undefined;
}

export function listProjectTargetChoices(projectConfigPath: string): ProjectTargetChoice[] {
  return loadTargetChoices(projectConfigPath).choices;
}

function appendEntrySourceSection(
  items: Array<vscode.QuickPickItem | TargetQuickPickItem>,
  paths: string[],
  separatorLabel: string,
  detail: 'ZAX' | 'ASM',
  projectRoot: string,
  targetsPerPath: Map<string, string[]>,
  bindTarget: string | undefined
): void {
  if (paths.length === 0) {
    return;
  }
  items.push({
    kind: vscode.QuickPickItemKind.Separator,
    label: separatorLabel,
  });
  for (const filePath of paths) {
    const key = entrySourceKey(projectRoot, filePath);
    const boundTargets = targetsPerPath.get(key) ?? [];
    if (boundTargets.length > 0) {
      const primary = boundTargets[0];
      if (primary === undefined) {
        continue;
      }
      const row: TargetQuickPickItem = {
        label: filePath,
        description:
          boundTargets.length > 1 ? `Targets: ${boundTargets.join(', ')}` : `Target: ${primary}`,
        detail,
        targetName: primary,
      };
      items.push(row);
      continue;
    }
    if (bindTarget === undefined) {
      continue;
    }
    const row: TargetQuickPickItem = {
      label: filePath,
      description: `Set as entry for target "${bindTarget}"`,
      detail,
      targetName: bindTarget,
      applyEntrySource: filePath,
    };
    items.push(row);
  }
}

export class ProjectTargetSelectionController {
  constructor(private readonly context: vscode.ExtensionContext) {}

  rememberTarget(projectConfigPath: string, targetName: string): void {
    void this.context.workspaceState.update(targetKeyFor(projectConfigPath), targetName);
  }

  async resolveTarget(
    projectConfigPath: string,
    options: ResolveTargetOptions = {}
  ): Promise<string | null | undefined> {
    const { choices, defaultTarget } = loadTargetChoices(projectConfigPath);
    if (choices.length === 0) {
      return undefined;
    }

    const stored = getStoredTargetName(this.context.workspaceState, projectConfigPath);
    const forcePrompt = options.forcePrompt === true;
    const hasStored = stored !== undefined && choices.some((choice) => choice.name === stored);
    const hasDefault =
      defaultTarget !== undefined && choices.some((choice) => choice.name === defaultTarget);

    if (!forcePrompt && hasStored && stored !== undefined) {
      this.rememberTarget(projectConfigPath, stored);
      return stored;
    }

    if (!forcePrompt && hasDefault && defaultTarget !== undefined) {
      this.rememberTarget(projectConfigPath, defaultTarget);
      return defaultTarget;
    }

    if (choices.length === 1) {
      const only = choices[0]?.name;
      if (only !== undefined) {
        this.rememberTarget(projectConfigPath, only);
      }
      return only;
    }

    if (options.prompt !== true) {
      return undefined;
    }

    const items: Array<vscode.QuickPickItem | TargetQuickPickItem> = choices.map((choice) => {
      const status =
        choice.name === stored
          ? 'current'
          : choice.name === defaultTarget
            ? 'default'
            : undefined;
      const descriptionParts = [choice.description, status].filter(
        (value): value is string => value !== undefined && value.length > 0
      );
      const row: TargetQuickPickItem = {
        label: choice.name,
        ...(descriptionParts.length > 0
          ? { description: descriptionParts.join(' • ') }
          : {}),
        ...(choice.detail !== undefined ? { detail: choice.detail } : {}),
        targetName: choice.name,
      };
      return row;
    });

    const bindTarget = defaultTarget ?? stored ?? choices[0]?.name;
    let zaxPaths: string[] = [];
    let asmPaths: string[] = [];
    const targetsPerZaxPath = new Map<string, string[]>();
    const targetsPerAsmPath = new Map<string, string[]>();
    const config = readProjectConfig(projectConfigPath);
    const projectRoot = projectRootFromProjectConfigPath(projectConfigPath);
    for (const [name, t] of Object.entries(config?.targets ?? {})) {
      const src = t.sourceFile ?? t.asm ?? t.source;
      if (typeof src !== 'string') {
        continue;
      }
      const lower = src.toLowerCase();
      const key = entrySourceKey(projectRoot, src);
      if (lower.endsWith('.zax')) {
        const list = targetsPerZaxPath.get(key) ?? [];
        list.push(name);
        targetsPerZaxPath.set(key, list);
      } else if (lower.endsWith('.asm')) {
        const list = targetsPerAsmPath.get(key) ?? [];
        list.push(name);
        targetsPerAsmPath.set(key, list);
      }
    }

    try {
      const all = listProjectSourceFiles(projectRoot);
      zaxPaths = all.filter((p) => p.toLowerCase().endsWith('.zax'));
      asmPaths = all.filter((p) => p.toLowerCase().endsWith('.asm'));
    } catch {
      zaxPaths = [];
      asmPaths = [];
    }

    appendEntrySourceSection(items, zaxPaths, 'ZAX sources', 'ZAX', projectRoot, targetsPerZaxPath, bindTarget);
    appendEntrySourceSection(items, asmPaths, 'ASM sources', 'ASM', projectRoot, targetsPerAsmPath, bindTarget);

    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: options.placeHolder ?? 'Select the Debug80 target',
      matchOnDescription: true,
      matchOnDetail: true,
    });
    if (picked === undefined) {
      return null;
    }
    if (!isTargetPickRow(picked)) {
      return null;
    }

    if (picked.applyEntrySource !== undefined) {
      const ok = updateProjectTargetSource(projectConfigPath, picked.targetName, picked.applyEntrySource);
      if (!ok) {
        void vscode.window.showErrorMessage('Debug80: Failed to update the project program file.');
        return null;
      }
      this.rememberTarget(projectConfigPath, picked.targetName);
      return picked.targetName;
    }

    this.rememberTarget(projectConfigPath, picked.targetName);
    return picked.targetName;
  }

}

function loadTargetChoices(projectConfigPath: string): LoadedTargetChoices {
  const config = readProjectConfig(projectConfigPath);
  const targets = config?.targets ?? {};
  const entries = Object.entries(targets);
  const choices = entries.map(([name, target]) => {
    const sourcePath = target.sourceFile ?? target.asm ?? target.source;
    const isZax =
      target.assembler === 'zax' ||
      (typeof sourcePath === 'string' && sourcePath.toLowerCase().endsWith('.zax'));
    const tags: string[] = [];
    if (isZax) {
      tags.push('ZAX');
    } else if (
      target.assembler !== undefined &&
      target.assembler !== '' &&
      target.assembler !== 'asm80'
    ) {
      tags.push(target.assembler);
    }
    if (target.platform !== undefined && target.platform !== '') {
      tags.push(String(target.platform));
    }
    const description =
      typeof sourcePath === 'string' && sourcePath.length > 0
        ? [sourcePath, ...tags].join(' • ')
        : tags.length > 0
          ? tags.join(' • ')
          : undefined;

    return {
      name,
      ...(description !== undefined ? { description } : {}),
      ...(typeof sourcePath === 'string' && sourcePath.length > 0 ? { detail: sourcePath } : {}),
    };
  });

  const defaultTarget = config?.target ?? config?.defaultTarget;
  return {
    choices,
    ...(defaultTarget !== undefined ? { defaultTarget } : {}),
  };
}

/** Workspace root for a config at `.vscode/debug80.json` or `debug80.json` next to sources. */
function projectRootFromProjectConfigPath(projectConfigPath: string): string {
  const normalized = projectConfigPath.replace(/\\/g, '/');
  if (normalized.endsWith('.vscode/debug80.json')) {
    return path.dirname(path.dirname(projectConfigPath));
  }
  return path.dirname(projectConfigPath);
}

function targetKeyFor(projectConfigPath: string): string {
  return `${TARGET_KEY_PREFIX}${projectConfigPath}`;
}

function normalizeProjectRelativePath(p: string): string {
  return p.replace(/\\/g, '/').trim();
}

/** Keys match {@link listProjectSourceFiles} paths (relative to project root, forward slashes). */
function entrySourceKey(projectRoot: string, src: string): string {
  const norm = normalizeProjectRelativePath(src);
  if (path.isAbsolute(src)) {
    return normalizeProjectRelativePath(path.relative(projectRoot, src));
  }
  return norm;
}
