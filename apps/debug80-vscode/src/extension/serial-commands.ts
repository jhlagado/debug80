/**
 * @fileoverview Serial transfer command registration.
 */

import * as vscode from 'vscode';
import { PlatformViewProvider } from './platform-view-provider';
import { findProjectConfigPath, readProjectConfig } from './project-config';
import { resolvePreferredTargetName } from './project-target-selection';
import { sendHexViaCoolTerm, testCoolTermConnection } from './coolterm/coolterm-send';
import { WorkspaceSelectionController } from './workspace-selection';
import { resolveTargetProjectFolder, type SelectTargetArgs } from './target-commands';

export function registerSerialCommands(options: {
  context: vscode.ExtensionContext;
  platformViewProvider: PlatformViewProvider;
  workspaceSelection: WorkspaceSelectionController;
}): void {
  const { context, platformViewProvider, workspaceSelection } = options;

  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.testCoolTermConnection', async () => {
      const connected = await testCoolTermConnection({
        status: (message) => platformViewProvider.setHardwareStatus?.(message),
      });
      platformViewProvider.refreshIdleView();
      return connected;
    }),
    vscode.commands.registerCommand(
      'debug80.sendHexViaCoolTerm',
      async (args?: SelectTargetArgs) => {
        const folderResolution = await resolveTargetProjectFolder(args, workspaceSelection);
        if (folderResolution.kind === 'missing-explicit-root') {
          void vscode.window.showInformationMessage(
            `Debug80: The workspace root ${folderResolution.rootPath} is not open in this window.`
          );
          return false;
        }
        if (folderResolution.kind === 'none') {
          void vscode.window.showInformationMessage(
            'Debug80: No configured Debug80 project found.'
          );
          return false;
        }

        const projectConfig = findProjectConfigPath(folderResolution.folder);
        if (projectConfig === undefined) {
          void vscode.window.showErrorMessage(
            `Debug80: Could not find a project config in ${folderResolution.folder.uri.fsPath}.`
          );
          return false;
        }

        const config = readProjectConfig(projectConfig);
        const targetName =
          args?.targetName ??
          resolvePreferredTargetName(context.workspaceState, projectConfig) ??
          config?.target ??
          config?.defaultTarget;

        const sent = await sendHexViaCoolTerm({
          rootPath: folderResolution.folder.uri.fsPath,
          ...(targetName !== undefined ? { targetName } : {}),
          status: (message) => platformViewProvider.setHardwareStatus?.(message),
        });
        platformViewProvider.refreshIdleView();
        return sent;
      }
    )
  );
}
