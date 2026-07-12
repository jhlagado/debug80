/**
 * @file Terminal webview state and rendering for Debug80.
 */

import * as vscode from 'vscode';
import { SessionStateManager } from './session-state-manager';
import { getTerminalHtml } from './terminal-panel-html';

const TERMINAL_BUFFER_MAX = 50_000;
const TERMINAL_FLUSH_MS = 50;
const DEFAULT_PANEL_COLUMN = vscode.ViewColumn.Two;

export class TerminalPanelController {
  constructor(
    private readonly sessionState: SessionStateManager,
    private readonly getPanelColumn: (session: vscode.DebugSession) => vscode.ViewColumn,
    private readonly extensionUri: { fsPath: string }
  ) {}

  hasPanel(): boolean {
    return this.sessionState.terminalPanel !== undefined;
  }

  open(
    session?: vscode.DebugSession,
    options?: { focus?: boolean; reveal?: boolean; column?: vscode.ViewColumn }
  ): void {
    const focus = options?.focus ?? false;
    const reveal = options?.reveal ?? true;
    const targetColumn = options?.column ?? this.getTerminalColumn();
    if (this.sessionState.terminalPanel === undefined) {
      this.sessionState.terminalPanel = vscode.window.createWebviewPanel(
        'debug80Terminal',
        'Debug80 Terminal',
        targetColumn,
        { enableScripts: true, retainContextWhenHidden: true }
      );
      this.sessionState.terminalPanel.onDidDispose(() => {
        this.sessionState.terminalPanel = undefined;
        this.sessionState.terminalSession = undefined;
        if (this.sessionState.terminalFlushTimer !== undefined) {
          clearTimeout(this.sessionState.terminalFlushTimer);
          this.sessionState.terminalFlushTimer = undefined;
        }
        this.sessionState.resetTerminalState();
      });
      this.sessionState.terminalPanel.webview.onDidReceiveMessage(
        async (msg: { type?: string; text?: string }) => {
          if (msg.type === 'input' && typeof msg.text === 'string') {
            const targetSession =
              this.sessionState.terminalSession ?? vscode.debug.activeDebugSession;
            if (targetSession?.type === 'z80') {
              try {
                await targetSession.customRequest('debug80/terminalInput', { text: msg.text });
              } catch {
                // ignore
              }
            }
          }
          if (msg.type === 'break') {
            const targetSession =
              this.sessionState.terminalSession ?? vscode.debug.activeDebugSession;
            if (targetSession?.type === 'z80') {
              try {
                await targetSession.customRequest('debug80/terminalBreak', {});
              } catch {
                // ignore
              }
            }
          }
        }
      );
    }
    if (session !== undefined) {
      this.sessionState.terminalSession = session;
    }
    if (reveal) {
      this.sessionState.terminalPanel.reveal(targetColumn, !focus);
    }
    this.sessionState.terminalPanel.webview.html = getTerminalHtml(
      this.sessionState.terminalBuffer,
      this.extensionUri
    );
    this.sessionState.terminalPendingOutput = '';
    this.sessionState.terminalNeedsFullRefresh = false;
  }

  appendOutput(text: string): void {
    const { remaining, shouldClear } = this.stripAndDetectClear(text);
    if (shouldClear) {
      this.clear();
    }
    if (remaining.length === 0) {
      return;
    }
    this.sessionState.terminalBuffer += remaining;
    if (this.sessionState.terminalBuffer.length > TERMINAL_BUFFER_MAX) {
      this.sessionState.terminalBuffer = this.sessionState.terminalBuffer.slice(
        this.sessionState.terminalBuffer.length - TERMINAL_BUFFER_MAX
      );
      this.sessionState.terminalNeedsFullRefresh = true;
      this.sessionState.terminalPendingOutput = '';
    }
    if (this.sessionState.terminalPanel !== undefined) {
      if (this.sessionState.terminalNeedsFullRefresh) {
        this.scheduleFlush();
        return;
      }
      this.sessionState.terminalPendingOutput += remaining;
      this.scheduleFlush();
    }
  }

  clear(): void {
    this.sessionState.resetTerminalState();
    if (this.sessionState.terminalFlushTimer !== undefined) {
      clearTimeout(this.sessionState.terminalFlushTimer);
      this.sessionState.terminalFlushTimer = undefined;
    }
    if (this.sessionState.terminalPanel !== undefined) {
      void this.sessionState.terminalPanel.webview.postMessage({ type: 'clear' });
    }
  }

  private getTerminalColumn(): vscode.ViewColumn {
    const activeSession = vscode.debug.activeDebugSession;
    if (activeSession && activeSession.type === 'z80') {
      return this.getPanelColumn(activeSession);
    }
    return DEFAULT_PANEL_COLUMN;
  }

  private scheduleFlush(): void {
    if (this.sessionState.terminalFlushTimer !== undefined) {
      return;
    }
    this.sessionState.terminalFlushTimer = setTimeout(() => {
      this.sessionState.terminalFlushTimer = undefined;
      if (this.sessionState.terminalPanel === undefined) {
        return;
      }
      if (this.sessionState.terminalNeedsFullRefresh) {
        void this.sessionState.terminalPanel.webview.postMessage({ type: 'clear' });
        void this.sessionState.terminalPanel.webview.postMessage({
          type: 'output',
          text: this.sessionState.terminalBuffer,
        });
        this.sessionState.terminalNeedsFullRefresh = false;
        this.sessionState.terminalPendingOutput = '';
        return;
      }
      if (this.sessionState.terminalPendingOutput.length > 0) {
        void this.sessionState.terminalPanel.webview.postMessage({
          type: 'output',
          text: this.sessionState.terminalPendingOutput,
        });
        this.sessionState.terminalPendingOutput = '';
      }
    }, TERMINAL_FLUSH_MS);
  }

  private stripAndDetectClear(text: string): { remaining: string; shouldClear: boolean } {
    const input = this.sessionState.terminalAnsiCarry + text;
    this.sessionState.terminalAnsiCarry = '';

    let remaining = '';
    let shouldClear = false;

    let esc = '';
    const flushEscAsText = (): void => {
      remaining += esc;
      esc = '';
    };

    for (let i = 0; i < input.length; i += 1) {
      const ch = input[i] ?? '';

      if (esc.length === 0) {
        if (ch === '\u001b') {
          esc = ch;
        } else {
          remaining += ch;
        }
        continue;
      }

      esc += ch;

      if (esc.length === 2) {
        if (esc[1] !== '[') {
          flushEscAsText();
        }
        continue;
      }

      const final = esc[esc.length - 1] ?? '';
      const isFinal = /^[A-Za-z]$/.test(final);
      if (!isFinal) {
        if (esc.length > 32) {
          flushEscAsText();
        }
        continue;
      }

      if (final === 'J') {
        shouldClear = true;
      }

      esc = '';
    }

    if (esc.length > 0) {
      this.sessionState.terminalAnsiCarry = esc;
    }

    return { remaining, shouldClear };
  }
}
