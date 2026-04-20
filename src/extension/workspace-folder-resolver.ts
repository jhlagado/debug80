/**
 * @file Helpers for resolving VS Code workspace folders for Debug80 commands.
 */

import * as path from 'path';
import * as vscode from 'vscode';
import { findProjectConfigPath } from './project-config';
import { WorkspaceSelectionController } from './workspace-selection';

export function findWorkspaceFolder(rootPath: string | undefined): vscode.WorkspaceFolder | undefined {
  if (rootPath === undefined || rootPath.length === 0) {
    return undefined;
  }
  return vscode.workspace.workspaceFolders?.find((folder) => folder.uri.fsPath === rootPath);
}

export async function resolveFolderForProjectCreation(
  workspaceSelection: WorkspaceSelectionController,
  rootPath?: string
): Promise<vscode.WorkspaceFolder | undefined> {
  const directFolder = findWorkspaceFolder(rootPath);
  if (directFolder !== undefined) {
    workspaceSelection.rememberWorkspace(directFolder);
    return directFolder;
  }

  if (rootPath !== undefined && rootPath.length > 0) {
    void vscode.window.showInformationMessage(
      `Debug80: The workspace root ${rootPath} is not open in this window.`
    );
    return undefined;
  }

  const folder = await workspaceSelection.resolveWorkspaceFolder({
    prompt: true,
    placeHolder: 'Select a folder for the new Debug80 project',
  });
  if (folder !== undefined) {
    return folder;
  }

  const hasWorkspaceFolders = (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
  if (hasWorkspaceFolders) {
    return undefined;
  }

  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Use Folder for Debug80 Project',
    title: 'Select a folder for the new Debug80 project',
  });
  const folderUri = picked?.[0];
  if (folderUri === undefined) {
    return undefined;
  }

  const existingFolder = vscode.workspace.getWorkspaceFolder(folderUri);
  if (existingFolder !== undefined) {
    workspaceSelection.rememberWorkspace(existingFolder);
    return existingFolder;
  }

  const insertAt = vscode.workspace.workspaceFolders?.length ?? 0;
  const added = vscode.workspace.updateWorkspaceFolders(insertAt, 0, {
    uri: folderUri,
    name: path.basename(folderUri.fsPath),
  });
  if (!added) {
    void vscode.window.showErrorMessage('Debug80: Failed to add the selected folder to the workspace.');
    return undefined;
  }

  const addedFolder =
    vscode.workspace.getWorkspaceFolder(folderUri) ??
    ({
      uri: folderUri,
      name: path.basename(folderUri.fsPath),
      index: insertAt,
    } as vscode.WorkspaceFolder);
  workspaceSelection.rememberWorkspace(addedFolder);
  return addedFolder;
}

export function resolveProjectFolderFromResource(
  resource: vscode.Uri | undefined,
  workspaceSelection: WorkspaceSelectionController
): vscode.WorkspaceFolder | undefined {
  if (resource === undefined) {
    return undefined;
  }

  const folder = vscode.workspace.getWorkspaceFolder(resource);
  if (folder === undefined) {
    return undefined;
  }

  const projectConfig = findProjectConfigPath(folder);
  if (projectConfig === undefined) {
    return undefined;
  }

  workspaceSelection.rememberWorkspace(folder);
  return folder;
}
