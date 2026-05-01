/**
 * @file Actions for starting and managing Debug80 debug sessions.
 */

import * as path from 'path';
import * as vscode from 'vscode';
import {
  findProjectConfigPath,
  readProjectConfig,
  resolveProjectPlatform,
} from './project-config';
import { ProjectTargetSelectionController, listProjectTargetChoices } from './project-target-selection';
import { WorkspaceSelectionController } from './workspace-selection';
import { ensureBundledAssetsPresent } from './bundle-asset-installer';

export async function startCurrentProjectDebugging(
  folder: vscode.WorkspaceFolder,
  workspaceSelection: WorkspaceSelectionController,
  stopOnEntry: boolean,
  extensionUri: vscode.Uri
): Promise<boolean> {
  const projectConfig = findProjectConfigPath(folder);
  if (projectConfig === undefined) {
    void vscode.window.showErrorMessage(
      `Debug80: Could not find a project config in ${folder.uri.fsPath}.`
    );
    return false;
  }

  const config = readProjectConfig(projectConfig);
  if (config !== undefined) {
    ensureBundledAssetsPresent(extensionUri, folder.uri.fsPath, config);
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
  stopOnEntry: boolean,
  extensionUri: vscode.Uri
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

  const started = await startCurrentProjectDebugging(folder, workspaceSelection, stopOnEntry, extensionUri);
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
