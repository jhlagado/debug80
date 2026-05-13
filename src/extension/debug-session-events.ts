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

function applyLaunchAssemblyDiagnostic(
  assemblyDiagnostics: vscode.DiagnosticCollection,
  payload: AssemblyFailedPayload
): void {
  const d = payload.diagnostic;
  if (d?.path === undefined || d.path === '' || d.line === undefined) {
    return;
  }
  const uri = vscode.Uri.file(d.path);
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
  assemblyDiagnostics.set(uri, [
    new vscode.Diagnostic(range, message, vscode.DiagnosticSeverity.Error),
  ]);
}

export function registerDebugSessionHandlers({
  context,
  rebuildDiagnostics,
  assemblyDiagnostics,
  platformViewProvider,
  sessionState,
  sourceColumns,
  terminalPanel,
  workspaceSelection,
}: DebugSessionEventDependencies): void {
  const isPlatformId = (value: string): value is 'tec1' | 'tec1g' | 'simple' =>
    value === 'tec1' || value === 'tec1g' || value === 'simple';

  context.subscriptions.push(
    vscode.debug.onDidStartDebugSession((session) => {
      if (session.type === 'z80') {
        assemblyDiagnostics.clear();
        platformViewProvider.setSessionStatus('starting');
        sessionState.activeZ80Sessions.add(session.id);
        terminalPanel.clear();
        platformViewProvider.clear();
        sessionState.sessionPlatforms.delete(session.id);
        sourceColumns.onSessionStarted(session);
      }
    })
  );

  context.subscriptions.push(
    vscode.debug.onDidTerminateDebugSession((session) => {
      if (sessionState.terminalSession?.id === session.id) {
        sessionState.terminalSession = undefined;
      }
      platformViewProvider.handleSessionTerminated(session.id);
      if (session.type === 'z80') {
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
    })
  );

  context.subscriptions.push(
    vscode.debug.onDidReceiveDebugSessionCustomEvent((evt) => {
      if (evt.session.type !== 'z80') {
        return;
      }
      if (evt.event === 'debug80/platform') {
        const body = evt.body as
          | { id?: string; uiVisibility?: Record<string, boolean> }
          | undefined;
        const id = body?.id;
        if (id !== undefined && id.length > 0) {
          sessionState.sessionPlatforms.set(evt.session.id, id);
        }
        workspaceSelection.rememberWorkspace(evt.session.workspaceFolder);
        if (id !== undefined && id.length > 0 && isPlatformId(id)) {
          platformViewProvider.setPlatform(id, evt.session, {
            focus: false,
            reveal: true,
            tab: 'ui',
          });
          if (id === 'tec1g') {
            platformViewProvider.setTec1gAdapterVisibility(body?.uiVisibility);
          }
        } else {
          const columns = sourceColumns.getSessionColumns(evt.session);
          terminalPanel.open(evt.session, {
            focus: false,
            reveal: true,
            column: columns.panel,
          });
        }
        const openRomSources = evt.session.configuration?.openRomSourcesOnLaunch !== false;
        const openMainSource = evt.session.configuration?.openMainSourceOnLaunch !== false;
        if (
          openRomSources &&
          !sessionState.romSourcesOpenedSessions.has(evt.session.id) &&
          (!openMainSource || sessionState.mainSourceOpenedSessions.has(evt.session.id))
        ) {
          const sourceColumn = sourceColumns.getSessionColumns(evt.session).source;
          void openRomSourcesForSession(evt.session, sourceColumn).then((opened) => {
            if (opened) {
              sessionState.romSourcesOpenedSessions.add(evt.session.id);
            }
          });
        }
        return;
      }
      if (evt.event === 'debug80/sessionStatus') {
        const body = evt.body as { status?: string } | undefined;
        const status = body?.status;
        if (
          status === 'starting' ||
          status === 'running' ||
          status === 'paused' ||
          status === 'not running'
        ) {
          platformViewProvider.setSessionStatus(status);
        }
        return;
      }
      if (evt.event === 'debug80/terminalOutput') {
        const text = (evt.body as { text?: string } | undefined)?.text ?? '';
        const sessionPlatform = sessionState.sessionPlatforms.get(evt.session.id);
        if (sessionPlatform === 'simple') {
          platformViewProvider.appendSimpleTerminal(text, evt.session.id);
        } else {
          if (!terminalPanel.hasPanel()) {
            const column = sourceColumns.getSessionColumns(evt.session).panel;
            terminalPanel.open(evt.session, { focus: false, reveal: true, column });
          }
          terminalPanel.appendOutput(text);
        }
        return;
      }
      if (evt.event === 'debug80/tec1Update') {
        const payload = tec1UpdatePayloadFromDebugEventBody(evt.body);
        if (payload === undefined) {
          return;
        }
        platformViewProvider.updateTec1(payload, evt.session.id);
        return;
      }
      if (evt.event === 'debug80/tec1Serial') {
        const payload = evt.body as { text?: string } | undefined;
        const text = payload?.text ?? '';
        if (text.length === 0) {
          return;
        }
        platformViewProvider.appendTec1Serial(text, evt.session.id);
        return;
      }
      if (evt.event === 'debug80/tec1gUpdate') {
        const payload = tec1gUpdatePayloadFromDebugEventBody(evt.body);
        if (payload === undefined) {
          return;
        }
        platformViewProvider.updateTec1g(payload, evt.session.id);
        return;
      }
      if (evt.event === 'debug80/tec1gSerial') {
        const payload = evt.body as { text?: string } | undefined;
        const text = payload?.text ?? '';
        if (text.length === 0) {
          return;
        }
        platformViewProvider.appendTec1gSerial(text, evt.session.id);
        return;
      }
      if (evt.event === 'debug80/assemblyFailed') {
        const body = evt.body as AssemblyFailedPayload | undefined;
        if (body !== undefined) {
          applyLaunchAssemblyDiagnostic(assemblyDiagnostics, body);
        }
        return;
      }
      if (evt.event === 'debug80/mainSource') {
        const openOnLaunch = evt.session.configuration?.openMainSourceOnLaunch !== false;
        const body = evt.body as { path?: string } | undefined;
        const sourcePath = body?.path;
        if (!openOnLaunch || sourcePath === undefined || sourcePath === '') {
          return;
        }
        if (sessionState.mainSourceOpenedSessions.has(evt.session.id)) {
          return;
        }
        sessionState.mainSourceOpenedSessions.add(evt.session.id);
        const columns = sourceColumns.getSessionColumns(evt.session);
        const viewColumn = columns.source;
        let mainDoc: vscode.TextDocument | undefined;
        void vscode.workspace
          .openTextDocument(sourcePath)
          .then((doc) => {
            mainDoc = doc;
            return vscode.window.showTextDocument(doc, { preview: false, viewColumn });
          })
          .then(async () => {
            const openRomSources = evt.session.configuration?.openRomSourcesOnLaunch !== false;
            if (!openRomSources || sessionState.romSourcesOpenedSessions.has(evt.session.id)) {
              return;
            }
            return openRomSourcesForSession(evt.session, viewColumn).then(async (opened) => {
              if (opened) {
                sessionState.romSourcesOpenedSessions.add(evt.session.id);
                if (mainDoc !== undefined) {
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
    })
  );
}
