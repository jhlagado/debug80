/**
 * @file Source and panel column coordination for Debug80 editors.
 */

import * as path from 'path';
import * as vscode from 'vscode';
import { SessionStateManager } from './session-state-manager';

const DEFAULT_SOURCE_COLUMN = vscode.ViewColumn.One;
const DEFAULT_PANEL_COLUMN = vscode.ViewColumn.Two;

export type SessionColumns = {
  source: vscode.ViewColumn;
  panel: vscode.ViewColumn;
};

export class SourceColumnController {
  private enforceSourceColumn = false;
  private movingEditor = false;

  constructor(private readonly sessionState: SessionStateManager) {}

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (!this.enforceSourceColumn || this.movingEditor || editor === undefined) {
          return;
        }
        if (!isSourceDocument(editor.document)) {
          return;
        }
        const activeSession = vscode.debug.activeDebugSession;
        const preferred =
          activeSession && activeSession.type === 'z80'
            ? this.getSessionColumns(activeSession).source
            : this.getPrimaryEditorColumn();
        const column = editor.viewColumn;
        if (column === undefined || column === preferred) {
          return;
        }
        this.movingEditor = true;
        void vscode.window
          .showTextDocument(editor.document, {
            viewColumn: preferred,
            preserveFocus: true,
            preview: false,
          })
          .then(() => closeDocumentTabsInOtherGroups(editor.document.uri, preferred))
          .then(
            () => {
              this.movingEditor = false;
            },
            () => {
              this.movingEditor = false;
            }
          );
      })
    );
  }

  onSessionStarted(session: vscode.DebugSession): void {
    this.enforceSourceColumn = true;
    this.sessionState.sessionColumns.set(session.id, this.resolveSessionColumns(session));
  }

  onSessionTerminated(sessionId: string): void {
    this.sessionState.sessionColumns.delete(sessionId);
    if (this.sessionState.activeZ80Sessions.size === 0) {
      this.enforceSourceColumn = false;
    }
  }

  getSessionColumns(session: vscode.DebugSession): SessionColumns {
    return this.sessionState.sessionColumns.get(session.id) ?? this.resolveSessionColumns(session);
  }

  private getPrimaryEditorColumn(): vscode.ViewColumn {
    const columns = vscode.window.visibleTextEditors
      .map((editor) => editor.viewColumn)
      .filter((column): column is vscode.ViewColumn => column !== undefined);
    if (columns.length === 0) {
      return vscode.ViewColumn.One;
    }
    const first = columns[0];
    if (first === undefined) {
      return vscode.ViewColumn.One;
    }
    return columns.reduce((min, col) => (col < min ? col : min), first);
  }

  private resolveSessionColumns(session: vscode.DebugSession): SessionColumns {
    const config = session.configuration ?? {};
    return {
      source: normalizeColumn(config.sourceColumn, DEFAULT_SOURCE_COLUMN),
      panel: normalizeColumn(config.panelColumn, DEFAULT_PANEL_COLUMN),
    };
  }
}

function normalizeColumn(
  value: unknown,
  fallback: vscode.ViewColumn
): vscode.ViewColumn {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const rounded = Math.trunc(value);
    if (rounded >= 1 && rounded <= Number(vscode.ViewColumn.Nine)) {
      return rounded as vscode.ViewColumn;
    }
  }
  return fallback;
}

function isSourceDocument(doc: vscode.TextDocument): boolean {
  if (doc.uri.scheme !== 'file') {
    return false;
  }
  const ext = path.extname(doc.fileName).toLowerCase();
  return ext === '.asm' || ext === '.lst';
}

function closeDocumentTabsInOtherGroups(
  uri: vscode.Uri,
  keepColumn: vscode.ViewColumn
): void {
  const target = uri.toString();
  for (const group of vscode.window.tabGroups.all) {
    if (group.viewColumn === keepColumn) {
      continue;
    }
    for (const tab of group.tabs) {
      const input = tab.input;
      if (input instanceof vscode.TabInputText && input.uri.toString() === target) {
        void vscode.window.tabGroups.close(tab, true);
      }
    }
  }
}
