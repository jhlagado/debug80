/**
 * @file Project/config control helpers for the Debug80 platform view.
 */

import * as vscode from 'vscode';
import type { PlatformId } from '../contracts/platform-view';
import { findProjectConfigPath } from './project-config';

export type SaveProjectConfigResult =
  | { kind: 'noWorkspace' }
  | { kind: 'selectPlatform'; platform: PlatformId }
  | { kind: 'invalidPlatform' }
  | { kind: 'projectAlreadyInitialized' };

export interface SaveProjectConfigContext {
  resolveWorkspace: () => vscode.WorkspaceFolder | undefined;
}

/**
 * Normalizes user/webview platform strings to supported platform ids.
 */
export function normalizePlatformId(platform: string): PlatformId | undefined {
  const normalized = platform.trim().toLowerCase();
  if (normalized === 'simple' || normalized === 'tec1' || normalized === 'tec1g') {
    return normalized;
  }
  return undefined;
}

/**
 * Resolves how the provider should respond to the webview's saveProjectConfig action.
 */
export function resolveSaveProjectConfigAction(
  platform: string,
  ctx: SaveProjectConfigContext
): SaveProjectConfigResult {
  const folder = ctx.resolveWorkspace();
  if (folder === undefined) {
    return { kind: 'noWorkspace' };
  }
  const configPath = findProjectConfigPath(folder);
  if (configPath !== undefined) {
    return { kind: 'projectAlreadyInitialized' };
  }
  const normalized = normalizePlatformId(platform);
  if (normalized === undefined) {
    return { kind: 'invalidPlatform' };
  }
  return { kind: 'selectPlatform', platform: normalized };
}
