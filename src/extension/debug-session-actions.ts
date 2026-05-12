/**
 * @file Actions for starting and managing Debug80 debug sessions.
 */

import * as path from 'path';
import * as vscode from 'vscode';
import {
  findProjectConfigPath,
  isInitializedDebug80Project,
  readProjectConfig,
  resolveProjectPlatform,
} from './project-config';
import { ProjectTargetSelectionController, listProjectTargetChoices } from './project-target-selection';
import { WorkspaceSelectionController } from './workspace-selection';

export async function startCurrentProjectDebugging(
  folder: vscode.WorkspaceFolder,
  workspaceSelection: WorkspaceSelectionController,
  stopOnEntry: boolean
): Promise<boolean> {
  const projectConfig = findProjectConfigPath(folder);
  if (projectConfig === undefined) {
    void vscode.window.showErrorMessage(
      `Debug80: Could not find a project config in ${folder.uri.fsPath}.`
    );
    return false;
  }

  workspaceSelection.rememberWorkspace(folder);
  return vscode.debug.startDebugging(folder, {
    type: 'z80',
    request: 'launch',
    name: 'Debug80: Current Project',
    projectConfig,
    stopOnEntry,
  });
}

export async function maybeAutoStartSingleTargetForRootChange(
  folder: vscode.WorkspaceFolder,
  workspaceSelection: WorkspaceSelectionController,
  targetSelection: ProjectTargetSelectionController,
  stopOnEntry: boolean
): Promise<string | undefined> {
  const projectConfig = findProjectConfigPath(folder);
  if (projectConfig === undefined) {
    return undefined;
  }

  const choices = listProjectTargetChoices(projectConfig);
  if (choices.length !== 1) {
    return undefined;
  }

  const onlyTarget = choices[0]?.name;
  if (onlyTarget === undefined) {
    return undefined;
  }

  targetSelection.rememberTarget(projectConfig, onlyTarget);

  const activeSession = vscode.debug.activeDebugSession;
  if (activeSession?.type === 'z80') {
    await vscode.debug.stopDebugging(activeSession);
  }

  const started = await startCurrentProjectDebugging(folder, workspaceSelection, stopOnEntry);
  if (!started) {
    return undefined;
  }

  return onlyTarget;
}

export function resolveProjectPlatformForFolder(folder: vscode.WorkspaceFolder): string | undefined {
  const projectConfig = findProjectConfigPath(folder);
  if (projectConfig === undefined) {
    return undefined;
  }
  return resolveProjectPlatform(readProjectConfig(projectConfig));
}

function projectConfigFromSession(session: vscode.DebugSession): string | undefined {
  const configuration = session.configuration as { projectConfig?: unknown } | undefined;
  const projectConfigRaw = configuration?.projectConfig;
  if (typeof projectConfigRaw !== 'string' || projectConfigRaw.trim() === '') {
    return undefined;
  }
  return projectConfigRaw;
}

export function resolveSessionProjectConfigPath(session: vscode.DebugSession): string | undefined {
  const projectConfigRaw = projectConfigFromSession(session);
  if (projectConfigRaw === undefined) {
    return undefined;
  }
  return path.normalize(
    path.isAbsolute(projectConfigRaw)
      ? projectConfigRaw
      : session.workspaceFolder !== undefined
        ? path.join(session.workspaceFolder.uri.fsPath, projectConfigRaw)
        : projectConfigRaw
  );
}

export function resolveSessionWorkspaceFolder(
  session: vscode.DebugSession
): vscode.WorkspaceFolder | undefined {
  const projectConfigPath = resolveSessionProjectConfigPath(session);
  if (projectConfigPath === undefined) {
    const sessionFolder = session.workspaceFolder;
    return sessionFolder !== undefined && isInitializedDebug80Project(sessionFolder)
      ? sessionFolder
      : undefined;
  }

  const sessionFolder = session.workspaceFolder;
  const sessionProjectConfig =
    sessionFolder !== undefined ? findProjectConfigPath(sessionFolder) : undefined;
  if (
    sessionFolder !== undefined &&
    sessionProjectConfig !== undefined &&
    path.normalize(sessionProjectConfig) === projectConfigPath
  ) {
    return sessionFolder;
  }

  return (vscode.workspace.workspaceFolders ?? []).find((folder) => {
    const candidate = findProjectConfigPath(folder);
    return candidate !== undefined && path.normalize(candidate) === projectConfigPath;
  });
}
