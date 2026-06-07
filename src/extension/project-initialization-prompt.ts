/**
 * @file Shared confirmation flow for turning a workspace folder into a Debug80 project.
 */

import * as vscode from 'vscode';

export async function promptToInitializeSelectedFolder(
  folder: vscode.WorkspaceFolder,
  platform: string | undefined
): Promise<boolean> {
  const initializeLabel = 'Initialize';
  const choice = await vscode.window.showInformationMessage(
    `Debug80: ${folder.name} is not a Debug80 project. Initialize it now?`,
    { modal: true },
    initializeLabel,
    'Not Now'
  );
  if (choice !== initializeLabel) {
    return false;
  }
  const result = await vscode.commands.executeCommand('debug80.createProject', {
    rootPath: folder.uri.fsPath,
    ...(platform !== undefined ? { platform } : {}),
  });
  return result === true;
}
