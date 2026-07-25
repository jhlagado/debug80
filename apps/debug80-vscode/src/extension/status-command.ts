/**
 * @file Machine-readable project status for scripts, tests and doc tooling.
 */

import * as vscode from 'vscode';
import { PlatformViewProvider } from './platform-view-provider';

/**
 * Registers `debug80.getStatus`.
 *
 * The command returns the status object so callers using
 * `executeCommand` get structured data, and copies the same JSON to the
 * clipboard so a human can inspect it without opening the panel.
 */
export function registerStatusCommand(options: {
  context: vscode.ExtensionContext;
  platformViewProvider: PlatformViewProvider;
}): void {
  const { context, platformViewProvider } = options;
  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.getStatus', async (args?: { quiet?: boolean }) => {
      const status = platformViewProvider.getProjectStatus();
      if (args?.quiet !== true) {
        await vscode.env.clipboard.writeText(JSON.stringify(status, null, 2));
        void vscode.window.showInformationMessage(
          'Debug80: Copied project status JSON to the clipboard.'
        );
      }
      return status;
    })
  );
}
