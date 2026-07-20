/**
 * @fileoverview Commands for creating Debug80 projects and adding workspace folders.
 */

import * as path from 'path';
import * as vscode from 'vscode';
import { PlatformViewProvider } from './platform-view-provider';
import { findProjectConfigPath } from './project-config';
import { promptToInitializeSelectedFolder } from './project-initialization-prompt';
import { scaffoldProject } from './project-scaffolding';
import { WorkspaceSelectionController } from './workspace-selection';
import { resolveFolderForProjectCreation } from './workspace-folder-resolver';

export function registerProjectWorkspaceCommands(options: {
  context: vscode.ExtensionContext;
  platformViewProvider: PlatformViewProvider;
  workspaceSelection: WorkspaceSelectionController;
}): void {
  const { context, platformViewProvider, workspaceSelection } = options;
  let creatingProject = false;

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'debug80.createProject',
      async (args?: { rootPath?: string; platform?: string }) => {
        if (creatingProject) {
          return false;
        }
        creatingProject = true;
        try {
          // Defer one event-loop tick so the trailing mouseup from a welcome-view
          // link click settles before any quick-pick or open-dialog is shown.
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          const folder = await resolveFolderForProjectCreation(workspaceSelection, args?.rootPath);
          if (!folder) {
            void vscode.window.showErrorMessage(
              'Debug80: No workspace folder available for project creation.'
            );
            return false;
          }
          const created = await scaffoldProject(
            folder,
            false,
            context.extensionUri,
            args?.platform
          );
          if (created) {
            workspaceSelection.rememberWorkspace(folder);
            platformViewProvider.refreshIdleView();
            platformViewProvider.reveal?.(false);
          }
          return created;
        } finally {
          creatingProject = false;
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'debug80.addWorkspaceFolder',
      async (args?: { platform?: string }) => {
        const picked = await vscode.window.showOpenDialog({
          canSelectFiles: false,
          canSelectFolders: true,
          canSelectMany: false,
          openLabel: 'Add Folder to Workspace',
          title: 'Add a folder to the Debug80 workspace',
        });
        const folderUri = picked?.[0];
        if (folderUri === undefined) {
          return;
        }
        const existing = vscode.workspace.getWorkspaceFolder(folderUri);
        if (existing !== undefined) {
          workspaceSelection.rememberWorkspace(existing);
          await maybePromptToInitializeAddedFolder(existing, args?.platform);
          platformViewProvider.refreshIdleView();
          return;
        }
        const insertAt = vscode.workspace.workspaceFolders?.length ?? 0;
        const added = vscode.workspace.updateWorkspaceFolders(insertAt, 0, {
          uri: folderUri,
          name: path.basename(folderUri.fsPath),
        });
        if (!added) {
          void vscode.window.showErrorMessage(
            'Debug80: Failed to add the selected folder to the workspace.'
          );
          return;
        }
        const addedFolder =
          vscode.workspace.getWorkspaceFolder(folderUri) ??
          ({
            uri: folderUri,
            name: path.basename(folderUri.fsPath),
            index: insertAt,
          } as vscode.WorkspaceFolder);
        workspaceSelection.rememberWorkspace(addedFolder);
        await maybePromptToInitializeAddedFolder(addedFolder, args?.platform);
        platformViewProvider.refreshIdleView();
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'debug80.removeWorkspaceFolder',
      async (args?: { rootPath?: string }) => {
        const folders = vscode.workspace.workspaceFolders ?? [];
        if (folders.length <= 1) {
          void vscode.window.showInformationMessage(
            'Debug80: The last workspace folder cannot be removed.'
          );
          return;
        }
        const folder =
          args?.rootPath !== undefined
            ? folders.find((candidate) => candidate.uri.fsPath === args.rootPath)
            : undefined;
        if (folder === undefined) {
          void vscode.window.showInformationMessage(
            'Debug80: Select a workspace folder to remove first.'
          );
          return;
        }

        const confirmed = await vscode.window.showWarningMessage(
          `Remove folder ${folder.name} from the workspace? Files on disk are not affected.`,
          { modal: true },
          'Remove Folder'
        );
        if (confirmed !== 'Remove Folder') {
          return;
        }

        if (!vscode.workspace.updateWorkspaceFolders(folder.index, 1)) {
          void vscode.window.showErrorMessage(
            `Debug80: Failed to remove ${folder.name} from the workspace.`
          );
          return;
        }
        platformViewProvider.refreshIdleView();
      }
    )
  );
}

async function maybePromptToInitializeAddedFolder(
  folder: vscode.WorkspaceFolder,
  platform: string | undefined
): Promise<void> {
  if (findProjectConfigPath(folder) !== undefined) {
    return;
  }
  await promptToInitializeSelectedFolder(folder, platform);
}
