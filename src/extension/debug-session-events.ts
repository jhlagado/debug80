/**
 * @file Debug session lifecycle and custom-event wiring for Debug80.
 */

import * as vscode from 'vscode';
import { PlatformViewProvider } from './platform-view-provider';
import { openRomSourcesForSession } from './rom-sources';
import { SessionStateManager } from './session-state-manager';
import { SourceColumnController } from './source-columns';
import { TerminalPanelController } from './terminal-panel';
import { WorkspaceSelectionController } from './workspace-selection';

type DebugSessionEventDependencies = {
  context: vscode.ExtensionContext;
  rebuildDiagnostics: vscode.DiagnosticCollection;
  platformViewProvider: PlatformViewProvider;
  sessionState: SessionStateManager;
  sourceColumns: SourceColumnController;
  terminalPanel: TerminalPanelController;
  workspaceSelection: WorkspaceSelectionController;
};

export function registerDebugSessionHandlers({
  context,
  rebuildDiagnostics,
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
        sessionState.activeZ80Sessions.add(session.id);
        terminalPanel.clear();
        platformViewProvider.clear();
        sessionState.sessionPlatforms.delete(session.id);
        sourceColumns.onSessionStarted(session);
        const openRomSources = session.configuration?.openRomSourcesOnLaunch !== false;
        const openMainSource = session.configuration?.openMainSourceOnLaunch !== false;
        if (openRomSources && !openMainSource) {
          const sessionId = session.id;
          const column = sourceColumns.getSessionColumns(session).source;
          setTimeout(() => {
            if (!sessionState.activeZ80Sessions.has(sessionId)) {
              return;
            }
            if (sessionState.romSourcesOpenedSessions.has(sessionId)) {
              return;
            }
            void openRomSourcesForSession(session, column).then((opened) => {
              if (opened) {
                sessionState.romSourcesOpenedSessions.add(sessionId);
              }
            });
          }, 200);
        }
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
        const body = evt.body as { id?: string; uiVisibility?: Record<string, boolean> } | undefined;
        const id = body?.id;
        if (id !== undefined && id.length > 0) {
          sessionState.sessionPlatforms.set(evt.session.id, id);
        }
        workspaceSelection.rememberWorkspace(evt.session.workspaceFolder);
        if (id !== undefined && id.length > 0 && isPlatformId(id) && id !== 'simple') {
          platformViewProvider.setPlatform(id, evt.session, {
            focus: false,
            reveal: true,
            tab: 'ui',
          });
          if (id === 'tec1g' && body?.uiVisibility) {
            platformViewProvider.setTec1gUiVisibility(body.uiVisibility, false);
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
      if (evt.event === 'debug80/terminalOutput') {
        const text = (evt.body as { text?: string } | undefined)?.text ?? '';
        if (!terminalPanel.hasPanel()) {
          const column = sourceColumns.getSessionColumns(evt.session).panel;
          terminalPanel.open(evt.session, { focus: false, reveal: true, column });
        }
        terminalPanel.appendOutput(text);
        return;
      }
      if (evt.event === 'debug80/tec1Update') {
        const payload = evt.body as {
          digits?: number[];
          matrix?: number[];
          lcd?: number[];
          sysCtrl?: number;
          speaker?: number;
          speakerHz?: number;
          speedMode?: 'slow' | 'fast';
        } | undefined;
        if (!payload?.digits || !payload?.lcd || !payload?.matrix) {
          return;
        }
        const update = {
          digits: payload.digits,
          matrix: payload.matrix,
          speaker: payload.speaker ?? 0,
          speedMode: payload.speedMode ?? 'slow',
          lcd: payload.lcd,
        };
        if (payload.speakerHz !== undefined) {
          platformViewProvider.updateTec1({ ...update, speakerHz: payload.speakerHz }, evt.session.id);
        } else {
          platformViewProvider.updateTec1(update, evt.session.id);
        }
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
        const payload = evt.body as {
          digits?: number[];
          matrix?: number[];
          matrixBrightness?: number[];
          glcd?: number[];
          glcdDdram?: number[];
          glcdState?: {
            displayOn?: boolean;
            graphicsOn?: boolean;
            cursorOn?: boolean;
            cursorBlink?: boolean;
            blinkVisible?: boolean;
            ddramAddr?: number;
            ddramPhase?: number;
            textShift?: number;
            scroll?: number;
            reverseMask?: number;
          };
          lcd?: number[];
          speaker?: number;
          speakerHz?: number;
          speedMode?: 'slow' | 'fast';
        } | undefined;
        if (!payload?.digits || !payload?.lcd || !payload?.matrix || !payload?.glcd) {
          return;
        }
        const update = {
          digits: payload.digits,
          matrix: payload.matrix,
          ...(payload.matrixBrightness !== undefined
            ? { matrixBrightness: payload.matrixBrightness }
            : {}),
          glcd: payload.glcd,
          speaker: payload.speaker ?? 0,
          speedMode: payload.speedMode ?? 'slow',
          lcd: payload.lcd,
          ...(payload.glcdDdram !== undefined ? { glcdDdram: payload.glcdDdram } : {}),
          ...(payload.glcdState !== undefined ? { glcdState: payload.glcdState } : {}),
        };
        if (payload.speakerHz !== undefined) {
          platformViewProvider.updateTec1g(
            { ...update, speakerHz: payload.speakerHz },
            evt.session.id
          );
        } else {
          platformViewProvider.updateTec1g(update, evt.session.id);
        }
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
