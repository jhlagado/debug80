/**
 * @file Workspace selection and project-detection state for Debug80.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { PlatformViewProvider } from './platform-view-provider';

const WORKSPACE_KEY = 'debug80.selectedWorkspace';

export class WorkspaceSelectionController {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly platformViewProvider: PlatformViewProvider
  ) {}

  registerInfrastructure(): void {
    this.updateHasProject();
    this.applySelectedWorkspace();

    const configWatcher = vscode.workspace.createFileSystemWatcher('**/.vscode/debug80.json');
    configWatcher.onDidCreate(this.updateHasProject);
    configWatcher.onDidDelete(this.updateHasProject);
    this.context.subscriptions.push(configWatcher);

    this.context.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders(() => {
        this.updateHasProject();
        this.applySelectedWorkspace();
      })
    );
  }

  rememberWorkspace(folder: vscode.WorkspaceFolder | undefined): void {
    if (!folder) {
      return;
    }
    void this.context.workspaceState.update(WORKSPACE_KEY, folder.uri.fsPath);
    this.platformViewProvider.setSelectedWorkspace(folder);
  }

  async selectWorkspaceFolder(): Promise<void> {
    const folders = vscode.workspace.workspaceFolders ?? [];
    if (folders.length === 0) {
      void vscode.window.showInformationMessage('Debug80: No workspace folders to select.');
      return;
    }
    if (folders.length === 1) {
      void this.context.workspaceState.update(WORKSPACE_KEY, folders[0]?.uri.fsPath ?? '');
      this.applySelectedWorkspace();
      return;
    }
    const picked = await vscode.window.showQuickPick(
      folders.map((folder) => ({
        label: folder.name,
        description: folder.uri.fsPath,
        folder,
      })),
      { placeHolder: 'Select workspace folder for Debug80' }
    );
    if (!picked) {
      return;
    }
    void this.context.workspaceState.update(WORKSPACE_KEY, picked.folder.uri.fsPath);
    this.applySelectedWorkspace();
  }

  private readonly updateHasProject = (): void => {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const hasProject = folders.some((folder) =>
      fs.existsSync(path.join(folder.uri.fsPath, '.vscode', 'debug80.json'))
    );
    void vscode.commands.executeCommand('setContext', 'debug80.hasProject', hasProject);
    this.platformViewProvider.setHasProject(hasProject);
  };

  private resolveSelectedWorkspace(): vscode.WorkspaceFolder | undefined {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const storedPath = this.context.workspaceState.get<string>(WORKSPACE_KEY);
    if (storedPath === undefined || storedPath === '') {
      return undefined;
    }
    return folders.find((folder) => folder.uri.fsPath === storedPath);
  }

  private applySelectedWorkspace(): void {
    const selected = this.resolveSelectedWorkspace();
    this.platformViewProvider.setSelectedWorkspace(selected);
  }
}
