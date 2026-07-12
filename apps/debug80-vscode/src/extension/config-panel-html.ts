/**
 * @file HTML generation for the Debug80 project configuration panel.
 */

import { randomBytes } from 'crypto';
import { resolveProjectPlatform } from './project-config';
import type { ProjectConfig } from '../debug/session/types';
import { TEC1_APP_START_DEFAULT } from '../platforms/tec1/constants';
import {
  TEC1G_APP_START_DEFAULT,
  TEC1G_RAM_END,
  TEC1G_RAM_START,
  TEC1G_ROM0_END,
  TEC1G_ROM0_START,
  TEC1G_ROM1_END,
  TEC1G_ROM1_START,
} from '../platforms/tec1g/constants';

export function createSimplePlatformDefaults(): Record<string, unknown> {
  return {
    regions: [
      { start: 0, end: 2047, kind: 'rom' },
      { start: 2048, end: 65535, kind: 'ram' },
    ],
    appStart: 0x0900,
    entry: 0,
  };
}

export function createTec1PlatformDefaults(): Record<string, unknown> {
  return {
    regions: [
      { start: 0, end: 2047, kind: 'rom' },
      { start: 2048, end: 4095, kind: 'ram' },
    ],
    appStart: TEC1_APP_START_DEFAULT,
    entry: 0,
  };
}

export function createTec1gPlatformDefaults(): Record<string, unknown> {
  return {
    regions: [
      { start: TEC1G_ROM0_START, end: TEC1G_ROM0_END, kind: 'rom' },
      { start: TEC1G_RAM_START, end: TEC1G_RAM_END, kind: 'ram' },
      { start: TEC1G_ROM1_START, end: TEC1G_ROM1_END, kind: 'rom' },
    ],
    appStart: TEC1G_APP_START_DEFAULT,
    entry: 0,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function createNonce(): string {
  return randomBytes(16).toString('base64');
}

export function buildProjectConfigPanelHtml(
  config: ProjectConfig,
  cspSource: string,
  nonce: string
): string {
  const currentPlatform = resolveProjectPlatform(config) ?? 'simple';
  const targetNames = Object.keys(config.targets ?? {});
  const currentDefault = config.defaultTarget ?? config.target ?? targetNames[0] ?? '';
  const platformOptions = ['simple', 'tec1', 'tec1g']
    .map(
      (platform) =>
        `<option value="${platform}"${
          platform === currentPlatform ? ' selected' : ''
        }>${platform}</option>`
    )
    .join('');
  const targetOptions = targetNames
    .map(
      (targetName) =>
        `<option value="${escapeHtml(targetName)}"${
          targetName === currentDefault ? ' selected' : ''
        }>${escapeHtml(targetName)}</option>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <title>Debug80 Project Config</title>
  <style nonce="${nonce}">
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 16px; }
    h2 { margin-top: 0; }
    .row { margin-bottom: 12px; display: flex; flex-direction: column; gap: 6px; max-width: 480px; }
    label { font-size: 12px; opacity: 0.9; }
    select, button { padding: 6px 8px; font: inherit; }
    .hint { font-size: 12px; opacity: 0.8; margin-top: 8px; max-width: 600px; }
  </style>
</head>
<body>
  <h2>Debug80 Project Configuration</h2>
  <div class="row">
    <label for="platform">Project Default Platform</label>
    <select id="platform">${platformOptions}</select>
  </div>
  <div class="row">
    <label for="defaultTarget">Default Target</label>
    <select id="defaultTarget">${targetOptions}</select>
  </div>
  <button id="save">Save Configuration</button>
  <div class="hint">This panel edits project-level settings only. Per-target platform overrides remain available in target configuration flows.</div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('save')?.addEventListener('click', () => {
      const platform = document.getElementById('platform')?.value ?? '';
      const defaultTarget = document.getElementById('defaultTarget')?.value ?? '';
      vscode.postMessage({ type: 'saveProjectConfig', platform, defaultTarget });
    });
  </script>
</body>
</html>`;
}
