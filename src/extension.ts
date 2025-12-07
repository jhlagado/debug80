import * as vscode from 'vscode';
import { Z80DebugAdapterFactory } from './adapter';
import * as fs from 'fs';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext): void {
  const factory = new Z80DebugAdapterFactory();

  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory('z80', factory)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.initProject', () => {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) {
        void vscode.window.showErrorMessage('Debug80: No workspace folder open.');
        return;
      }

      const configPath = path.join(folder.uri.fsPath, 'debug80.json');
      if (fs.existsSync(configPath)) {
        void vscode.window.showInformationMessage(
          'Debug80: debug80.json already exists in the workspace root.'
        );
        return;
      }

      const defaultConfig = {
        defaultTarget: 'app',
        targets: {
          app: {
            sourceFile: 'src/main.asm',
            outputDir: 'build',
            artifactBase: 'main',
            entry: 0,
          },
        },
      };

      try {
        fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
        void vscode.window.showInformationMessage(
          'Debug80: Created debug80.json in the workspace root.'
        );
      } catch (err) {
        void vscode.window.showErrorMessage(`Debug80: Failed to write debug80.json: ${String(err)}`);
      }
    })
  );
}

export function deactivate(): void {
  // Nothing to clean up
}
