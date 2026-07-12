/**
 * @fileoverview Commands that operate on VS Code debug call-stack items.
 */

import * as vscode from 'vscode';

export function registerCallStackCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.runToSelectedStackFrame', async (item?: unknown) => {
      const stackItem =
        item instanceof vscode.DebugStackFrame ? item : vscode.debug.activeStackItem;
      if (!(stackItem instanceof vscode.DebugStackFrame)) {
        await vscode.window.showWarningMessage(
          'Debug80: Select a return frame in the Call Stack view first.'
        );
        return false;
      }
      if (stackItem.frameId === 0) {
        await vscode.window.showWarningMessage(
          'Debug80: Select a caller return frame, not the current PC frame.'
        );
        return false;
      }
      try {
        await stackItem.session.customRequest('debug80/runToStackFrame', {
          frameId: stackItem.frameId,
        });
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await vscode.window.showWarningMessage(`Debug80: ${message}`);
        return false;
      }
    })
  );
}
