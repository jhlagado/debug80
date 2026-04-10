/**
 * @fileoverview Auto rebuild-on-save support for active Debug80 sessions.
 */

import * as path from 'path';
import * as vscode from 'vscode';
import type { WarmRebuildResult } from '../debug/message-types';
import { isWarmRebuildResult } from '../debug/message-types';
import { SessionStateManager } from './session-state-manager';

const REBUILD_DEBOUNCE_MS = 250;
const ASSEMBLY_EXTENSIONS = new Set(['.asm', '.z80', '.a80', '.s', '.zax']);

function isAssemblyDocument(document: vscode.TextDocument): boolean {
  if (document.isUntitled || document.uri.scheme !== 'file') {
    return false;
  }
  return ASSEMBLY_EXTENSIONS.has(path.extname(document.uri.fsPath).toLowerCase());
}

function clearRebuildDiagnostics(
  sessionId: string,
  sessionState: SessionStateManager,
  diagnostics: vscode.DiagnosticCollection
): void {
  const uri = sessionState.rebuildDiagnosticUris.get(sessionId);
  if (uri !== undefined) {
    diagnostics.delete(uri);
    sessionState.rebuildDiagnosticUris.delete(sessionId);
  }
}

function applyRebuildDiagnostics(
  sessionId: string,
  sessionState: SessionStateManager,
  diagnostics: vscode.DiagnosticCollection,
  result: WarmRebuildResult
): void {
  clearRebuildDiagnostics(sessionId, sessionState, diagnostics);
  if (result.location === undefined) {
    return;
  }

  const uri = vscode.Uri.file(result.location.path);
  const startLine = Math.max(0, result.location.line - 1);
  const startCharacter = Math.max(0, (result.location.column ?? 1) - 1);
  const endCharacter = Math.max(startCharacter + 1, result.location.sourceLine?.length ?? 1);
  const range = new vscode.Range(startLine, startCharacter, startLine, endCharacter);
  const diagnosticMessage = result.detail?.split(/\r?\n/, 1)[0] ?? result.summary;
  const diagnostic = new vscode.Diagnostic(
    range,
    diagnosticMessage,
    vscode.DiagnosticSeverity.Error
  );
  diagnostics.set(uri, [diagnostic]);
  sessionState.rebuildDiagnosticUris.set(sessionId, uri);
}

async function runWarmRebuild(
  session: vscode.DebugSession,
  sessionState: SessionStateManager,
  output: vscode.OutputChannel,
  diagnostics: vscode.DiagnosticCollection
): Promise<void> {
  if (sessionState.rebuildInFlight.has(session.id)) {
    sessionState.rebuildPending.add(session.id);
    return;
  }

  sessionState.rebuildInFlight.add(session.id);
  try {
    const response: unknown = await session.customRequest('debug80/rebuildWarm', {});
    if (isWarmRebuildResult(response)) {
      if (response.ok) {
        clearRebuildDiagnostics(session.id, sessionState, diagnostics);
        output.appendLine(response.summary);
      } else {
        applyRebuildDiagnostics(session.id, sessionState, diagnostics, response);
        output.appendLine(response.summary);
        if (response.detail !== undefined && response.detail.length > 0) {
          output.appendLine(response.detail);
        }
        output.show(true);
      }
      return;
    }

    clearRebuildDiagnostics(session.id, sessionState, diagnostics);
  } catch (err) {
    output.appendLine(`Debug80: warm rebuild failed: ${String(err)}`);
    output.show(true);
  } finally {
    sessionState.rebuildInFlight.delete(session.id);
    if (sessionState.rebuildPending.delete(session.id)) {
      void runWarmRebuild(session, sessionState, output, diagnostics);
    }
  }
}

export function registerAutoRebuildOnSave(
  context: vscode.ExtensionContext,
  sessionState: SessionStateManager,
  output: vscode.OutputChannel,
  diagnostics: vscode.DiagnosticCollection
): void {
  if (typeof vscode.workspace.onDidSaveTextDocument !== 'function') {
    return;
  }

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (!isAssemblyDocument(document)) {
        return;
      }
      const session = vscode.debug.activeDebugSession;
      if (!session || session.type !== 'z80') {
        return;
      }
      const sessionFolder = session.workspaceFolder?.uri.fsPath;
      if (
        typeof sessionFolder === 'string' &&
        sessionFolder.length > 0 &&
        !document.uri.fsPath.startsWith(sessionFolder)
      ) {
        return;
      }

      const existing = sessionState.rebuildTimers.get(session.id);
      if (existing !== undefined) {
        clearTimeout(existing);
      }
      const timer = setTimeout(() => {
        sessionState.rebuildTimers.delete(session.id);
        void runWarmRebuild(session, sessionState, output, diagnostics);
      }, REBUILD_DEBOUNCE_MS);
      sessionState.rebuildTimers.set(session.id, timer);
    })
  );
}