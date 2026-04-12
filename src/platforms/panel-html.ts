/**
 * @file Shared webview HTML builder helpers for platform panels.
 */

import * as fs from 'fs';
import * as vscode from 'vscode';

export type PanelTab = 'ui' | 'memory';
export type PanelPlatform = 'tec1' | 'tec1g';

/** Generates a CSP nonce for inline script tags. */
function getNonce(): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let i = 0; i < 32; i += 1) {
    value += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return value;
}

/** Replaces {{tokens}} in the template with provided values. */
function renderTemplate(template: string, replacements: Record<string, string>): string {
  return template.replace(/{{(\w+)}}/g, (match: string, key: string) => {
    return replacements[key] ?? match;
  });
}

/** Resolves the webview asset directory, preferring compiled output. */
function resolveWebviewDir(extensionUri: vscode.Uri, platform: PanelPlatform): vscode.Uri {
  const outDir = vscode.Uri.joinPath(extensionUri, 'out', 'webview', platform);
  if (fs.existsSync(outDir.fsPath)) {
    return outDir;
  }
  return vscode.Uri.joinPath(extensionUri, 'webview', platform);
}

/** Resolves the shared webview CSS path, preferring compiled output. */
function resolveCommonCssPath(extensionUri: vscode.Uri): vscode.Uri {
  const outPath = vscode.Uri.joinPath(extensionUri, 'out', 'webview', 'common', 'styles.css');
  if (fs.existsSync(outPath.fsPath)) {
    return outPath;
  }
  return vscode.Uri.joinPath(extensionUri, 'webview', 'common', 'styles.css');
}

/** Resolves the webview script path, preferring compiled JS. */
function resolveScriptPath(webviewDir: vscode.Uri): vscode.Uri {
  const jsPath = vscode.Uri.joinPath(webviewDir, 'index.js');
  if (fs.existsSync(jsPath.fsPath)) {
    return jsPath;
  }
  return vscode.Uri.joinPath(webviewDir, 'index.ts');
}

/**
 * Builds the platform panel webview HTML.
 */
export function buildPanelHtml(
  activeTab: PanelTab,
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  platform: PanelPlatform
): string {
  const webviewDir = resolveWebviewDir(extensionUri, platform);
  const commonCssPath = resolveCommonCssPath(extensionUri);
  const templateUri = vscode.Uri.joinPath(webviewDir, 'index.html');
  const template = fs.readFileSync(templateUri.fsPath, 'utf8');
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewDir, 'styles.css'));
  const commonStyleUri = webview.asWebviewUri(commonCssPath);
  const scriptUri = webview.asWebviewUri(resolveScriptPath(webviewDir));
  const nonce = getNonce();
  return renderTemplate(template, {
    cspSource: webview.cspSource,
    nonce,
    styleUri: String(styleUri),
    commonStyleUri: String(commonStyleUri),
    scriptUri: String(scriptUri),
    activeTab,
  });
}
