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
  <p style="opacity: 0.7;">Open the Home tab to choose a root and target.</p>
</body>
</html>`;
  }

  const selectedLabel = options.selectedWorkspaceName ?? 'Workspace';
  const selectionHint =
    options.multiRoot &&
    (options.selectedWorkspaceName === undefined || options.selectedWorkspaceName === '')
      ? 'Select a workspace root with “Debug80: Select Workspace Folder”.'
      : '';
  const statusRows = [
    options.projectName !== undefined ? `<p style="margin: 6px 0 0; opacity: 0.85;">Root: ${options.projectName}</p>` : '',
    options.targetName !== undefined ? `<p style="margin: 4px 0 0; opacity: 0.85;">Target: ${options.targetName}</p>` : '',
    options.entrySource !== undefined ? `<p style="margin: 4px 0 0; opacity: 0.85;">Program: ${options.entrySource}</p>` : '',
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
  <p style="opacity: 0.7;">Configured root detected (${selectedLabel}). Open the Home tab to choose a target.</p>
  ${statusRows}
  ${selectionHint ? `<p style="opacity: 0.7;">${selectionHint}</p>` : ''}
</body>
</html>`;
}
