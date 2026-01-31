/**
 * @fileoverview Session state container for Debug80 extension.
 */

import * as vscode from 'vscode';

/**
 * Container for mutable extension/session state.
 */
export class SessionStateManager {
  terminalPanel: vscode.WebviewPanel | undefined;
  terminalBuffer = '';
  terminalSession: vscode.DebugSession | undefined;
  terminalAnsiCarry = '';
  terminalPendingOutput = '';
  terminalFlushTimer: ReturnType<typeof setTimeout> | undefined;
  terminalNeedsFullRefresh = false;

  activeZ80Sessions = new Set<string>();
  sessionPlatforms = new Map<string, string>();
  romSourcesOpenedSessions = new Set<string>();
  mainSourceOpenedSessions = new Set<string>();
  sessionColumns = new Map<string, { source: vscode.ViewColumn; panel: vscode.ViewColumn }>();

  resetTerminalState(): void {
    this.terminalBuffer = '';
    this.terminalAnsiCarry = '';
    this.terminalPendingOutput = '';
    this.terminalNeedsFullRefresh = false;
  }
}
