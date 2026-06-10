/**
 * @file Project target selection and persistence helpers.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { readProjectConfig, updateProjectTargetSource } from './project-config';
import {
  loadVisibleTargetChoices,
  type LoadedTargetChoices,
} from './project-target-config-policy';
import {
  buildEntrySourcePickRows,
  buildTargetChoicePickRows,
  type TargetPickRow,
  type TargetQuickPickRow,
} from './project-target-quickpick-policy';
import { resolveTargetSelectionDecision, targetSelectionKeyFor } from './project-target-policy';
import {
  buildCoveredEntrySourceKeys,
  buildTargetsPerEntrySourcePath,
  normalizeProjectRelativePath,
  withDiscoverableTargetChoices,
} from './project-target-source-policy';
import { isTargetEntrySourcePath, listTargetEntrySourceFiles } from './target-discovery';

type SourceFileCache = { files: string[]; cachedAt: number };
const sourceFileCache = new Map<string, SourceFileCache>();
const SOURCE_FILE_CACHE_TTL_MS = 2000;

function getCachedSourceFiles(projectRoot: string): string[] {
  const cached = sourceFileCache.get(projectRoot);
  if (cached !== undefined && Date.now() - cached.cachedAt < SOURCE_FILE_CACHE_TTL_MS) {
    return cached.files;
  }
  const files = listTargetEntrySourceFiles(projectRoot);
  sourceFileCache.set(projectRoot, { files, cachedAt: Date.now() });
  return files;
}

type ResolveTargetOptions = {
  prompt?: boolean;
  forcePrompt?: boolean;
  placeHolder?: string;
};

/** Public shape of a target choice — used for display in the webview. */
export type ProjectTargetChoice = {
  name: string;
  description?: string;
  detail?: string;
};

/**
 * Extends {@link ProjectTargetChoice} with the extra state needed to add an
 * auto-discovered source file as a new target.  Returned by
 * {@link listProjectTargetChoices} so that `commands.ts` can act on newly
 * discovered files without a cast, while the webview payload (which declares
 * `ProjectTargetChoice[]`) still accepts the result structurally.
 */
export type DiscoverableTargetChoice = ProjectTargetChoice & {
  /** True for source files found on disk that are not yet configured as a target. */
  discovered?: true;
  /** The workspace-relative source file path for discovered targets. */
  sourceFile?: string;
};

/** Alias kept for internal use. */
type TargetChoice = DiscoverableTargetChoice;

type TargetQuickPickItem = vscode.QuickPickItem & TargetPickRow;

function isTargetPickRow(item: vscode.QuickPickItem): item is TargetQuickPickItem {
  const row = item as TargetQuickPickItem;
  return typeof row.targetName === 'string' && row.targetName.length > 0;
}

function getStoredTargetName(
  workspaceState: vscode.Memento,
  projectConfigPath: string
): string | undefined {
  return workspaceState.get<string>(targetSelectionKeyFor(projectConfigPath));
}

export function resolvePreferredTargetName(
  workspaceState: vscode.Memento,
  projectConfigPath: string
): string | undefined {
  const { choices, defaultTarget } = loadTargetChoices(projectConfigPath);
  if (choices.length === 0) {
    return undefined;
  }

  const decision = resolveTargetSelectionDecision({
    choices,
    defaultTarget,
    storedTarget: getStoredTargetName(workspaceState, projectConfigPath),
  });
  return decision.kind === 'use' ? decision.targetName : undefined;
}

/**
 * Resolves the active target name for config updates when workspace memento may be absent
 * (e.g. tests): prefers stored/default selection, otherwise a single-target fallback.
 */
export function resolveTargetNameForConfig(
  workspaceState: vscode.Memento | undefined,
  projectConfigPath: string
): string | undefined {
  if (workspaceState !== undefined) {
    return resolvePreferredTargetName(workspaceState, projectConfigPath);
  }
  const { choices, defaultTarget } = loadTargetChoices(projectConfigPath);
  if (choices.length === 0) {
    return undefined;
  }
  const decision = resolveTargetSelectionDecision({
    choices,
    defaultTarget,
  });
  return decision.kind === 'use' ? decision.targetName : undefined;
}

export function listProjectTargetChoices(projectConfigPath: string): DiscoverableTargetChoice[] {
  const { choices } = loadTargetChoices(projectConfigPath);

  const projectRoot = projectRootFromProjectConfigPath(projectConfigPath);
  const config = readProjectConfig(projectConfigPath);
  const coveredSources = buildCoveredEntrySourceKeys(projectRoot, config?.targets ?? {}, (target) =>
    targetProgramFileExists(projectRoot, target)
  );

  let allSourceFiles: string[] = [];
  try {
    allSourceFiles = getCachedSourceFiles(projectRoot);
  } catch {
    // filesystem errors — skip discovery silently
  }

  return withDiscoverableTargetChoices({
    choices,
    projectRoot,
    coveredSources,
    sourceFiles: allSourceFiles,
  });
}

export class ProjectTargetSelectionController {
  constructor(private readonly context: vscode.ExtensionContext) {}

  rememberTarget(projectConfigPath: string, targetName: string): void {
    void this.context.workspaceState.update(targetSelectionKeyFor(projectConfigPath), targetName);
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
    const decision = resolveTargetSelectionDecision({
      choices,
      defaultTarget,
      storedTarget: stored,
      forcePrompt,
    });
    if (decision.kind === 'use') {
      this.rememberTarget(projectConfigPath, decision.targetName);
      return decision.targetName;
    }

    if (decision.kind === 'none' || options.prompt !== true) {
      return undefined;
    }

    const items = buildTargetQuickPickItems(projectConfigPath, choices, defaultTarget, stored);

    const picked = await vscode.window.showQuickPick(
      items as Array<vscode.QuickPickItem | TargetQuickPickItem>,
      {
        placeHolder: options.placeHolder ?? 'Select the Debug80 target',
        matchOnDescription: true,
        matchOnDetail: true,
      }
    );
    if (picked === undefined) {
      return null;
    }
    if (!isTargetPickRow(picked)) {
      return null;
    }

    return this.applyPickedTarget(projectConfigPath, picked);
  }

  private applyPickedTarget(projectConfigPath: string, picked: TargetQuickPickItem): string | null {
    if (picked.applyEntrySource !== undefined) {
      const ok = updateProjectTargetSource(
        projectConfigPath,
        picked.targetName,
        picked.applyEntrySource
      );
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

function buildTargetQuickPickItems(
  projectConfigPath: string,
  choices: readonly TargetChoice[],
  defaultTarget: string | undefined,
  stored: string | undefined
): TargetQuickPickRow[] {
  const items: TargetQuickPickRow[] = buildTargetChoicePickRows({
    choices,
    storedTarget: stored,
    defaultTarget,
  });

  const bindTarget = defaultTarget ?? stored ?? choices[0]?.name;
  let azmPaths: string[] = [];
  const config = readProjectConfig(projectConfigPath);
  const projectRoot = projectRootFromProjectConfigPath(projectConfigPath);
  const targetsPerSourcePath = buildTargetsPerEntrySourcePath(
    projectRoot,
    config?.targets ?? {},
    isTargetEntrySourcePath
  );

  try {
    const all = getCachedSourceFiles(projectRoot);
    azmPaths = all.filter((p) => isTargetEntrySourcePath(p));
  } catch {
    azmPaths = [];
  }

  items.push(
    ...buildEntrySourcePickRows({
      paths: azmPaths,
      separatorKind: vscode.QuickPickItemKind.Separator,
      separatorLabel: 'AZM sources',
      detail: 'AZM',
      projectRoot,
      targetsPerPath: targetsPerSourcePath,
      bindTarget,
    })
  );

  return items;
}

function targetProgramFileExists(projectRoot: string, target: Record<string, unknown>): boolean {
  const sourcePath = target.sourceFile ?? target.asm ?? target.source;
  if (typeof sourcePath !== 'string' || sourcePath.trim().length === 0) {
    return true;
  }
  const abs = path.isAbsolute(sourcePath)
    ? sourcePath
    : path.join(projectRoot, normalizeProjectRelativePath(sourcePath));
  try {
    return fs.existsSync(abs);
  } catch {
    return false;
  }
}

function loadTargetChoices(projectConfigPath: string): LoadedTargetChoices {
  const projectRoot = projectRootFromProjectConfigPath(projectConfigPath);
  const config = readProjectConfig(projectConfigPath);
  return loadVisibleTargetChoices({
    projectRoot,
    config,
    targetExists: (target) => targetProgramFileExists(projectRoot, target),
  });
}

/** Workspace root for a config at `.vscode/debug80.json` or `debug80.json` next to sources. */
function projectRootFromProjectConfigPath(projectConfigPath: string): string {
  const normalized = projectConfigPath.replace(/\\/g, '/');
  if (normalized.endsWith('.vscode/debug80.json')) {
    return path.dirname(path.dirname(projectConfigPath));
  }
  return path.dirname(projectConfigPath);
}
