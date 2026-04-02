/**
 * @file Command registration for the Debug80 extension.
 */

import * as vscode from 'vscode';
import { PlatformViewProvider } from './platform-view-provider';
import { scaffoldProject } from './project-scaffolding';
import { fetchRomSources } from './rom-sources';
import { SourceColumnController } from './source-columns';
import { TerminalPanelController } from './terminal-panel';
import { WorkspaceSelectionController } from './workspace-selection';

type CommandDependencies = {
  context: vscode.ExtensionContext;
  platformViewProvider: PlatformViewProvider;
  sourceColumns: SourceColumnController;
  terminalPanel: TerminalPanelController;
  workspaceSelection: WorkspaceSelectionController;
};

export function registerExtensionCommands({
  context,
  platformViewProvider,
  sourceColumns,
  terminalPanel,
  workspaceSelection,
}: CommandDependencies): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.createProject', async () => {
      return scaffoldProject(true);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.selectWorkspaceFolder', async () => {
      await workspaceSelection.selectWorkspaceFolder();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.terminalInput', async () => {
      const session = vscode.debug.activeDebugSession;
      if (!session || session.type !== 'z80') {
        void vscode.window.showErrorMessage('Debug80: No active z80 debug session.');
        return;
      }
      const input = await vscode.window.showInputBox({
        prompt: 'Enter text to send to the target terminal',
        placeHolder: 'text',
      });
      if (input === undefined) {
        return;
      }
      const payload = input.endsWith('\n') ? input : `${input}\n`;
      try {
        await session.customRequest('debug80/terminalInput', { text: payload });
      } catch (err) {
        void vscode.window.showErrorMessage(`Debug80: Failed to send input: ${String(err)}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.openTerminal', () => {
      const session = vscode.debug.activeDebugSession;
      if (!session || session.type !== 'z80') {
        terminalPanel.open(undefined, { focus: true });
        return;
      }
      const columns = sourceColumns.getSessionColumns(session);
      terminalPanel.open(session, { focus: true, column: columns.panel });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.openTec1', () => {
      const session = vscode.debug.activeDebugSession;
      if (session && session.type === 'z80') {
        platformViewProvider.setPlatform('tec1', session, {
          focus: true,
          reveal: true,
          tab: 'ui',
        });
        return;
      }
      platformViewProvider.setPlatform('tec1', undefined, {
        focus: true,
        reveal: true,
        tab: 'ui',
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.openTec1Memory', () => {
      const session = vscode.debug.activeDebugSession;
      if (session && session.type === 'z80') {
        platformViewProvider.setPlatform('tec1', session, {
          focus: true,
          reveal: true,
          tab: 'memory',
        });
        return;
      }
      platformViewProvider.setPlatform('tec1', undefined, {
        focus: true,
        reveal: true,
        tab: 'memory',
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.openRomSource', async () => {
      const session = vscode.debug.activeDebugSession;
      if (!session || session.type !== 'z80') {
        void vscode.window.showErrorMessage('Debug80: No active z80 debug session.');
        return;
      }
      try {
        const sources = await fetchRomSources(session);
        if (sources.length === 0) {
          void vscode.window.showInformationMessage(
            'Debug80: No ROM sources available for this session.'
          );
          return;
        }
        const items = sources.map((source) => ({
          label: source.label,
          description: source.kind === 'listing' ? 'listing' : 'source',
          detail: source.path,
          path: source.path,
        }));
        const picked = await vscode.window.showQuickPick(items, {
          placeHolder: 'Open ROM listing/source',
          matchOnDescription: true,
          matchOnDetail: true,
        });
        if (!picked) {
          return;
        }
        const doc = await vscode.workspace.openTextDocument(picked.path);
        const columns = sourceColumns.getSessionColumns(session);
        await vscode.window.showTextDocument(doc, { preview: false, viewColumn: columns.source });
      } catch (err) {
        void vscode.window.showErrorMessage(
          `Debug80: Failed to list ROM sources: ${String(err)}`
        );
      }
    })
  );
}
