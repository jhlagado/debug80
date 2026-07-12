/**
 * @fileoverview Commands for opening source files and source-map diagnostics.
 */

import * as vscode from 'vscode';
import { SourceColumnController } from './source-columns';
import { WorkspaceSelectionController } from './workspace-selection';
import { openPickedSourceFile } from './source-file-picker';
import { showSourceMapStatus } from './source-map-status';

export function registerSourceCommands(options: {
  context: vscode.ExtensionContext;
  sourceColumns: SourceColumnController;
  workspaceSelection: WorkspaceSelectionController;
}): void {
  const { context, sourceColumns, workspaceSelection } = options;

  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.openSourceFile', async () =>
      openPickedSourceFile(sourceColumns, { workspaceSelection })
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.openRomSource', async () =>
      openPickedSourceFile(sourceColumns, { workspaceSelection, romOnly: true })
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.showSourceMapStatus', async () =>
      showSourceMapStatus()
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.searchWorkspaceSymbols', async () =>
      vscode.commands.executeCommand('workbench.action.showAllSymbols')
    )
  );
}
