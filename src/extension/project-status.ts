/**
 * @file Helpers for resolving Debug80 project status for the idle side panel.
 */

import * as vscode from 'vscode';
import { readProjectConfig, findProjectConfigPath } from './project-config';
import { resolvePreferredTargetName } from './project-target-selection';

export type ProjectStatusSummary = {
  projectName: string;
  targetName?: string;
  entrySource?: string;
};

export function resolveProjectStatusSummary(
  workspaceState: vscode.Memento,
  folder: vscode.WorkspaceFolder | undefined
): ProjectStatusSummary | undefined {
  if (folder === undefined) {
    return undefined;
  }

  const projectConfigPath = findProjectConfigPath(folder);
  if (projectConfigPath === undefined) {
    return undefined;
  }

  const config = readProjectConfig(projectConfigPath);
  const targetName = resolvePreferredTargetName(workspaceState, projectConfigPath);
  const entrySource =
    (targetName !== undefined
      ? config?.targets?.[targetName]?.sourceFile ??
        config?.targets?.[targetName]?.asm ??
        config?.targets?.[targetName]?.source
      : undefined) ??
    config?.sourceFile ??
    config?.asm ??
    config?.source;

  return {
    projectName: folder.name,
    ...(targetName !== undefined ? { targetName } : {}),
    ...(entrySource !== undefined ? { entrySource } : {}),
  };
}