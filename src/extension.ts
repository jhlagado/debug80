import * as vscode from 'vscode';
import { Z80DebugAdapterFactory } from './adapter';
import * as fs from 'fs';
import * as path from 'path';
import { ensureDirExists, inferDefaultTarget } from './config-utils';

export function activate(context: vscode.ExtensionContext): void {
  const factory = new Z80DebugAdapterFactory();

  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory('z80', factory)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.initProject', async () => {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) {
        void vscode.window.showErrorMessage('Debug80: No workspace folder open.');
        return false;
      }

      const configPath = path.join(folder.uri.fsPath, 'debug80.json');
      if (fs.existsSync(configPath)) {
        void vscode.window.showInformationMessage(
          'Debug80: debug80.json already exists in the workspace root.'
        );
        return false;
      }

      const inferred = inferDefaultTarget(folder.uri.fsPath);

      const choice = await vscode.window.showInformationMessage(
        inferred.found
          ? `Debug80: Create debug80.json targeting ${inferred.sourceFile}?`
          : `Debug80: Create debug80.json targeting ${inferred.sourceFile}? (file not found yet)`,
        { modal: true },
        'Create',
        'Cancel'
      );
      if (choice !== 'Create') {
        return false;
      }

      ensureDirExists(path.join(folder.uri.fsPath, path.dirname(inferred.sourceFile)));
      ensureDirExists(path.join(folder.uri.fsPath, inferred.outputDir));

      const defaultConfig = {
        defaultTarget: 'app',
        targets: {
          app: {
            sourceFile: inferred.sourceFile,
            outputDir: inferred.outputDir,
            artifactBase: inferred.artifactBase,
            entry: 0,
          },
        },
      };

      try {
        fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
        void vscode.window.showInformationMessage(
          `Debug80: Created debug80.json targeting ${inferred.sourceFile}.`
        );
        return true;
      } catch (err) {
        void vscode.window.showErrorMessage(`Debug80: Failed to write debug80.json: ${String(err)}`);
        return false;
      }
    })
  );
}

export function deactivate(): void {
  // Nothing to clean up
}
