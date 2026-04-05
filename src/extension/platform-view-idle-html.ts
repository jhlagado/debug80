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
  projectName?: string;
  targetName?: string;
  entrySource?: string;
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
  <button id="createProject" style="margin-top: 8px; padding: 6px 10px; font-size: 12px;">
    Create Project
  </button>
  <script nonce="${nonce}">
    (function () {
      const vscode = acquireVsCodeApi();
      const button = document.getElementById('createProject');
      if (button) {
        button.addEventListener('click', () => {
          vscode.postMessage({ type: 'createProject' });
        });
      }
    }());
  </script>
</body>
</html>`;
  }

  const selectedLabel = options.selectedWorkspaceName ?? 'Workspace';
  const selectionHint =
    options.multiRoot &&
    (options.selectedWorkspaceName === undefined || options.selectedWorkspaceName === '')
      ? 'Select a workspace folder with “Debug80: Select Workspace Folder”.'
      : '';
  const statusRows = [
    options.projectName !== undefined ? `<p style="margin: 6px 0 0; opacity: 0.85;">Project: ${options.projectName}</p>` : '',
    options.targetName !== undefined ? `<p style="margin: 4px 0 0; opacity: 0.85;">Target: ${options.targetName}</p>` : '',
    options.entrySource !== undefined ? `<p style="margin: 4px 0 0; opacity: 0.85;">Entry: ${options.entrySource}</p>` : '',
  ]
    .filter((row) => row.length > 0)
    .join('');

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
  ${statusRows}
  <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px;">
    <button id="startDebug" style="padding: 6px 10px; font-size: 12px;">Start Debugging</button>
    <button id="selectProject" style="padding: 6px 10px; font-size: 12px;">Select Open Project</button>
    <button id="selectTarget" style="padding: 6px 10px; font-size: 12px;">Select Target</button>
    <button id="setEntrySource" style="padding: 6px 10px; font-size: 12px;">Set Entry Source</button>
  </div>
  ${selectionHint ? `<p style="opacity: 0.7;">${selectionHint}</p>` : ''}
  <script nonce="${nonce}">
    (function () {
      const vscode = acquireVsCodeApi();
      const bind = (id, type) => {
        const button = document.getElementById(id);
        if (button) {
          button.addEventListener('click', () => {
            vscode.postMessage({ type });
          });
        }
      };
      bind('startDebug', 'startDebug');
      bind('selectProject', 'selectProject');
      bind('selectTarget', 'selectTarget');
      bind('setEntrySource', 'setEntrySource');
    }());
  </script>
</body>
</html>`;
}
