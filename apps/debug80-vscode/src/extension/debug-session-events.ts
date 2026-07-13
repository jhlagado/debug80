/**
 * @file Debug session lifecycle and custom-event wiring for Debug80.
 */

import * as vscode from 'vscode';
import { tec1UpdatePayloadFromDebugEventBody } from '../platforms/tec1/serialize-update-payload';
import { tec1gUpdatePayloadFromDebugEventBody } from '../platforms/tec1g/serialize-ui-update-payload';
import { PlatformViewProvider } from './platform-view-provider';
import { openRomSourcesForSession } from './rom-sources';
import { SessionStateManager } from './session-state-manager';
import { SourceColumnController } from './source-columns';
import { TerminalPanelController } from './terminal-panel';
import { WorkspaceSelectionController } from './workspace-selection';

type DebugSessionEventDependencies = {
  context: vscode.ExtensionContext;
  rebuildDiagnostics: vscode.DiagnosticCollection;
  assemblyDiagnostics: vscode.DiagnosticCollection;
  output: vscode.OutputChannel;
  platformViewProvider: PlatformViewProvider;
  sessionState: SessionStateManager;
  sourceColumns: SourceColumnController;
  terminalPanel: TerminalPanelController;
  workspaceSelection: WorkspaceSelectionController;
};

type AssemblyFailedPayload = {
  diagnostic?: {
    path?: string;
    line?: number;
    column?: number;
    message?: string;
    sourceLine?: string;
  };
  error?: string;
};

type LaunchAssemblyDiagnostic = {
  uri: vscode.Uri;
  diagnostics: vscode.Diagnostic[];
};

export function buildLaunchAssemblyDiagnostic(
  payload: AssemblyFailedPayload,
  workspaceFolder?: vscode.WorkspaceFolder
): LaunchAssemblyDiagnostic | undefined {
  const d = payload.diagnostic;
  if (d?.path === undefined || d.path === '' || d.line === undefined) {
    return undefined;
  }
  const diagnosticPath =
    d.path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(d.path)
      ? d.path
      : workspaceFolder !== undefined
        ? vscode.Uri.joinPath(workspaceFolder.uri, d.path).fsPath
        : d.path;
  const uri = vscode.Uri.file(diagnosticPath);
  const startLine = Math.max(0, d.line - 1);
  const startCharacter = Math.max(0, (d.column ?? 1) - 1);
  const endCharacter = Math.max(startCharacter + 1, d.sourceLine?.length ?? 1);
  const range = new vscode.Range(startLine, startCharacter, startLine, endCharacter);
  const message =
    (typeof d.message === 'string' && d.message.trim().length > 0 ? d.message.trim() : undefined) ??
    (typeof payload.error === 'string' && payload.error.length > 0
      ? payload.error.split(/\r?\n/, 1)[0]
      : undefined) ??
    'Assembly failed';
  return {
    uri,
    diagnostics: [new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error)],
  };
}

function applyLaunchAssemblyDiagnostic(
  assemblyDiagnostics: vscode.DiagnosticCollection,
  payload: AssemblyFailedPayload,
  workspaceFolder?: vscode.WorkspaceFolder
): void {
  const diagnostic = buildLaunchAssemblyDiagnostic(payload, workspaceFolder);
  if (diagnostic === undefined) {
    return;
  }
  assemblyDiagnostics.set(diagnostic.uri, diagnostic.diagnostics);
}

const isPlatformId = (value: string): value is 'tec1' | 'tec1g' | 'simple' =>
  value === 'tec1' || value === 'tec1g' || value === 'simple';

function handleDebugSessionStarted(
  session: vscode.DebugSession,
  {
    assemblyDiagnostics,
    platformViewProvider,
    sessionState,
    sourceColumns,
    terminalPanel,
  }: DebugSessionEventDependencies
): void {
  if (session.type !== 'z80') {
    return;
  }
  assemblyDiagnostics.clear();
  platformViewProvider.setBuildStatus(undefined);
  platformViewProvider.setSessionStatus('starting');
  sessionState.activeZ80Sessions.add(session.id);
  terminalPanel.clear();
  platformViewProvider.clear();
  platformViewProvider.reveal(false);
  sessionState.sessionPlatforms.delete(session.id);
  sourceColumns.onSessionStarted(session);
}

function handleDebugSessionTerminated(
  session: vscode.DebugSession,
  {
    rebuildDiagnostics,
    platformViewProvider,
    sessionState,
    sourceColumns,
  }: DebugSessionEventDependencies
): void {
  if (sessionState.terminalSession?.id === session.id) {
    sessionState.terminalSession = undefined;
  }
  platformViewProvider.handleSessionTerminated(session.id);
  if (session.type !== 'z80') {
    return;
  }

  const rebuildTimer = sessionState.rebuildTimers.get(session.id);
  if (rebuildTimer !== undefined) {
    clearTimeout(rebuildTimer);
    sessionState.rebuildTimers.delete(session.id);
  }
  sessionState.rebuildPending.delete(session.id);
  sessionState.rebuildInFlight.delete(session.id);
  const diagnosticUri = sessionState.rebuildDiagnosticUris.get(session.id);
  if (diagnosticUri !== undefined) {
    rebuildDiagnostics.delete(diagnosticUri);
    sessionState.rebuildDiagnosticUris.delete(session.id);
  }
  sessionState.activeZ80Sessions.delete(session.id);
  sessionState.sessionPlatforms.delete(session.id);
  sessionState.romSourcesOpenedSessions.delete(session.id);
  sessionState.mainSourceOpenedSessions.delete(session.id);
  sourceColumns.onSessionTerminated(session.id);
}

function handlePlatformEvent(
  session: vscode.DebugSession,
  body: { id?: string } | undefined,
  {
    platformViewProvider,
    sessionState,
    sourceColumns,
    terminalPanel,
    workspaceSelection,
  }: DebugSessionEventDependencies
): void {
  const id = body?.id;
  if (id !== undefined && id.length > 0) {
    sessionState.sessionPlatforms.set(session.id, id);
  }
  workspaceSelection.rememberWorkspace(session.workspaceFolder);
  if (id !== undefined && id.length > 0 && isPlatformId(id)) {
    platformViewProvider.setPlatform(id, session, { focus: false, reveal: true, tab: 'ui' });
  } else {
    const columns = sourceColumns.getSessionColumns(session);
    terminalPanel.open(session, { focus: false, reveal: true, column: columns.panel });
  }

  maybeOpenRomSourcesAfterPlatformEvent(session, { sessionState, sourceColumns });
}

function maybeOpenRomSourcesAfterPlatformEvent(
  session: vscode.DebugSession,
  {
    sessionState,
    sourceColumns,
  }: Pick<DebugSessionEventDependencies, 'sessionState' | 'sourceColumns'>
): void {
  const openRomSources = session.configuration?.openRomSourcesOnLaunch !== false;
  const openMainSource = session.configuration?.openMainSourceOnLaunch !== false;
  if (
    !openRomSources ||
    sessionState.romSourcesOpenedSessions.has(session.id) ||
    (openMainSource && !sessionState.mainSourceOpenedSessions.has(session.id))
  ) {
    return;
  }
  const sourceColumn = sourceColumns.getSessionColumns(session).source;
  void openRomSourcesForSession(session, sourceColumn).then((opened) => {
    if (opened) {
      sessionState.romSourcesOpenedSessions.add(session.id);
    }
  });
}

function handleSessionStatusEvent(
  body: { status?: string } | undefined,
  platformViewProvider: PlatformViewProvider
): void {
  const status = body?.status;
  if (
    status === 'starting' ||
    status === 'running' ||
    status === 'paused' ||
    status === 'not running'
  ) {
    platformViewProvider.setSessionStatus(status);
  }
}

function handleTerminalOutputEvent(
  session: vscode.DebugSession,
  body: { text?: string } | undefined,
  {
    platformViewProvider,
    sessionState,
    sourceColumns,
    terminalPanel,
  }: DebugSessionEventDependencies
): void {
  const text = body?.text ?? '';
  const sessionPlatform = sessionState.sessionPlatforms.get(session.id);
  if (sessionPlatform === 'simple') {
    platformViewProvider.appendSimpleTerminal(text, session.id);
    return;
  }
  if (!terminalPanel.hasPanel()) {
    const column = sourceColumns.getSessionColumns(session).panel;
    terminalPanel.open(session, { focus: false, reveal: true, column });
  }
  terminalPanel.appendOutput(text);
}

function handleAssemblyFailedEvent(
  session: vscode.DebugSession,
  body: AssemblyFailedPayload | undefined,
  { assemblyDiagnostics, output, platformViewProvider }: DebugSessionEventDependencies
): void {
  if (body === undefined) {
    return;
  }
  applyLaunchAssemblyDiagnostic(assemblyDiagnostics, body, session.workspaceFolder);
  const summary = body.diagnostic?.message ?? body.error?.split(/\r?\n/, 1)[0] ?? 'Assembly failed';
  platformViewProvider.setBuildStatus(`Build failed: ${summary}`, 'error');
  output.appendLine(`Debug80: Build failed: ${summary}`);
  if (body.error !== undefined && body.error.trim().length > 0) {
    output.appendLine(body.error.trimEnd());
  }
  output.show(true);
}

function handleMainSourceEvent(
  session: vscode.DebugSession,
  body: { path?: string } | undefined,
  { sessionState, sourceColumns }: DebugSessionEventDependencies
): void {
  const openOnLaunch = session.configuration?.openMainSourceOnLaunch !== false;
  const sourcePath = body?.path;
  if (!openOnLaunch || sourcePath === undefined || sourcePath === '') {
    return;
  }
  if (sessionState.mainSourceOpenedSessions.has(session.id)) {
    return;
  }
  sessionState.mainSourceOpenedSessions.add(session.id);
  const stopOnEntry = session.configuration?.stopOnEntry === true;
  const viewColumn = sourceColumns.getSessionColumns(session).source;
  let mainDoc: vscode.TextDocument | undefined;
  void vscode.workspace
    .openTextDocument(sourcePath)
    .then((doc) => {
      mainDoc = doc;
      return vscode.window.showTextDocument(doc, {
        preview: false,
        preserveFocus: stopOnEntry,
        viewColumn,
      });
    })
    .then(async () => {
      const openRomSources = session.configuration?.openRomSourcesOnLaunch !== false;
      if (!openRomSources || sessionState.romSourcesOpenedSessions.has(session.id)) {
        return;
      }
      return openRomSourcesForSession(session, viewColumn, {
        preserveFocus: !stopOnEntry,
      }).then(async (opened) => {
        if (opened) {
          sessionState.romSourcesOpenedSessions.add(session.id);
          if (!stopOnEntry && mainDoc !== undefined) {
            await vscode.window.showTextDocument(mainDoc, {
              preview: false,
              preserveFocus: false,
              viewColumn,
            });
          }
        }
      });
    });
}

function handleTec1UpdateEvent(
  session: vscode.DebugSession,
  body: unknown,
  platformViewProvider: PlatformViewProvider
): void {
  const payload = tec1UpdatePayloadFromDebugEventBody(body);
  if (payload !== undefined) {
    platformViewProvider.updateTec1(payload, session.id);
  }
}

function handleTec1SerialEvent(
  session: vscode.DebugSession,
  body: { text?: string } | undefined,
  platformViewProvider: PlatformViewProvider
): void {
  const text = body?.text ?? '';
  if (text.length > 0) {
    platformViewProvider.appendTec1Serial(text, session.id);
  }
}

function handleTec1gUpdateEvent(
  session: vscode.DebugSession,
  body: unknown,
  platformViewProvider: PlatformViewProvider
): void {
  const payload = tec1gUpdatePayloadFromDebugEventBody(body);
  if (payload !== undefined) {
    platformViewProvider.updateTec1g(payload, session.id);
  }
}

function handleTec1gSerialEvent(
  session: vscode.DebugSession,
  body: { text?: string } | undefined,
  platformViewProvider: PlatformViewProvider
): void {
  const text = body?.text ?? '';
  if (text.length > 0) {
    platformViewProvider.appendTec1gSerial(text, session.id);
  }
}

function handleDebugSessionCustomEvent(
  evt: vscode.DebugSessionCustomEvent,
  deps: DebugSessionEventDependencies
): void {
  if (evt.session.type !== 'z80') {
    return;
  }

  const handler = Object.hasOwn(debugSessionCustomEventHandlers, evt.event)
    ? debugSessionCustomEventHandlers[evt.event]
    : undefined;
  if (handler !== undefined) {
    handler(evt, deps);
  }
}

type DebugSessionCustomEventHandler = (
  evt: vscode.DebugSessionCustomEvent,
  deps: DebugSessionEventDependencies
) => void;

const debugSessionCustomEventHandlers: Record<string, DebugSessionCustomEventHandler> = {
  'debug80/platform': (evt, deps) =>
    handlePlatformEvent(evt.session, evt.body as { id?: string } | undefined, deps),
  'debug80/sessionStatus': (evt, deps) =>
    handleSessionStatusEvent(
      evt.body as { status?: string } | undefined,
      deps.platformViewProvider
    ),
  'debug80/terminalOutput': (evt, deps) =>
    handleTerminalOutputEvent(evt.session, evt.body as { text?: string } | undefined, deps),
  'debug80/assemblyFailed': (evt, deps) =>
    handleAssemblyFailedEvent(evt.session, evt.body as AssemblyFailedPayload | undefined, deps),
  'debug80/mainSource': (evt, deps) =>
    handleMainSourceEvent(evt.session, evt.body as { path?: string } | undefined, deps),
  'debug80/tec1Update': (evt, deps) =>
    handleTec1UpdateEvent(evt.session, evt.body, deps.platformViewProvider),
  'debug80/tec1Serial': (evt, deps) =>
    handleTec1SerialEvent(
      evt.session,
      evt.body as { text?: string } | undefined,
      deps.platformViewProvider
    ),
  'debug80/tec1gUpdate': (evt, deps) =>
    handleTec1gUpdateEvent(evt.session, evt.body, deps.platformViewProvider),
  'debug80/tec1gSerial': (evt, deps) =>
    handleTec1gSerialEvent(
      evt.session,
      evt.body as { text?: string } | undefined,
      deps.platformViewProvider
    ),
};

export function registerDebugSessionHandlers({
  context,
  rebuildDiagnostics,
  assemblyDiagnostics,
  output,
  platformViewProvider,
  sessionState,
  sourceColumns,
  terminalPanel,
  workspaceSelection,
}: DebugSessionEventDependencies): void {
  const deps = {
    context,
    rebuildDiagnostics,
    assemblyDiagnostics,
    output,
    platformViewProvider,
    sessionState,
    sourceColumns,
    terminalPanel,
    workspaceSelection,
  };

  context.subscriptions.push(
    vscode.debug.onDidStartDebugSession((session) => handleDebugSessionStarted(session, deps))
  );

  context.subscriptions.push(
    vscode.debug.onDidTerminateDebugSession((session) =>
      handleDebugSessionTerminated(session, deps)
    )
  );

  context.subscriptions.push(
    vscode.debug.onDidReceiveDebugSessionCustomEvent((evt) =>
      handleDebugSessionCustomEvent(evt, deps)
    )
  );
}
