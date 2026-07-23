import * as vscode from 'vscode';
import type { PlatformViewProvider } from './platform-view-provider';
import type { ProjectTargetSelectionController } from './project-target-selection';
import type { WorkspaceSelectionController } from './workspace-selection';
import { findWorkspaceFolder } from './workspace-folder-resolver';

export interface TargetCommandContext {
  context: vscode.ExtensionContext;
  platformViewProvider: PlatformViewProvider;
  workspaceSelection: WorkspaceSelectionController;
  targetSelection: ProjectTargetSelectionController;
}

export interface SelectTargetArgs {
  rootPath?: string;
  targetName?: string;
}

export interface AddTargetArgs {
  rootPath?: string;
  sourceFile?: string;
}

export type TargetProjectFolderResolution =
  | { kind: 'found'; folder: vscode.WorkspaceFolder }
  | { kind: 'missing-explicit-root'; rootPath: string }
  | { kind: 'none' };

export async function resolveTargetProjectFolder(
  args: SelectTargetArgs | undefined,
  workspaceSelection: WorkspaceSelectionController
): Promise<TargetProjectFolderResolution> {
  const folder = findWorkspaceFolder(args?.rootPath);
  if (folder !== undefined) {
    return { kind: 'found', folder };
  }
  if (args?.rootPath !== undefined) {
    return { kind: 'missing-explicit-root', rootPath: args.rootPath };
  }
  const promptedFolder = await workspaceSelection.resolveWorkspaceFolder({
    prompt: true,
    requireProject: true,
    placeHolder: 'Select the Debug80 project folder',
  });
  return promptedFolder !== undefined
    ? { kind: 'found', folder: promptedFolder }
    : { kind: 'none' };
}
