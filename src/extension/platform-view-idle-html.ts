/**
 * @file Idle HTML for the Debug80 platform view.
 */

/**
 * Creates a CSP nonce for the idle webview.
 */
export function createPlatformViewNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i += 1) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

/**
 * Renders the platform view idle HTML.
 */
export function getPlatformViewIdleHtml(options: {
  hasProject: boolean;
  selectedWorkspaceName?: string;
  multiRoot: boolean;
  nonce?: string;
}): string {
  const nonce = options.nonce ?? createPlatformViewNonce();
  if (!options.hasProject) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="padding: 16px; font-family: var(--vscode-font-family); color: var(--vscode-foreground);">
  <p>Debug80</p>
  <p style="opacity: 0.7;">Create a Debug80 project to get started.</p>
</body>
</html>`;
  }
  const selectedLabel = options.selectedWorkspaceName ?? 'Workspace';
  const selectionHint =
    options.multiRoot && (options.selectedWorkspaceName === undefined || options.selectedWorkspaceName === '')
      ? 'Select a workspace folder with “Debug80: Select Workspace Folder”.'
      : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="padding: 16px; font-family: var(--vscode-font-family); color: var(--vscode-foreground);">
  <p>Debug80</p>
  <p style="opacity: 0.7;">Project detected (${selectedLabel}). Start a debug session to see the platform UI.</p>
  <button id="startDebug" style="margin-top: 8px; padding: 6px 10px; font-size: 12px;">
    Start Debugging
  </button>
  ${selectionHint ? `<p style="opacity: 0.7;">${selectionHint}</p>` : ''}
  <script nonce="${nonce}">
    (function () {
      const vscode = acquireVsCodeApi();
      const button = document.getElementById('startDebug');
      if (button) {
        button.addEventListener('click', () => {
          vscode.postMessage({ type: 'startDebug' });
        });
      }
    }());
  </script>
</body>
</html>`;
}
