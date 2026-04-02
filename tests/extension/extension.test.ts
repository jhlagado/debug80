/**
 * @file Extension activation tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const registerCommand = vi.fn(() => ({ dispose: vi.fn() }));
const registerDebugAdapterDescriptorFactory = vi.fn(() => ({ dispose: vi.fn() }));
const onDidStartDebugSession = vi.fn(() => ({ dispose: vi.fn() }));
const onDidTerminateDebugSession = vi.fn(() => ({ dispose: vi.fn() }));
const onDidReceiveDebugSessionCustomEvent = vi.fn(() => ({ dispose: vi.fn() }));
let onDidOpenHandler: ((doc: unknown) => void) | undefined;
const setTextDocumentLanguage = vi.fn((doc: unknown, languageId: string) =>
  Promise.resolve({ doc, languageId })
);
const getLanguages = vi.fn(() => Promise.resolve(['z80-asm', 'zax']));

vi.mock('vscode', () => ({
  ViewColumn: { One: 1, Two: 2, Nine: 9 },
  commands: { registerCommand, executeCommand: vi.fn() },
  debug: {
    registerDebugAdapterDescriptorFactory,
    onDidStartDebugSession,
    onDidTerminateDebugSession,
    onDidReceiveDebugSessionCustomEvent,
    activeDebugSession: undefined,
  },
  workspace: {
    onDidOpenTextDocument: vi.fn((handler: (doc: unknown) => void) => {
      onDidOpenHandler = handler;
      return { dispose: vi.fn() };
    }),
    textDocuments: [
      { uri: { path: '/tmp/test.asm', scheme: 'file' }, languageId: 'plaintext' },
    ],
    workspaceFolders: undefined,
    openTextDocument: vi.fn(),
    createFileSystemWatcher: vi.fn(() => ({
      onDidCreate: vi.fn(),
      onDidDelete: vi.fn(),
      onDidChange: vi.fn(),
      dispose: vi.fn(),
    })),
    onDidChangeWorkspaceFolders: vi.fn(() => ({ dispose: vi.fn() })),
  },
  languages: { getLanguages, setTextDocumentLanguage },
  window: {
    showErrorMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    showInputBox: vi.fn(),
    showQuickPick: vi.fn(),
    showTextDocument: vi.fn(),
    onDidChangeActiveTextEditor: vi.fn(() => ({ dispose: vi.fn() })),
    visibleTextEditors: [],
    tabGroups: { all: [] },
    registerWebviewViewProvider: vi.fn(() => ({ dispose: vi.fn() })),
    createOutputChannel: vi.fn(() => ({ appendLine: vi.fn(), dispose: vi.fn() })),
    createWebviewPanel: vi.fn(() => ({
      webview: { html: '' },
      onDidDispose: vi.fn(),
      onDidChangeViewState: vi.fn(),
      reveal: vi.fn(),
      dispose: vi.fn(),
      visible: true,
    })),
  },
  Uri: {
    file: (value: string) => ({ fsPath: value }),
    joinPath: (base: { fsPath: string }, ...parts: string[]) => ({
      fsPath: [base.fsPath, ...parts].join('/'),
    }),
  },
}));

describe('extension activation', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    onDidOpenHandler = undefined;
  });

  it('registers commands and adapter factory', async () => {
    const extension = (await import('../../src/extension/extension')) as {
      activate: (context: { subscriptions: Array<{ dispose: () => void }> }) => void;
    };
    const context = {
      subscriptions: [] as Array<{ dispose: () => void }>,
      workspaceState: { get: vi.fn(), update: vi.fn() },
      extensionUri: { fsPath: '/tmp/debug80' },
    };
    extension.activate(context);

    expect(registerDebugAdapterDescriptorFactory).toHaveBeenCalledWith('z80', expect.anything());
    expect(registerCommand).toHaveBeenCalledWith('debug80.createProject', expect.anything());
    expect(registerCommand).toHaveBeenCalledWith('debug80.selectWorkspaceFolder', expect.anything());
    expect(registerCommand).toHaveBeenCalledWith('debug80.terminalInput', expect.anything());
    expect(registerCommand).toHaveBeenCalledWith('debug80.openTerminal', expect.anything());
    expect(registerCommand).toHaveBeenCalledWith('debug80.openTec1', expect.anything());
    expect(registerCommand).toHaveBeenCalledWith('debug80.openTec1Memory', expect.anything());
    expect(registerCommand).toHaveBeenCalledWith('debug80.openRomSource', expect.anything());
    expect(context.subscriptions.length).toBeGreaterThan(0);
  }, 20000);

  it('forces asm documents to z80-asm when available', async () => {
    const extension = (await import('../../src/extension/extension')) as {
      activate: (context: { subscriptions: Array<{ dispose: () => void }> }) => void;
    };
    const context = {
      subscriptions: [] as Array<{ dispose: () => void }>,
      workspaceState: { get: vi.fn(), update: vi.fn() },
      extensionUri: { fsPath: '/tmp/debug80' },
    };
    extension.activate(context);

    await new Promise((resolve) => setImmediate(resolve));
    expect(getLanguages).toHaveBeenCalled();
    const calls = setTextDocumentLanguage.mock.calls as Array<[unknown, string]>;
    expect(calls.length).toBeGreaterThan(0);
    const [doc, languageId] = calls[0] ?? [];
    const docValue = doc as { uri?: { path?: string } };
    expect(docValue.uri?.path).toBe('/tmp/test.asm');
    expect(languageId).toBe('z80-asm');
  }, 20000);

  it('forces zax documents to zax when opened', async () => {
    const extension = (await import('../../src/extension/extension')) as {
      activate: (context: { subscriptions: Array<{ dispose: () => void }> }) => void;
    };
    const context = {
      subscriptions: [] as Array<{ dispose: () => void }>,
      workspaceState: { get: vi.fn(), update: vi.fn() },
      extensionUri: { fsPath: '/tmp/debug80' },
    };
    extension.activate(context);

    expect(onDidOpenHandler).toBeDefined();
    const zaxDoc = { uri: { path: '/tmp/test.zax', scheme: 'file' }, languageId: 'plaintext' };
    onDidOpenHandler?.(zaxDoc);
    await Promise.resolve();

    expect(setTextDocumentLanguage).toHaveBeenCalledWith(zaxDoc, 'zax');
  }, 20000);
});
