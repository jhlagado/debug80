/**
 * @file Platform view webview handler construction tests.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlatformViewWebviewHandler } from '../../src/extension/platform-view-webview-handler';
import { createPlatformViewSessionState } from '../../src/extension/platform-view-session-state';
import { createSerialBuffer } from '../../src/extension/platform-view-serial-state';
import type { PlatformViewBundle } from '../../src/extension/platform-view-registry';

const { executeCommand } = vi.hoisted(() => ({
  executeCommand: vi.fn(() => Promise.resolve(undefined)),
}));

vi.mock('vscode', () => ({
  commands: { executeCommand },
  debug: { activeDebugSession: undefined },
}));

vi.mock('../../src/extension/platform-view-serial-actions', () => ({
  handlePlatformSerialSave: vi.fn(() => Promise.resolve(undefined)),
  handlePlatformSerialSendFile: vi.fn(() => Promise.resolve(undefined)),
}));

describe('platform-view webview handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('routes VS Code command messages through the command palette ids', async () => {
    const handler = createPlatformViewWebviewHandler(createContext());

    await handler({ type: 'createProject', rootPath: '/workspace/demo', platform: 'tec1g' });
    await handler({ type: 'selectProject', rootPath: '/workspace/demo' });
    await handler({ type: 'selectTarget', rootPath: '/workspace/demo', targetName: 'app' });
    await handler({ type: 'restartDebug' });
    await handler({ type: 'setEntrySource' });
    await handler({ type: 'startDebug', rootPath: '/workspace/demo' });
    await handler({ type: 'openWorkspaceFolder' });

    expect(executeCommand).toHaveBeenCalledWith('debug80.createProject', {
      rootPath: '/workspace/demo',
      platform: 'tec1g',
    });
    expect(executeCommand).toHaveBeenCalledWith('debug80.selectWorkspaceFolder', {
      rootPath: '/workspace/demo',
    });
    expect(executeCommand).toHaveBeenCalledWith('debug80.selectTarget', {
      rootPath: '/workspace/demo',
      targetName: 'app',
    });
    expect(executeCommand).toHaveBeenCalledWith('debug80.restartDebug');
    expect(executeCommand).toHaveBeenCalledWith('debug80.setEntrySource');
    expect(executeCommand).toHaveBeenCalledWith('debug80.startDebug', {
      rootPath: '/workspace/demo',
    });
    expect(executeCommand).toHaveBeenCalledWith('debug80.addWorkspaceFolder');
  });

  it('routes provider-owned state callbacks without going through commands', async () => {
    const context = createContext();
    const handler = createPlatformViewWebviewHandler(context);

    await handler({ type: 'saveProjectConfig', platform: 'tec1' });
    await handler({ type: 'setStopOnEntry', stopOnEntry: true });
    await handler({
      type: 'saveTec1gPanelVisibility',
      targetName: 'main',
      visibility: { glcd: false },
    });

    expect(context.handleSaveProjectConfig).toHaveBeenCalledWith('tec1');
    expect(context.handleSetStopOnEntry).toHaveBeenCalledWith(true);
    expect(context.persistTec1gPanelVisibility).toHaveBeenCalledWith({ glcd: false }, 'main');
  });

  it('clears the active platform serial buffer', async () => {
    const bundle = createBundle();
    bundle.state.serialBuffer.text = 'hello';
    const handler = createPlatformViewWebviewHandler(
      createContext({ currentPlatform: () => 'tec1', getActiveBundle: () => bundle })
    );

    await handler({ type: 'serialClear' });

    expect(bundle.state.serialBuffer.text).toBe('');
  });

  it('forwards platform payloads with runtime context', async () => {
    const bundle = createBundle();
    const handler = createPlatformViewWebviewHandler(
      createContext({ currentPlatform: () => 'tec1g', getActiveBundle: () => bundle })
    );

    await handler({ type: 'selectTab', tab: 'memory' });

    expect(bundle.modules.handleMessage).toHaveBeenCalledWith(
      { type: 'selectTab', tab: 'memory' },
      expect.objectContaining({
        autoRefreshMs: 500,
        refreshController: bundle.state.refreshController,
        memoryViews: bundle.state.memoryViews,
      })
    );
    const messageContext = (bundle.modules.handleMessage as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[1] as { setActiveTab: (tab: 'memory') => void; getActiveTab: () => string };
    messageContext.setActiveTab('memory');
    expect(messageContext.getActiveTab()).toBe('memory');
  });
});

function createContext(
  overrides: Partial<Parameters<typeof createPlatformViewWebviewHandler>[0]> = {}
): Parameters<typeof createPlatformViewWebviewHandler>[0] {
  return {
    currentPlatform: () => 'simple',
    sessionState: createPlatformViewSessionState(),
    getActiveBundle: () => undefined,
    handleSaveProjectConfig: vi.fn(),
    handleSetStopOnEntry: vi.fn(),
    persistTec1gPanelVisibility: vi.fn(),
    isPanelVisible: () => true,
    ...overrides,
  };
}

function createBundle(): PlatformViewBundle {
  return {
    modules: {
      getHtml: vi.fn(),
      createUiState: vi.fn(),
      resetUiState: vi.fn(),
      applyUpdate: vi.fn(),
      createMemoryViewState: vi.fn(),
      handleMessage: vi.fn(() => Promise.resolve(undefined)),
      buildUpdateMessage: vi.fn(),
      buildClearMessage: vi.fn(),
      snapshotCommand: 'debug80/memorySnapshot',
    },
    state: {
      activeTab: 'ui',
      uiState: {},
      hasPostedRuntimeUpdate: false,
      serialBuffer: createSerialBuffer(),
      memoryViews: {},
      refreshController: {} as PlatformViewBundle['state']['refreshController'],
    },
  } as PlatformViewBundle;
}
