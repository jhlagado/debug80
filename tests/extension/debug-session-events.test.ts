/**
 * @file Debug session status bridge tests.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionStateManager } from '../../src/extension/session-state-manager';
import { registerDebugSessionHandlers } from '../../src/extension/debug-session-events';

const onDidStartDebugSession = vi.fn(() => ({ dispose: vi.fn() }));
const onDidTerminateDebugSession = vi.fn(() => ({ dispose: vi.fn() }));
const onDidReceiveDebugSessionCustomEvent = vi.fn(() => ({ dispose: vi.fn() }));
const { openRomSourcesForSession } = vi.hoisted(() => ({
  openRomSourcesForSession: vi.fn(() => Promise.resolve(true)),
}));

const startHandlers: Array<(session: { id: string; type: string; configuration?: Record<string, unknown>; workspaceFolder?: unknown }) => void> = [];
const terminateHandlers: Array<(session: { id: string; type: string }) => void> = [];
const customHandlers: Array<(evt: { session: { id: string; type: string; configuration?: Record<string, unknown>; workspaceFolder?: unknown }; event: string; body?: unknown }) => void> = [];

vi.mock('vscode', () => ({
  debug: {
    onDidStartDebugSession: vi.fn((handler: (session: unknown) => void) => {
      startHandlers.push(handler as never);
      return onDidStartDebugSession();
    }),
    onDidTerminateDebugSession: vi.fn((handler: (session: unknown) => void) => {
      terminateHandlers.push(handler as never);
      return onDidTerminateDebugSession();
    }),
    onDidReceiveDebugSessionCustomEvent: vi.fn((handler: (evt: unknown) => void) => {
      customHandlers.push(handler as never);
      return onDidReceiveDebugSessionCustomEvent();
    }),
  },
  commands: { executeCommand: vi.fn(() => Promise.resolve(true)) },
  workspace: {
    workspaceFolders: undefined,
    openTextDocument: vi.fn((path: string) => Promise.resolve({ uri: { fsPath: path } })),
  },
  window: {
    showTextDocument: vi.fn(() => Promise.resolve(undefined)),
    showErrorMessage: vi.fn(),
  },
  Uri: {
    file: (value: string) => ({ fsPath: value }),
  },
  Range: class Range {
    constructor(
      public startLine: number,
      public startCharacter: number,
      public endLine: number,
      public endCharacter: number
    ) {}
  },
  Diagnostic: class Diagnostic {
    constructor(
      public range: unknown,
      public message: string,
      public severity: number
    ) {}
  },
  DiagnosticSeverity: { Error: 0 },
}));

vi.mock('../../src/extension/rom-sources', () => ({
  openRomSourcesForSession,
}));

describe('debug session status bridge', () => {
  beforeEach(() => {
    startHandlers.length = 0;
    terminateHandlers.length = 0;
    customHandlers.length = 0;
    vi.clearAllMocks();
    openRomSourcesForSession.mockResolvedValue(true);
  });

  it('forwards start, custom status, and termination events to the platform view', () => {
    const platformViewProvider = {
      setSessionStatus: vi.fn(),
      clear: vi.fn(),
      handleSessionTerminated: vi.fn(),
      setPlatform: vi.fn(),
      setTec1gUiVisibility: vi.fn(),
      updateTec1: vi.fn(),
      updateTec1g: vi.fn(),
      appendTec1Serial: vi.fn(),
      appendTec1gSerial: vi.fn(),
    } as never;
    const sessionState = new SessionStateManager();
    const sourceColumns = {
      onSessionStarted: vi.fn(),
      onSessionTerminated: vi.fn(),
      getSessionColumns: vi.fn(() => ({ source: 1, panel: 2 })),
    } as never;
    const terminalPanel = {
      clear: vi.fn(),
      open: vi.fn(),
      hasPanel: vi.fn(() => false),
      appendOutput: vi.fn(),
    } as never;
    const workspaceSelection = {
      rememberWorkspace: vi.fn(),
    } as never;
    const context = { subscriptions: [] as Array<{ dispose: () => void }> } as never;
    const rebuildDiagnostics = { clear: vi.fn(), delete: vi.fn() } as never;
    const assemblyDiagnostics = { clear: vi.fn(), set: vi.fn() } as never;

    registerDebugSessionHandlers({
      context,
      rebuildDiagnostics,
      assemblyDiagnostics,
      platformViewProvider,
      sessionState,
      sourceColumns,
      terminalPanel,
      workspaceSelection,
    });

    const session = {
      id: 'session-1',
      type: 'z80',
      configuration: {
        openRomSourcesOnLaunch: false,
        openMainSourceOnLaunch: true,
      },
      workspaceFolder: undefined,
    };

    startHandlers[0]?.(session);
    customHandlers[0]?.({
      session,
      event: 'debug80/sessionStatus',
      body: { status: 'running' },
    });
    customHandlers[0]?.({
      session,
      event: 'debug80/sessionStatus',
      body: { status: 'paused' },
    });
    terminateHandlers[0]?.(session);

    expect(platformViewProvider.setSessionStatus).toHaveBeenNthCalledWith(1, 'starting');
    expect(platformViewProvider.setSessionStatus).toHaveBeenNthCalledWith(2, 'running');
    expect(platformViewProvider.setSessionStatus).toHaveBeenNthCalledWith(3, 'paused');
    expect(platformViewProvider.handleSessionTerminated).toHaveBeenCalledWith('session-1');
  });

  it('opens ROM sources from session lifecycle events without using a start-time timer', async () => {
    const platformViewProvider = {
      setSessionStatus: vi.fn(),
      clear: vi.fn(),
      handleSessionTerminated: vi.fn(),
      setPlatform: vi.fn(),
      setTec1gUiVisibility: vi.fn(),
      updateTec1: vi.fn(),
      updateTec1g: vi.fn(),
      appendTec1Serial: vi.fn(),
      appendTec1gSerial: vi.fn(),
    } as never;
    const sessionState = new SessionStateManager();
    const sourceColumns = {
      onSessionStarted: vi.fn(),
      onSessionTerminated: vi.fn(),
      getSessionColumns: vi.fn(() => ({ source: 1, panel: 2 })),
    } as never;
    const terminalPanel = {
      clear: vi.fn(),
      open: vi.fn(),
      hasPanel: vi.fn(() => false),
      appendOutput: vi.fn(),
    } as never;
    const workspaceSelection = {
      rememberWorkspace: vi.fn(),
    } as never;
    const context = { subscriptions: [] as Array<{ dispose: () => void }> } as never;
    const rebuildDiagnostics = { clear: vi.fn(), delete: vi.fn() } as never;
    const assemblyDiagnostics = { clear: vi.fn(), set: vi.fn() } as never;
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    registerDebugSessionHandlers({
      context,
      rebuildDiagnostics,
      assemblyDiagnostics,
      platformViewProvider,
      sessionState,
      sourceColumns,
      terminalPanel,
      workspaceSelection,
    });

    const session = {
      id: 'session-2',
      type: 'z80',
      configuration: {
        openRomSourcesOnLaunch: true,
        openMainSourceOnLaunch: true,
      },
      workspaceFolder: undefined,
    };

    startHandlers[0]?.(session);
    expect(setTimeoutSpy).not.toHaveBeenCalled();
    expect(openRomSourcesForSession).not.toHaveBeenCalled();

    customHandlers[0]?.({
      session,
      event: 'debug80/platform',
      body: { id: 'tec1g' },
    });
    expect(openRomSourcesForSession).not.toHaveBeenCalled();

    customHandlers[0]?.({
      session,
      event: 'debug80/mainSource',
      body: { path: '/workspace/main.asm' },
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(openRomSourcesForSession).toHaveBeenCalledTimes(1);
    expect(openRomSourcesForSession).toHaveBeenCalledWith(session, 1);
    expect(sessionState.romSourcesOpenedSessions.has('session-2')).toBe(true);

    customHandlers[0]?.({
      session,
      event: 'debug80/platform',
      body: { id: 'tec1g' },
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(openRomSourcesForSession).toHaveBeenCalledTimes(1);
    setTimeoutSpy.mockRestore();
  });
});
