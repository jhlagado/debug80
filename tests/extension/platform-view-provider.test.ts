/**
 * @file PlatformViewProvider lazy-loading tests.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { executeCommand, showErrorMessage, loadPlatformUi } = vi.hoisted(() => ({
  executeCommand: vi.fn(() => Promise.resolve()),
  showErrorMessage: vi.fn(),
  loadPlatformUi: vi.fn(),
}));

vi.mock('vscode', () => {
  return {
    commands: { executeCommand },
    debug: { activeDebugSession: undefined },
    workspace: { workspaceFolders: undefined },
    window: { showErrorMessage },
  };
});

vi.mock('../../src/extension/platform-view-manifest', () => {
  return {
    loadPlatformUi,
  };
});

import { PlatformViewProvider } from '../../src/extension/platform-view-provider';

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createModules() {
  return {
    getHtml: vi.fn(() => '<html></html>'),
    createUiState: vi.fn(() => ({ digits: [] })),
    resetUiState: vi.fn(),
    applyUpdate: vi.fn(() => ({ digits: [] })),
    createMemoryViewState: vi.fn(() => ({
      viewModes: { a: 'pc', b: 'sp', c: 'hl', d: 'de' },
      viewAfter: { a: 16, b: 16, c: 16, d: 16 },
      viewAddress: { a: undefined, b: undefined, c: undefined, d: undefined },
    })),
    handleMessage: vi.fn(() => Promise.resolve(undefined)),
    buildUpdateMessage: vi.fn(() => ({ type: 'update' })),
    buildClearMessage: vi.fn(() => ({ type: 'update' })),
    snapshotCommand: 'debug80/tec1MemorySnapshot' as const,
  };
}

describe('PlatformViewProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lazy-loads platform ui state on first selection', async () => {
    const modules = createModules();
    loadPlatformUi.mockResolvedValue(modules);

    const provider = new PlatformViewProvider({ fsPath: '/tmp/debug80' } as never);

    expect(loadPlatformUi).not.toHaveBeenCalled();
    expect(modules.createUiState).not.toHaveBeenCalled();

    provider.setPlatform('tec1', undefined, { reveal: false, tab: 'ui' });
    await flushPromises();
    await flushPromises();

    expect(loadPlatformUi).toHaveBeenCalledWith('tec1');
    expect(modules.createUiState).toHaveBeenCalledTimes(1);
  });

  it('reuses loaded platform state across repeated selections', async () => {
    const modules = createModules();
    loadPlatformUi.mockResolvedValue(modules);

    const provider = new PlatformViewProvider({ fsPath: '/tmp/debug80' } as never);

    provider.setPlatform('tec1', undefined, { reveal: false, tab: 'ui' });
    await flushPromises();
    await flushPromises();
    provider.setPlatform('tec1', undefined, { reveal: false, tab: 'memory' });
    await flushPromises();
    await flushPromises();

    expect(loadPlatformUi).toHaveBeenCalledTimes(1);
    expect(modules.createUiState).toHaveBeenCalledTimes(1);
  });
});