import * as vscode from 'vscode';
import type { PlatformId, ProjectStatusPayload } from '../contracts/platform-view';
import { findProjectConfigPath, readProjectConfig, resolveProjectPlatform } from './project-config';
import { listProjectTargetChoices } from './project-target-selection';
import { resolveProjectStatusSummary } from './project-status';
import { resolveRememberedWorkspaceFolder } from './workspace-selection';

export interface PlatformViewProjectStatusContext {
  workspaceState: vscode.Memento | undefined;
  selectedWorkspace: vscode.WorkspaceFolder | undefined;
  currentPlatform: PlatformId | undefined;
  stopOnEntry: boolean;
}

export function resolvePlatformViewWorkspace(
  ctx: Pick<PlatformViewProjectStatusContext, 'workspaceState' | 'selectedWorkspace'>,
  folders: readonly vscode.WorkspaceFolder[] = vscode.workspace.workspaceFolders ?? []
): vscode.WorkspaceFolder | undefined {
  if (
    ctx.selectedWorkspace !== undefined &&
    folders.some((folder) => folder.uri.fsPath === ctx.selectedWorkspace?.uri.fsPath)
  ) {
    return ctx.selectedWorkspace;
  }
  return (
    resolveRememberedWorkspaceFolder(ctx.workspaceState, folders) ??
    (folders.length === 1 ? folders[0] : undefined)
  );
}

export function buildPlatformViewProjectStatus(
  ctx: PlatformViewProjectStatusContext,
  folders: readonly vscode.WorkspaceFolder[] = vscode.workspace.workspaceFolders ?? []
): ProjectStatusPayload {
  const roots = folders.map((folder) => ({
    name: folder.name,
    path: folder.uri.fsPath,
    hasProject: findProjectConfigPath(folder) !== undefined,
  }));
  const folder = resolvePlatformViewWorkspace(ctx, folders);
  if (folder === undefined) {
    return {
      roots,
      targets: [],
      projectState: roots.length === 0 ? 'noWorkspace' : 'uninitialized',
      hasProject: false,
      platform: ctx.currentPlatform ?? 'simple',
      stopOnEntry: ctx.stopOnEntry,
    };
  }

  const projectConfigPath = findProjectConfigPath(folder);
  const hasProject = projectConfigPath !== undefined;
  const projectStatus =
    hasProject && ctx.workspaceState !== undefined
      ? resolveProjectStatusSummary(ctx.workspaceState, folder)
      : undefined;
  if (!hasProject) {
    return {
      roots,
      targets: [],
      rootName: folder.name,
      rootPath: folder.uri.fsPath,
      projectState: 'uninitialized',
      hasProject: false,
      platform: ctx.currentPlatform ?? 'simple',
      stopOnEntry: ctx.stopOnEntry,
    };
  }

  const config = readProjectConfig(projectConfigPath);
  const platform = resolveProjectPlatform(config) ?? 'simple';

  return {
    roots,
    targets: listProjectTargetChoices(projectConfigPath),
    rootName: folder.name,
    rootPath: folder.uri.fsPath,
    projectState: 'initialized',
    hasProject: true,
    platform,
    stopOnEntry: ctx.stopOnEntry,
    ...(projectStatus?.targetName !== undefined ? { targetName: projectStatus.targetName } : {}),
    ...(projectStatus?.entrySource !== undefined ? { entrySource: projectStatus.entrySource } : {}),
  };
}
