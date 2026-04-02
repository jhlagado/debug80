/**
 * @file Serial file workflows for the Debug80 platform view.
 */

import * as vscode from 'vscode';

import type { PlatformViewPlatform } from './platform-view-messages';

export interface PlatformSerialActionsContext {
  getSession: () => vscode.DebugSession | undefined;
  getPlatform: () => PlatformViewPlatform | undefined;
}

/**
 * Sends a file to the active serial input one character at a time.
 */
export async function handlePlatformSerialSendFile(
  ctx: PlatformSerialActionsContext
): Promise<void> {
  const uris = await vscode.window.showOpenDialog({
    canSelectMany: false,
    filters: {
      'Intel HEX': ['hex'],
      'Text Files': ['txt'],
      'All Files': ['*'],
    },
    title: 'Select file to send',
  });
  if (!uris || uris.length === 0) {
    return;
  }

  const fileUri = uris[0]!;
  const fileName = fileUri.path.split('/').pop() ?? 'file';
  const fileBytes = await vscode.workspace.fs.readFile(fileUri);
  const fileText = new TextDecoder('utf-8').decode(fileBytes);

  const session = ctx.getSession();
  if (!session || session.type !== 'z80') {
    void vscode.window.showErrorMessage('Debug80: No active debug session.');
    return;
  }

  const command = ctx.getPlatform() === 'tec1g' ? 'debug80/tec1gSerialInput' : 'debug80/tec1SerialInput';
  const charDelayMs = 2;
  const lineDelayMs = 10;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Sending ${fileName}...`,
      cancellable: true,
    },
    async (progress, token) => {
      const lines = fileText.split(/\r?\n/);
      let charsSent = 0;
      const totalChars = fileText.length;

      for (const line of lines) {
        if (token.isCancellationRequested) {
          void vscode.window.showWarningMessage('Debug80: File send cancelled.');
          return;
        }
        for (const char of line) {
          if (token.isCancellationRequested) {
            return;
          }
          try {
            await session.customRequest(command, { text: char });
          } catch {
            void vscode.window.showErrorMessage('Debug80: Failed to send character.');
            return;
          }
          charsSent += 1;
          if (charDelayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, charDelayMs));
          }
        }
        try {
          await session.customRequest(command, { text: '\r' });
        } catch {
          /* ignore */
        }
        charsSent += 1;
        progress.report({ increment: (100 * (line.length + 1)) / totalChars });
        if (lineDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, lineDelayMs));
        }
      }
      void vscode.window.showInformationMessage(`Debug80: Sent ${charsSent} characters.`);
    }
  );
}

/**
 * Saves the current serial buffer to a file, preferring HEX when the
 * contents look like Intel HEX.
 */
export async function handlePlatformSerialSave(text: string): Promise<void> {
  if (!text || text.length === 0) {
    void vscode.window.showWarningMessage('Debug80: Serial buffer is empty.');
    return;
  }

  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  const isHex = lines.length > 0 && lines.every((line) => line.startsWith(':') || line.trim() === '');
  const filters: Record<string, string[]> = isHex
    ? { 'Intel HEX': ['hex'], 'Text Files': ['txt'] }
    : { 'Text Files': ['txt'], 'All Files': ['*'] };

  const uri = await vscode.window.showSaveDialog({
    filters,
    title: 'Save serial output',
  });
  if (!uri) {
    return;
  }

  const encoder = new TextEncoder();
  await vscode.workspace.fs.writeFile(uri, encoder.encode(text));
  void vscode.window.showInformationMessage(`Debug80: Saved to ${uri.path.split('/').pop()}`);
}
