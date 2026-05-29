/**
 * @fileoverview Commands that open or focus Debug80 view surfaces.
 */

import * as vscode from 'vscode';
import { PlatformViewProvider } from './platform-view-provider';
import { SourceColumnController } from './source-columns';
import { TerminalPanelController } from './terminal-panel';

export function registerPanelViewCommands(options: {
  context: vscode.ExtensionContext;
  platformViewProvider: PlatformViewProvider;
  sourceColumns: SourceColumnController;
  terminalPanel: TerminalPanelController;
}): void {
  const { context, platformViewProvider, sourceColumns, terminalPanel } = options;

  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.openDebug80View', () => {
      platformViewProvider.reveal(true);
      return true;
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
      openPlatformView(platformViewProvider, 'ui');
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.openTec1Memory', () => {
      openPlatformView(platformViewProvider, 'memory');
    })
  );
}

function openPlatformView(platformViewProvider: PlatformViewProvider, tab: 'ui' | 'memory'): void {
  const session = vscode.debug.activeDebugSession;
  if (session && session.type === 'z80') {
    platformViewProvider.setPlatform('tec1', session, {
      focus: true,
      reveal: true,
      tab,
    });
    return;
  }
  platformViewProvider.setPlatform('tec1', undefined, {
    focus: true,
    reveal: true,
    tab,
  });
}
