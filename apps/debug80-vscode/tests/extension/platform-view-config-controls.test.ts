/**
 * @file Platform view config control helper tests.
 */

import { existsSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as vscode from 'vscode';
import {
  normalizePlatformId,
  resolveSaveProjectConfigAction,
} from '../../src/extension/platform-view-config-controls';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    existsSync: vi.fn(),
  };
});

describe('platform-view-config-controls', () => {
  beforeEach(() => {
    vi.mocked(existsSync).mockReset();
  });

  it('normalizes supported platform ids', () => {
    expect(normalizePlatformId(' SIMPLE ')).toBe('simple');
    expect(normalizePlatformId('Tec1')).toBe('tec1');
    expect(normalizePlatformId('tec1g')).toBe('tec1g');
    expect(normalizePlatformId('unknown')).toBeUndefined();
  });

  it('reports no workspace when no selected workspace can be resolved', () => {
    expect(resolveAction('tec1g', undefined)).toEqual({ kind: 'noWorkspace' });
  });

  it('selects a platform for uninitialized workspaces', () => {
    vi.mocked(existsSync).mockReturnValue(false);

    expect(resolveAction('tec1g')).toEqual({ kind: 'selectPlatform', platform: 'tec1g' });
  });

  it('rejects invalid platform values for uninitialized workspaces', () => {
    vi.mocked(existsSync).mockReturnValue(false);

    expect(resolveAction('bad')).toEqual({ kind: 'invalidPlatform' });
  });

  it('keeps initialized projects unchanged', () => {
    vi.mocked(existsSync).mockImplementation((candidate) =>
      String(candidate).replace(/\\/g, '/').endsWith('/debug80.json')
    );

    expect(resolveAction('simple')).toEqual({ kind: 'projectAlreadyInitialized' });
  });
});

function resolveAction(
  platform: string,
  ...folderOverride: [vscode.WorkspaceFolder | undefined] | []
): ReturnType<typeof resolveSaveProjectConfigAction> {
  const selectedFolder =
    folderOverride.length === 0 ? createFolder('/workspace/demo') : folderOverride[0];

  return resolveSaveProjectConfigAction(platform, {
    resolveWorkspace: () => selectedFolder,
  });
}

function createFolder(fsPath: string): vscode.WorkspaceFolder {
  return { name: 'demo', uri: { fsPath } } as vscode.WorkspaceFolder;
}
