/**
 * @file Workspace selection and project-detection state for Debug80.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { PlatformViewProvider } from './platform-view-provider';

const WORKSPACE_KEY = 'debug80.selectedWorkspace';

export type ResolveWorkspaceFolderOptions = {
  prompt?: boolean;
  requireProject?: boolean;
  placeHolder?: string;
};

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

  async resolveWorkspaceFolder(
    options: ResolveWorkspaceFolderOptions = {}
  ): Promise<vscode.WorkspaceFolder | undefined> {
    const { prompt = false, requireProject = false } = options;
    const preferred = this.resolvePreferredWorkspace(requireProject);
    if (preferred !== undefined) {
      this.rememberWorkspace(preferred);
      return preferred;
    }

    const folders = this.getCandidateFolders(requireProject);
    if (folders.length === 0) {
      return undefined;
    }
    if (folders.length === 1) {
      const [folder] = folders;
      this.rememberWorkspace(folder);
      return folder;
    }
    if (!prompt) {
      return undefined;
    }

    const picked = await vscode.window.showQuickPick(
      folders.map((folder) => ({
        label: folder.name,
        description: folder.uri.fsPath,
        folder,
      })),
      {
        placeHolder:
          options.placeHolder ??
          (requireProject
            ? 'Select a Debug80 project folder'
            : 'Select workspace folder for Debug80'),
      }
    );
    if (!picked) {
      return undefined;
    }
    this.rememberWorkspace(picked.folder);
    return picked.folder;
  }

  async selectWorkspaceFolder(): Promise<void> {
    const folders = this.getCandidateFolders(false);
    if (folders.length === 0) {
      void vscode.window.showInformationMessage('Debug80: No workspace folders to select.');
      return;
    }
    if (folders.length === 1) {
      this.rememberWorkspace(folders[0]);
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
    this.rememberWorkspace(picked.folder);
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

  private hasProject(folder: vscode.WorkspaceFolder): boolean {
    return fs.existsSync(path.join(folder.uri.fsPath, '.vscode', 'debug80.json'));
  }

  private getCandidateFolders(requireProject: boolean): vscode.WorkspaceFolder[] {
    const folders = vscode.workspace.workspaceFolders ?? [];
    return requireProject ? folders.filter((folder) => this.hasProject(folder)) : [...folders];
  }

  private resolvePreferredWorkspace(requireProject: boolean): vscode.WorkspaceFolder | undefined {
    const selected = this.resolveSelectedWorkspace();
    if (selected !== undefined && (!requireProject || this.hasProject(selected))) {
      return selected;
    }

    const folders = this.getCandidateFolders(requireProject);
    if (folders.length === 1) {
      return folders[0];
    }

    return undefined;
  }

  private applySelectedWorkspace(): void {
    const selected = this.resolvePreferredWorkspace(false);
    this.platformViewProvider.setSelectedWorkspace(selected);
  }
}
