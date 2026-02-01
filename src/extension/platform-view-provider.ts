/**
 * @file WebviewViewProvider for the Debug80 sidebar platform view.
 *
 * Phase 1: skeleton provider that shows a placeholder message.
 * Phase 2 will wire in platform UI rendering and event routing.
 */

import * as vscode from 'vscode';

export class PlatformViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'debug80.platformView';

  private _view: vscode.WebviewView | undefined;

  get view(): vscode.WebviewView | undefined {
    return this._view;
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.html = this.getPlaceholderHtml();

    webviewView.onDidDispose(() => {
      this._view = undefined;
    });
  }

  private getPlaceholderHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="padding: 16px; font-family: var(--vscode-font-family); color: var(--vscode-foreground);">
  <p>Debug80</p>
  <p style="opacity: 0.7;">Start a debug session to see the platform UI.</p>
</body>
</html>`;
  }
}
