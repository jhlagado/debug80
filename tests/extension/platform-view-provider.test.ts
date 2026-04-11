/**
 * @file PlatformViewProvider tests (static Tec1/Tec1g UI modules; no dynamic loadPlatformUi).
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { executeCommand, resolveProjectStatusSummary } = vi.hoisted(() => ({
  executeCommand: vi.fn(() => Promise.resolve()),
  resolveProjectStatusSummary: vi.fn(() => ({
    projectName: 'demo',
    targetName: 'app',
    entrySource: 'src/main.asm',
  })),
}));

vi.mock('vscode', () => {
  return {
    commands: { executeCommand },
    debug: { activeDebugSession: undefined },
    workspace: {
      workspaceFolders: undefined,
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

import * as path from 'path';

import type * as vscode from 'vscode';
import { PlatformViewProvider } from '../../src/extension/platform-view-provider';

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
  });

  it('renders Tec1 HTML when the webview resolves and the platform is Tec1', async () => {
    const provider = new PlatformViewProvider(extensionRoot);
    const webviewView = createWebviewView();

    provider.resolveWebviewView(webviewView, {} as vscode.WebviewViewResolveContext, {
      isCancellationRequested: false,
      onCancellationRequested: vi.fn(),
    } as vscode.CancellationToken);

    provider.setPlatform('tec1', undefined, { reveal: false, tab: 'ui' });
    await flushPromises();
    await flushPromises();

    expect(webviewView.webview.html.length).toBeGreaterThan(0);
  });

  it('does not clear Tec1 HTML when selecting the same platform again', async () => {
    const provider = new PlatformViewProvider(extensionRoot);
    const webviewView = createWebviewView();

    provider.resolveWebviewView(webviewView, {} as vscode.WebviewViewResolveContext, {
      isCancellationRequested: false,
      onCancellationRequested: vi.fn(),
    } as vscode.CancellationToken);

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

    provider.resolveWebviewView(webviewView, {} as vscode.WebviewViewResolveContext, {
      isCancellationRequested: false,
      onCancellationRequested: vi.fn(),
    } as vscode.CancellationToken);

    provider.setPlatform('tec1g', undefined, { reveal: false, tab: 'ui' });
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
        message.hasProject === true &&
        message.targetName === 'app' &&
        message.entrySource === 'src/main.asm'
      ) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });
});
