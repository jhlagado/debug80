/**
 * @file Terminal panel HTML builder.
 */

import * as fs from 'fs';
import * as path from 'path';

type ExtensionRoot = {
  fsPath: string;
};

const TERMINAL_TEMPLATE_NAME = path.join('webview', 'terminal', 'index.html');

function createTerminalPanelNonce(): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let i = 0; i < 32; i += 1) {
    value += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return value;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function resolveTerminalTemplatePath(extensionRoot: ExtensionRoot): string {
  const outPath = path.join(extensionRoot.fsPath, 'out', TERMINAL_TEMPLATE_NAME);
  if (fs.existsSync(outPath)) {
    return outPath;
  }
  return path.join(extensionRoot.fsPath, TERMINAL_TEMPLATE_NAME);
}

/**
 * Builds the terminal panel webview HTML.
 */
export function getTerminalHtml(initialOutput: string, extensionRoot: ExtensionRoot): string {
  const template = fs.readFileSync(resolveTerminalTemplatePath(extensionRoot), 'utf8');
  return template
    .replace(/{{nonce}}/g, createTerminalPanelNonce())
    .replace(/{{initialOutput}}/g, escapeHtml(initialOutput));
}
