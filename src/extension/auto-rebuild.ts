/**
 * @fileoverview Auto rebuild-on-save support for active Debug80 sessions.
 */

import * as path from 'path';
import * as vscode from 'vscode';
import { SessionStateManager } from './session-state-manager';

const REBUILD_DEBOUNCE_MS = 250;
const ASSEMBLY_EXTENSIONS = new Set(['.asm', '.z80', '.a80', '.s']);

function isAssemblyDocument(document: vscode.TextDocument): boolean {
  if (document.isUntitled || document.uri.scheme !== 'file') {
    return false;
  }
  return ASSEMBLY_EXTENSIONS.has(path.extname(document.uri.fsPath).toLowerCase());
}

async function runWarmRebuild(
  session: vscode.DebugSession,
  sessionState: SessionStateManager,
  output: vscode.OutputChannel
): Promise<void> {
  if (sessionState.rebuildInFlight.has(session.id)) {
    sessionState.rebuildPending.add(session.id);
    return;
  }

  sessionState.rebuildInFlight.add(session.id);
  try {
    await session.customRequest('debug80/rebuildWarm', {});
  } catch (err) {
    output.appendLine(`Debug80: warm rebuild failed: ${String(err)}`);
    output.show(true);
  } finally {
    sessionState.rebuildInFlight.delete(session.id);
    if (sessionState.rebuildPending.delete(session.id)) {
      void runWarmRebuild(session, sessionState, output);
    }
  }
}

export function registerAutoRebuildOnSave(
  context: vscode.ExtensionContext,
  sessionState: SessionStateManager,
  output: vscode.OutputChannel
): void {
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
        void runWarmRebuild(session, sessionState, output);
      }, REBUILD_DEBOUNCE_MS);
      sessionState.rebuildTimers.set(session.id, timer);
    })
  );
}