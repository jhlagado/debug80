/**
 * @file PlatformViewProvider tests — platforms are loaded via the manifest
 * registry using the real TEC-1 / TEC-1G UI entry factories.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  executeCommand,
  resolveProjectStatusSummary,
  findProjectConfigPath,
  listProjectTargetChoices,
} = vi.hoisted(() => {
  const executeCommand = vi.fn(() => Promise.resolve(true));
  return {
    executeCommand,
    resolveProjectStatusSummary: vi.fn(() => ({
      projectName: 'demo',
      targetName: 'app',
      entrySource: 'src/main.asm',
    })),
    findProjectConfigPath: vi.fn(
      (folder: { uri: { fsPath: string } }) => `${folder.uri.fsPath}/.vscode/debug80.json`
    ),
    listProjectTargetChoices: vi.fn(() => [
      { name: 'app', description: 'src/main.asm', detail: 'src/main.asm' },
      { name: 'serial', description: 'src/serial.asm', detail: 'src/serial.asm' },
    ]),
  };
});

let workspaceFolders: Array<{ name: string; uri: { fsPath: string } }> | undefined;

vi.mock('vscode', () => {
  return {
    commands: { executeCommand },
    debug: { activeDebugSession: undefined },
    workspace: {
      get workspaceFolders() {
        return workspaceFolders;
      },
      fs: { readFile: vi.fn(), writeFile: vi.fn() },
    },
    window: {
      showErrorMessage: vi.fn(),
      showOpenDialog: vi.fn(),
      showSaveDialog: vi.fn(),
      withProgress: vi.fn(),
      showWarningMessage: vi.fn(),
      showInformationMessage: vi.fn(),
    },
    Uri: {
      joinPath: (base: { fsPath: string }, ...parts: string[]) => ({
        fsPath: [base.fsPath, ...parts].join('/'),
      }),
    },
    ProgressLocation: { Notification: 1 },
  };
});

vi.mock('../../src/extension/project-status', () => ({
  resolveProjectStatusSummary,
}));

vi.mock('../../src/extension/project-config', () => ({
  findProjectConfigPath,
}));

vi.mock('../../src/extension/project-target-selection', () => ({
  listProjectTargetChoices,
}));

import * as path from 'path';

import type * as vscode from 'vscode';
import { PlatformViewProvider } from '../../src/extension/platform-view-provider';
import type { Tec1UpdatePayload } from '../../src/platforms/tec1/types';
import type { Tec1gUpdatePayload } from '../../src/platforms/tec1g/types';
import { registerPlatformUi } from '../../src/extension/platform-view-manifest';
import {
  createTec1PlatformUiEntry,
  createTec1gPlatformUiEntry,
} from '../../src/extension/platform-ui-entries';

/** Extension root must contain built `webview/` assets (see panel-html). */
const extensionRoot = { fsPath: path.resolve(process.cwd()) } as vscode.Uri;

function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function createWebviewView(): vscode.WebviewView {
  const webview = {
    html: '',
    options: {} as vscode.WebviewOptions,
    onDidReceiveMessage: vi.fn(() => ({ dispose: vi.fn() })),
    postMessage: vi.fn(),
    cspSource: 'csp',
    asWebviewUri: vi.fn((uri: unknown) => uri),
  };
  return {
    webview,
    visible: true,
    show: vi.fn(),
    onDidDispose: vi.fn(() => ({ dispose: vi.fn() })),
    onDidChangeVisibility: vi.fn(() => ({ dispose: vi.fn() })),
  } as unknown as vscode.WebviewView;
}

describe('PlatformViewProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    workspaceFolders = undefined;
    registerPlatformUi(createTec1PlatformUiEntry());
    registerPlatformUi(createTec1gPlatformUiEntry());
  });

  it('renders Tec1 HTML when the webview resolves and the platform is Tec1', async () => {
    const provider = new PlatformViewProvider(extensionRoot);
    const webviewView = createWebviewView();

    provider.resolveWebviewView(
      webviewView,
      {} as vscode.WebviewViewResolveContext,
      {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
      } as vscode.CancellationToken
    );

    provider.setPlatform('tec1', undefined, { reveal: false, tab: 'ui' });
    await flushPromises();
    await flushPromises();

    expect(webviewView.webview.html.length).toBeGreaterThan(0);
  });

  it('does not clear Tec1 HTML when selecting the same platform again', async () => {
    const provider = new PlatformViewProvider(extensionRoot);
    const webviewView = createWebviewView();

    provider.resolveWebviewView(
      webviewView,
      {} as vscode.WebviewViewResolveContext,
      {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
      } as vscode.CancellationToken
    );

    provider.setPlatform('tec1', undefined, { reveal: false, tab: 'ui' });
    await flushPromises();
    await flushPromises();
    const first = webviewView.webview.html;

    provider.setPlatform('tec1', undefined, { reveal: false, tab: 'memory' });
    await flushPromises();
    await flushPromises();

    expect(webviewView.webview.html.length).toBeGreaterThan(0);
    expect(webviewView.webview.html).not.toBe(first);
  });

  it('posts project status updates while Tec1g is active', () => {
    const provider = new PlatformViewProvider(extensionRoot, {
      get: vi.fn(),
      update: vi.fn(),
    } as never);
    const webviewView = createWebviewView();

    provider.resolveWebviewView(
      webviewView,
      {} as vscode.WebviewViewResolveContext,
      {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
      } as vscode.CancellationToken
    );

    provider.setPlatform('tec1g', undefined, { reveal: false, tab: 'ui' });
    workspaceFolders = [
      {
        name: 'demo',
        uri: { fsPath: '/workspace/demo' },
      },
    ];
    provider.setSelectedWorkspace({
      name: 'demo',
      uri: { fsPath: '/workspace/demo' },
    } as never);
    provider.setHasProject(true);

    const postMessageCalls = (
      webviewView.webview as unknown as {
        postMessage: { mock: { calls: Array<[Record<string, unknown>]> } };
      }
    ).postMessage.mock.calls;
    let found = false;
    for (const [message] of postMessageCalls) {
      if (
        message.type === 'projectStatus' &&
        message.rootName === 'demo' &&
        message.rootPath === '/workspace/demo' &&
        message.hasProject === true &&
        message.targetName === 'app' &&
        message.entrySource === 'src/main.asm' &&
        Array.isArray(message.roots) &&
        message.roots.length === 1 &&
        message.roots[0]?.path === '/workspace/demo' &&
        Array.isArray(message.targets) &&
        message.targets.length === 2
      ) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  function getPostMessageCalls(webviewView: vscode.WebviewView): Array<[Record<string, unknown>]> {
    return (
      webviewView.webview as unknown as {
        postMessage: { mock: { calls: Array<[Record<string, unknown>]> } };
      }
    ).postMessage.mock.calls;
  }

  function findProjectStatusMessages(
    calls: Array<[Record<string, unknown>]>
  ): Array<Record<string, unknown>> {
    return calls.filter(([msg]) => msg.type === 'projectStatus').map(([msg]) => msg);
  }

  it('posts projectStatus when setPlatform switches to Tec1', () => {
    const provider = new PlatformViewProvider(extensionRoot, {
      get: vi.fn(),
      update: vi.fn(),
    } as never);
    const webviewView = createWebviewView();

    provider.resolveWebviewView(
      webviewView,
      {} as vscode.WebviewViewResolveContext,
      {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
      } as vscode.CancellationToken
    );

    workspaceFolders = [{ name: 'demo', uri: { fsPath: '/workspace/demo' } }];
    provider.setSelectedWorkspace({ name: 'demo', uri: { fsPath: '/workspace/demo' } } as never);
    provider.setHasProject(true);

    // Clear previous calls, then set platform
    (webviewView.webview.postMessage as ReturnType<typeof vi.fn>).mockClear();
    provider.setPlatform('tec1', undefined, { reveal: false, tab: 'ui' });

    const statusMessages = findProjectStatusMessages(getPostMessageCalls(webviewView));
    expect(statusMessages.length).toBeGreaterThanOrEqual(1);
    expect(statusMessages[0]?.rootName).toBe('demo');
  });

  it('posts projectStatus when the panel becomes visible with an active platform', () => {
    const provider = new PlatformViewProvider(extensionRoot, {
      get: vi.fn(),
      update: vi.fn(),
    } as never);
    const webviewView = createWebviewView();
    let visibilityCallback: (() => void) | undefined;
    (webviewView.onDidChangeVisibility as ReturnType<typeof vi.fn>).mockImplementation(
      (cb: () => void) => {
        visibilityCallback = cb;
        return { dispose: vi.fn() };
      }
    );

    provider.resolveWebviewView(
      webviewView,
      {} as vscode.WebviewViewResolveContext,
      {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
      } as vscode.CancellationToken
    );

    workspaceFolders = [{ name: 'demo', uri: { fsPath: '/workspace/demo' } }];
    provider.setSelectedWorkspace({ name: 'demo', uri: { fsPath: '/workspace/demo' } } as never);
    provider.setHasProject(true);
    provider.setPlatform('tec1g', undefined, { reveal: false, tab: 'ui' });

    // Simulate panel becoming visible
    (webviewView.webview.postMessage as ReturnType<typeof vi.fn>).mockClear();
    (webviewView as { visible: boolean }).visible = true;
    visibilityCallback?.();

    const statusMessages = findProjectStatusMessages(getPostMessageCalls(webviewView));
    expect(statusMessages.length).toBeGreaterThanOrEqual(1);
    expect(statusMessages[0]?.rootName).toBe('demo');
  });

  it('refreshProjectStatus posts projectStatus to the webview when a platform is active', () => {
    const provider = new PlatformViewProvider(extensionRoot, {
      get: vi.fn(),
      update: vi.fn(),
    } as never);
    const webviewView = createWebviewView();

    provider.resolveWebviewView(
      webviewView,
      {} as vscode.WebviewViewResolveContext,
      {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
      } as vscode.CancellationToken
    );

    workspaceFolders = [{ name: 'myproject', uri: { fsPath: '/workspace/myproject' } }];
    provider.setSelectedWorkspace({
      name: 'myproject',
      uri: { fsPath: '/workspace/myproject' },
    } as never);
    provider.setHasProject(true);
    provider.setPlatform('tec1', undefined, { reveal: false, tab: 'ui' });

    // Clear and trigger a refresh
    (webviewView.webview.postMessage as ReturnType<typeof vi.fn>).mockClear();
    provider.refreshProjectStatus();

    const statusMessages = findProjectStatusMessages(getPostMessageCalls(webviewView));
    expect(statusMessages.length).toBe(1);
    expect(statusMessages[0]?.rootName).toBe('myproject');
    expect(statusMessages[0]?.hasProject).toBe(true);
  });

  it('setSelectedWorkspace triggers projectStatus update when platform is active', () => {
    const provider = new PlatformViewProvider(extensionRoot, {
      get: vi.fn(),
      update: vi.fn(),
    } as never);
    const webviewView = createWebviewView();

    provider.resolveWebviewView(
      webviewView,
      {} as vscode.WebviewViewResolveContext,
      {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
      } as vscode.CancellationToken
    );

    provider.setPlatform('tec1g', undefined, { reveal: false, tab: 'ui' });

    workspaceFolders = [
      { name: 'proj-a', uri: { fsPath: '/workspace/proj-a' } },
      { name: 'proj-b', uri: { fsPath: '/workspace/proj-b' } },
    ];

    // Clear and switch workspace
    (webviewView.webview.postMessage as ReturnType<typeof vi.fn>).mockClear();
    provider.setSelectedWorkspace({
      name: 'proj-b',
      uri: { fsPath: '/workspace/proj-b' },
    } as never);

    const statusMessages = findProjectStatusMessages(getPostMessageCalls(webviewView));
    expect(statusMessages.length).toBeGreaterThanOrEqual(1);
    expect(statusMessages[0]?.rootName).toBe('proj-b');
  });

  it('setHasProject triggers projectStatus update when platform is active', () => {
    const provider = new PlatformViewProvider(extensionRoot, {
      get: vi.fn(),
      update: vi.fn(),
    } as never);
    const webviewView = createWebviewView();

    provider.resolveWebviewView(
      webviewView,
      {} as vscode.WebviewViewResolveContext,
      {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
      } as vscode.CancellationToken
    );

    workspaceFolders = [{ name: 'demo', uri: { fsPath: '/workspace/demo' } }];
    provider.setSelectedWorkspace({ name: 'demo', uri: { fsPath: '/workspace/demo' } } as never);
    provider.setPlatform('tec1', undefined, { reveal: false, tab: 'ui' });

    // Clear and toggle hasProject
    (webviewView.webview.postMessage as ReturnType<typeof vi.fn>).mockClear();
    provider.setHasProject(true);

    const statusMessages = findProjectStatusMessages(getPostMessageCalls(webviewView));
    expect(statusMessages.length).toBeGreaterThanOrEqual(1);
    expect(statusMessages[0]?.hasProject).toBe(true);
  });

  it('refreshIdleView triggers projectStatus update when platform is active', () => {
    const provider = new PlatformViewProvider(extensionRoot, {
      get: vi.fn(),
      update: vi.fn(),
    } as never);
    const webviewView = createWebviewView();

    provider.resolveWebviewView(
      webviewView,
      {} as vscode.WebviewViewResolveContext,
      {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
      } as vscode.CancellationToken
    );

    workspaceFolders = [{ name: 'demo', uri: { fsPath: '/workspace/demo' } }];
    provider.setSelectedWorkspace({ name: 'demo', uri: { fsPath: '/workspace/demo' } } as never);
    provider.setHasProject(true);
    provider.setPlatform('tec1g', undefined, { reveal: false, tab: 'ui' });

    // Clear and call refreshIdleView (used by commands after selection changes)
    (webviewView.webview.postMessage as ReturnType<typeof vi.fn>).mockClear();
    provider.refreshIdleView();

    const statusMessages = findProjectStatusMessages(getPostMessageCalls(webviewView));
    expect(statusMessages.length).toBe(1);
    expect(statusMessages[0]?.rootName).toBe('demo');
    expect(statusMessages[0]?.targetName).toBe('app');
    expect(statusMessages[0]?.entrySource).toBe('src/main.asm');
  });

  it('posts sessionStatus updates to the active webview', () => {
    const provider = new PlatformViewProvider(extensionRoot, {
      get: vi.fn(),
      update: vi.fn(),
    } as never);
    const webviewView = createWebviewView();

    provider.resolveWebviewView(
      webviewView,
      {} as vscode.WebviewViewResolveContext,
      {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
      } as vscode.CancellationToken
    );
    provider.setPlatform('tec1g', undefined, { reveal: false, tab: 'ui' });

    (webviewView.webview.postMessage as ReturnType<typeof vi.fn>).mockClear();
    provider.setSessionStatus('running');

    const statusMessages = getPostMessageCalls(webviewView).filter(
      ([msg]) => msg.type === 'sessionStatus'
    );
    expect(statusMessages).toHaveLength(1);
    expect(statusMessages[0]?.[0]).toEqual({
      type: 'sessionStatus',
      status: 'running',
    });
  });

  it('returns the session badge to Not running when the active session terminates', () => {
    const provider = new PlatformViewProvider(extensionRoot, {
      get: vi.fn(),
      update: vi.fn(),
    } as never);
    const webviewView = createWebviewView();

    provider.resolveWebviewView(
      webviewView,
      {} as vscode.WebviewViewResolveContext,
      {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
      } as vscode.CancellationToken
    );
    provider.setPlatform('tec1g', { id: 'session-1' } as never, { reveal: false, tab: 'ui' });

    (webviewView.webview.postMessage as ReturnType<typeof vi.fn>).mockClear();
    provider.handleSessionTerminated('session-1');

    const statusMessages = getPostMessageCalls(webviewView).filter(
      ([msg]) => msg.type === 'sessionStatus'
    );
    expect(statusMessages).toHaveLength(1);
    expect(statusMessages[0]?.[0]).toEqual({
      type: 'sessionStatus',
      status: 'not running',
    });
  });

  it('routes startDebug messages to the existing start command', async () => {
    const provider = new PlatformViewProvider(extensionRoot, {
      get: vi.fn(),
      update: vi.fn(),
    } as never);
    const webviewView = createWebviewView();

    provider.resolveWebviewView(
      webviewView,
      {} as vscode.WebviewViewResolveContext,
      {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
      } as vscode.CancellationToken
    );

    const handler = (webviewView.webview.onDidReceiveMessage as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as ((msg: { type?: string }) => Promise<void>) | undefined;
    expect(handler).toBeTypeOf('function');

    await handler?.({ type: 'startDebug' });

    expect(executeCommand).toHaveBeenCalledWith('debug80.startDebug', undefined);
  });

  it('routes startDebug with rootPath to the start command args', async () => {
    const provider = new PlatformViewProvider(extensionRoot, {
      get: vi.fn(),
      update: vi.fn(),
    } as never);
    const webviewView = createWebviewView();

    provider.resolveWebviewView(
      webviewView,
      {} as vscode.WebviewViewResolveContext,
      {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
      } as vscode.CancellationToken
    );

    const handler = (webviewView.webview.onDidReceiveMessage as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as ((msg: { type?: string; rootPath?: string }) => Promise<void>) | undefined;
    expect(handler).toBeTypeOf('function');

    await handler?.({ type: 'startDebug', rootPath: '/workspace/demo' });

    expect(executeCommand).toHaveBeenCalledWith('debug80.startDebug', {
      rootPath: '/workspace/demo',
    });
  });

  it('routes createProject messages with a root path to the create command', async () => {
    const provider = new PlatformViewProvider(extensionRoot, {
      get: vi.fn(),
      update: vi.fn(),
    } as never);
    const webviewView = createWebviewView();

    provider.resolveWebviewView(
      webviewView,
      {} as vscode.WebviewViewResolveContext,
      {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
      } as vscode.CancellationToken
    );

    const handler = (webviewView.webview.onDidReceiveMessage as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as ((msg: { type?: string; rootPath?: string }) => Promise<void>) | undefined;
    expect(handler).toBeTypeOf('function');

    await handler?.({ type: 'createProject', rootPath: '/workspace/empty-root' });

    expect(executeCommand).toHaveBeenCalledWith('debug80.createProject', {
      rootPath: '/workspace/empty-root',
    });
  });

  it('posts Tec1 update payload with contract-critical fields', async () => {
    const provider = new PlatformViewProvider(extensionRoot);
    const webviewView = createWebviewView();
    await provider.resolveWebviewView(
      webviewView,
      {} as vscode.WebviewViewResolveContext,
      {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
      } as vscode.CancellationToken
    );
    provider.setPlatform('tec1', undefined, { reveal: false, tab: 'ui' });

    (webviewView.webview.postMessage as ReturnType<typeof vi.fn>).mockClear();
    const payload: Tec1UpdatePayload = {
      digits: [0, 0, 0, 0, 0, 0],
      matrix: [0, 0, 0, 0, 0, 0, 0, 0],
      speaker: 1,
      speedMode: 'fast',
      lcd: [0],
      speakerHz: 440,
    };
    provider.updateTec1(payload);

    const updateCall = getPostMessageCalls(webviewView).find(([msg]) => msg.type === 'update');
    expect(updateCall?.[0]).toMatchObject({
      type: 'update',
      digits: payload.digits,
      matrix: payload.matrix,
      speedMode: payload.speedMode,
      lcd: payload.lcd,
      speakerHz: payload.speakerHz,
    });
  });

  it('posts Tec1g update payload with matrix and glcd contract fields', async () => {
    const provider = new PlatformViewProvider(extensionRoot);
    const webviewView = createWebviewView();
    await provider.resolveWebviewView(
      webviewView,
      {} as vscode.WebviewViewResolveContext,
      {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
      } as vscode.CancellationToken
    );
    provider.setPlatform('tec1g', undefined, { reveal: false, tab: 'ui' });

    (webviewView.webview.postMessage as ReturnType<typeof vi.fn>).mockClear();
    const payload: Tec1gUpdatePayload = {
      digits: [0, 0, 0, 0, 0, 0],
      matrix: [0, 0, 0, 0, 0, 0, 0, 0],
      glcd: [0, 0],
      speaker: 1,
      speedMode: 'fast',
      lcd: [0],
      matrixGreen: [1],
      matrixBlue: [2],
      speakerHz: 880,
    };
    provider.updateTec1g(payload);

    const updateCall = getPostMessageCalls(webviewView).find(([msg]) => msg.type === 'update');
    const update = updateCall?.[0];
    expect(update?.type).toBe('update');
    expect(update?.digits).toEqual(payload.digits);
    expect(update?.matrix).toEqual(payload.matrix);
    expect(Array.isArray(update?.matrixGreen)).toBe(true);
    expect((update?.matrixGreen as number[] | undefined)?.[0]).toBe(1);
    expect(Array.isArray(update?.matrixBlue)).toBe(true);
    expect((update?.matrixBlue as number[] | undefined)?.[0]).toBe(2);
    expect(update?.glcd).toEqual(payload.glcd);
    expect(update?.speedMode).toBe(payload.speedMode);
    expect(update?.speakerHz).toBe(payload.speakerHz);
  });

  it('routes configureProject messages to the config tab in the sidebar', async () => {
    const provider = new PlatformViewProvider(extensionRoot, {
      get: vi.fn(),
      update: vi.fn(),
    } as never);
    const webviewView = createWebviewView();

    await provider.resolveWebviewView(
      webviewView,
      {} as vscode.WebviewViewResolveContext,
      {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
      } as vscode.CancellationToken
    );
    provider.setPlatform('tec1', undefined, { reveal: false, tab: 'ui' });

    const handler = (webviewView.webview.onDidReceiveMessage as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as ((msg: { type?: string }) => Promise<void>) | undefined;
    expect(handler).toBeTypeOf('function');

    (webviewView.webview.postMessage as ReturnType<typeof vi.fn>).mockClear();
    await handler?.({ type: 'configureProject' });

    const tabMessages = getPostMessageCalls(webviewView).filter(([msg]) => msg.type === 'selectTab');
    expect(tabMessages).toHaveLength(1);
    expect(tabMessages[0]?.[0]).toMatchObject({ type: 'selectTab', tab: 'config' });
  });

  it('routes openWorkspaceFolder messages to vscode open folder command', async () => {
    const provider = new PlatformViewProvider(extensionRoot, {
      get: vi.fn(),
      update: vi.fn(),
    } as never);
    const webviewView = createWebviewView();

    provider.resolveWebviewView(
      webviewView,
      {} as vscode.WebviewViewResolveContext,
      {
        isCancellationRequested: false,
        onCancellationRequested: vi.fn(),
      } as vscode.CancellationToken
    );

    const handler = (webviewView.webview.onDidReceiveMessage as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0] as ((msg: { type?: string }) => Promise<void>) | undefined;
    expect(handler).toBeTypeOf('function');

    await handler?.({ type: 'openWorkspaceFolder' });

    expect(executeCommand).toHaveBeenCalledWith('vscode.openFolder');
  });
});
