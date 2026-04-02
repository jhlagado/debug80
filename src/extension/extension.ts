/**
 * @file VS Code extension entry and UI wiring for Debug80.
 */

import * as vscode from 'vscode';
import { Z80DebugAdapterFactory } from '../debug/adapter';
import { registerExtensionCommands } from './commands';
import { registerDebugSessionHandlers } from './debug-session-events';
import { registerLanguageAssociations } from './language-association';
import { SessionStateManager } from './session-state-manager';
import { PlatformViewProvider } from './platform-view-provider';
import { SourceColumnController } from './source-columns';
import { TerminalPanelController } from './terminal-panel';
import { WorkspaceSelectionController } from './workspace-selection';

/**
 * Activates the Debug80 extension and registers commands/providers.
 */
export function activate(context: vscode.ExtensionContext): void {
  const sessionState = new SessionStateManager();
  const factory = new Z80DebugAdapterFactory();
  const output = vscode.window.createOutputChannel('Debug80');
  const platformViewProvider = new PlatformViewProvider(context.extensionUri);
  const workspaceSelection = new WorkspaceSelectionController(context, platformViewProvider);
  const sourceColumns = new SourceColumnController(sessionState);
  const terminalPanel = new TerminalPanelController(
    sessionState,
    (session) => sourceColumns.getSessionColumns(session).panel
  );

  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory('z80', factory)
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      PlatformViewProvider.viewType,
      platformViewProvider
    )
  );

  registerLanguageAssociations(context, output);
  workspaceSelection.registerInfrastructure();
  sourceColumns.register(context);
  registerExtensionCommands({
    context,
    platformViewProvider,
    sourceColumns,
    terminalPanel,
    workspaceSelection,
  });
  registerDebugSessionHandlers({
    context,
    platformViewProvider,
    sessionState,
    sourceColumns,
    terminalPanel,
    workspaceSelection,
  });
}

/**
 * Disposes extension resources on deactivation.
 */
export function deactivate(): void {
  // Nothing to clean up
}
