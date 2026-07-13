/**
 * @file Debug session status bridge tests.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { SessionStateManager } from '../../src/extension/session-state-manager';
import {
  buildLaunchAssemblyDiagnostic,
  registerDebugSessionHandlers,
} from '../../src/extension/debug-session-events';

const onDidStartDebugSession = vi.fn(() => ({ dispose: vi.fn() }));
const onDidTerminateDebugSession = vi.fn(() => ({ dispose: vi.fn() }));
const onDidReceiveDebugSessionCustomEvent = vi.fn(() => ({ dispose: vi.fn() }));
const { openRomSourcesForSession } = vi.hoisted(() => ({
  openRomSourcesForSession: vi.fn(() => Promise.resolve(true)),
}));

const startHandlers: Array<
  (session: {
    id: string;
    type: string;
    configuration?: Record<string, unknown>;
    workspaceFolder?: unknown;
  }) => void
> = [];
const terminateHandlers: Array<(session: { id: string; type: string }) => void> = [];
const customHandlers: Array<
  (evt: {
    session: {
      id: string;
      type: string;
      configuration?: Record<string, unknown>;
      workspaceFolder?: unknown;
    };
    event: string;
    body?: unknown;
  }) => void
> = [];

function registerTestHandlers(
  overrides: {
    platformViewProvider?: Record<string, unknown>;
    assemblyDiagnostics?: Record<string, unknown>;
  } = {}
): {
  platformViewProvider: Record<string, unknown>;
  sessionState: SessionStateManager;
  sourceColumns: Record<string, unknown>;
  terminalPanel: Record<string, unknown>;
  workspaceSelection: Record<string, unknown>;
  assemblyDiagnostics: Record<string, unknown>;
  output: Record<string, ReturnType<typeof vi.fn>>;
} {
  const platformViewProvider = {
    setSessionStatus: vi.fn(),
    clear: vi.fn(),
    reveal: vi.fn(),
    handleSessionTerminated: vi.fn(),
    setPlatform: vi.fn(),
    setBuildStatus: vi.fn(),
    setHardwareStatus: vi.fn(),
    updateTec1: vi.fn(),
    updateTec1g: vi.fn(),
    appendTec1Serial: vi.fn(),
    appendTec1gSerial: vi.fn(),
    ...overrides.platformViewProvider,
  };
  const sessionState = new SessionStateManager();
  const sourceColumns = {
    onSessionStarted: vi.fn(),
    onSessionTerminated: vi.fn(),
    getSessionColumns: vi.fn(() => ({ source: 1, panel: 2 })),
  };
  const terminalPanel = {
    clear: vi.fn(),
    open: vi.fn(),
    hasPanel: vi.fn(() => false),
    appendOutput: vi.fn(),
  };
  const workspaceSelection = {
    rememberWorkspace: vi.fn(),
  };
  const context = { subscriptions: [] as Array<{ dispose: () => void }> };
  const rebuildDiagnostics = { clear: vi.fn(), delete: vi.fn() };
  const assemblyDiagnostics = {
    clear: vi.fn(),
    set: vi.fn(),
    ...overrides.assemblyDiagnostics,
  };
  const output = { appendLine: vi.fn(), show: vi.fn() };

  registerDebugSessionHandlers({
    context: context as never,
    rebuildDiagnostics: rebuildDiagnostics as never,
    assemblyDiagnostics: assemblyDiagnostics as never,
    output: output as never,
    platformViewProvider: platformViewProvider as never,
    sessionState,
    sourceColumns: sourceColumns as never,
    terminalPanel: terminalPanel as never,
    workspaceSelection: workspaceSelection as never,
  });

  return {
    platformViewProvider,
    sessionState,
    sourceColumns,
    terminalPanel,
    workspaceSelection,
    assemblyDiagnostics,
    output,
  };
}

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
    joinPath: (base: { fsPath: string }, relativePath: string) => ({
      fsPath: `${base.fsPath}/${relativePath}`,
    }),
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

  it('builds launch assembly diagnostics from workspace-relative source paths', () => {
    const result = buildLaunchAssemblyDiagnostic(
      {
        diagnostic: {
          path: 'src/main.asm',
          line: 7,
          column: 3,
          message: 'Unexpected token',
          sourceLine: '  .bad',
        },
      },
      { uri: { fsPath: '/workspace/demo' } } as never
    );

    expect(result).toEqual({
      uri: { fsPath: '/workspace/demo/src/main.asm' },
      diagnostics: [
        expect.objectContaining({
          message: 'Unexpected token',
          severity: 0,
        }),
      ],
    });
  });

  it('forwards start, custom status, and termination events to the platform view', () => {
    const { platformViewProvider } = registerTestHandlers();

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

    expect(platformViewProvider.setBuildStatus).not.toHaveBeenCalled();
    expect(platformViewProvider.setHardwareStatus).not.toHaveBeenCalled();
    expect(platformViewProvider.setSessionStatus).toHaveBeenNthCalledWith(1, 'starting');
    expect(platformViewProvider.reveal).toHaveBeenCalledWith(false);
    expect(platformViewProvider.setSessionStatus).toHaveBeenNthCalledWith(2, 'running');
    expect(platformViewProvider.setSessionStatus).toHaveBeenNthCalledWith(3, 'paused');
    expect(platformViewProvider.handleSessionTerminated).toHaveBeenCalledWith('session-1');
  });

  it('ignores unknown custom events that collide with object prototype names', () => {
    const { platformViewProvider } = registerTestHandlers();
    const session = {
      id: 'session-prototype-event',
      type: 'z80',
      configuration: {},
      workspaceFolder: undefined,
    };

    expect(() => {
      customHandlers[0]?.({
        session,
        event: 'hasOwnProperty',
        body: {},
      });
    }).not.toThrow();

    expect(platformViewProvider.setPlatform).not.toHaveBeenCalled();
    expect(platformViewProvider.updateTec1).not.toHaveBeenCalled();
    expect(platformViewProvider.updateTec1g).not.toHaveBeenCalled();
  });

  it('opens ROM sources from session lifecycle events without using a start-time timer', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const { sessionState } = registerTestHandlers();

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
    expect(openRomSourcesForSession).toHaveBeenCalledWith(session, 1, { preserveFocus: true });
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

  it('does not refocus main source after ROM sources when stop on entry is active', async () => {
    const showTextDocument = vi.mocked(vscode.window.showTextDocument);
    registerTestHandlers();

    const session = {
      id: 'session-stop-entry',
      type: 'z80',
      configuration: {
        openRomSourcesOnLaunch: true,
        openMainSourceOnLaunch: true,
        stopOnEntry: true,
      },
      workspaceFolder: undefined,
    };

    customHandlers[0]?.({
      session,
      event: 'debug80/mainSource',
      body: { path: '/workspace/main.asm' },
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(openRomSourcesForSession).toHaveBeenCalledWith(session, 1, { preserveFocus: false });
    expect(showTextDocument).toHaveBeenCalledTimes(1);
    expect(showTextDocument).toHaveBeenCalledWith(
      expect.objectContaining({ uri: { fsPath: '/workspace/main.asm' } }),
      { preview: false, preserveFocus: true, viewColumn: 1 }
    );
  });

  it('publishes launch assembly diagnostics against the workspace source file', () => {
    const { assemblyDiagnostics, output, platformViewProvider } = registerTestHandlers({
      platformViewProvider: { setBuildStatus: vi.fn() },
    });

    customHandlers[0]?.({
      session: {
        id: 'session-build-fail',
        type: 'z80',
        workspaceFolder: { uri: { fsPath: '/workspace/tetro' } },
      },
      event: 'debug80/assemblyFailed',
      body: {
        diagnostic: {
          path: 'src/tetro/tetro.main.asm',
          line: 43,
          column: 9,
          message: 'Unresolved symbol "InitdeState".',
          sourceLine: '        CALL    InitdeState',
        },
        error: 'src/tetro/tetro.main.asm:43:9: error',
      },
    });

    expect(assemblyDiagnostics.set).toHaveBeenCalledWith(
      { fsPath: '/workspace/tetro/src/tetro/tetro.main.asm' },
      [
        expect.objectContaining({
          message: 'Unresolved symbol "InitdeState".',
          severity: 0,
        }),
      ]
    );
    expect(platformViewProvider.setBuildStatus).toHaveBeenCalledWith(
      'Build failed: Unresolved symbol "InitdeState".',
      'error'
    );
    expect(output.appendLine).toHaveBeenNthCalledWith(
      1,
      'Debug80: Build failed: Unresolved symbol "InitdeState".'
    );
    expect(output.appendLine).toHaveBeenNthCalledWith(2, 'src/tetro/tetro.main.asm:43:9: error');
    expect(output.show).toHaveBeenCalledWith(true);
    expect(vscode.window.showErrorMessage).not.toHaveBeenCalled();
  });

  it('does not erase an assembly failure when the session-start event arrives late', () => {
    const { platformViewProvider } = registerTestHandlers();
    const session = {
      id: 'session-late-start',
      type: 'z80',
      configuration: {},
      workspaceFolder: undefined,
    };

    customHandlers[0]?.({
      session,
      event: 'debug80/assemblyFailed',
      body: { error: 'unsupported source line: .orgg 0x4000' },
    });
    startHandlers[0]?.(session);

    expect(platformViewProvider.setBuildStatus).toHaveBeenCalledTimes(1);
    expect(platformViewProvider.setBuildStatus).toHaveBeenCalledWith(
      'Build failed: unsupported source line: .orgg 0x4000',
      'error'
    );
  });

  it('clears the previous build result only after assembly succeeds', () => {
    const { platformViewProvider } = registerTestHandlers();
    const session = {
      id: 'session-build-success',
      type: 'z80',
      configuration: {},
      workspaceFolder: undefined,
    };

    customHandlers[0]?.({ session, event: 'debug80/assemblySucceeded', body: {} });

    expect(platformViewProvider.setBuildStatus).toHaveBeenCalledWith(undefined);
  });
});
