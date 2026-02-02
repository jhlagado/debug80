/**
 * @file VS Code extension entry and UI wiring for Debug80.
 */

import * as vscode from 'vscode';
import { Z80DebugAdapterFactory } from '../debug/adapter';
import * as fs from 'fs';
import * as path from 'path';
import { ensureDirExists, inferDefaultTarget } from '../debug/config-utils';
import { SessionStateManager } from './session-state-manager';
import { PlatformViewProvider } from './platform-view-provider';

const sessionState = new SessionStateManager();
const TERMINAL_BUFFER_MAX = 50_000;
const TERMINAL_FLUSH_MS = 50;
let enforceSourceColumn = false;
let movingEditor = false;
const DEFAULT_SOURCE_COLUMN = vscode.ViewColumn.One;
const DEFAULT_PANEL_COLUMN = vscode.ViewColumn.Two;
const ASM_LANGUAGE_ID = 'asm-collection';
const platformViewProvider = new PlatformViewProvider();

/**
 * Activates the Debug80 extension and registers commands/providers.
 */
export function activate(context: vscode.ExtensionContext): void {
  const factory = new Z80DebugAdapterFactory();
  let supportsAsmCollection: boolean | undefined;

  const ensureAsmLanguage = (doc: vscode.TextDocument): void => {
    if (supportsAsmCollection === false) {
      return;
    }
    if (!doc.uri.path.toLowerCase().endsWith('.asm')) {
      return;
    }
    if (doc.languageId === ASM_LANGUAGE_ID) {
      return;
    }
    const scheme = doc.uri.scheme;
    if (scheme !== 'file' && scheme !== 'untitled') {
      return;
    }
    void vscode.languages.setTextDocumentLanguage(doc, ASM_LANGUAGE_ID);
  };

  void vscode.languages.getLanguages().then((languages) => {
    supportsAsmCollection = languages.includes(ASM_LANGUAGE_ID);
    if (supportsAsmCollection) {
      for (const doc of vscode.workspace.textDocuments) {
        ensureAsmLanguage(doc);
      }
    }
  });

  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory('z80', factory)
  );

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      ensureAsmLanguage(doc);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.createProject', async () => {
      return scaffoldProject(true);
    })
  );

  // --- Sidebar platform view ---
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      PlatformViewProvider.viewType,
      platformViewProvider
    )
  );

  // Set debug80.hasProject context key based on workspace contents.
  const updateHasProject = (): void => {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const hasProject = folders.some((folder) =>
      fs.existsSync(path.join(folder.uri.fsPath, '.vscode', 'debug80.json'))
    );
    void vscode.commands.executeCommand('setContext', 'debug80.hasProject', hasProject);
  };
  updateHasProject();

  const configWatcher = vscode.workspace.createFileSystemWatcher('**/.vscode/debug80.json');
  configWatcher.onDidCreate(updateHasProject);
  configWatcher.onDidDelete(updateHasProject);
  context.subscriptions.push(configWatcher);

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(updateHasProject)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.terminalInput', async () => {
      const session = vscode.debug.activeDebugSession;
      if (!session || session.type !== 'z80') {
        void vscode.window.showErrorMessage('Debug80: No active z80 debug session.');
        return;
      }
      const input = await vscode.window.showInputBox({
        prompt: 'Enter text to send to the target terminal',
        placeHolder: 'text',
      });
      if (input === undefined) {
        return;
      }
      const payload = input.endsWith('\n') ? input : `${input}\n`;
      try {
        await session.customRequest('debug80/terminalInput', { text: payload });
      } catch (err) {
        void vscode.window.showErrorMessage(`Debug80: Failed to send input: ${String(err)}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.openTerminal', () => {
      const session = vscode.debug.activeDebugSession;
      if (!session || session.type !== 'z80') {
        openTerminalPanel(undefined, { focus: true });
        return;
      }
      const columns = getSessionColumns(session);
      openTerminalPanel(session, { focus: true, column: columns.panel });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.openTec1', () => {
      const session = vscode.debug.activeDebugSession;
      if (session && session.type === 'z80') {
        platformViewProvider.setPlatform('tec1', session, {
          focus: true,
          reveal: true,
          tab: 'ui',
        });
        return;
      }
      platformViewProvider.setPlatform('tec1', undefined, {
        focus: true,
        reveal: true,
        tab: 'ui',
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.openTec1Memory', () => {
      const session = vscode.debug.activeDebugSession;
      if (session && session.type === 'z80') {
        platformViewProvider.setPlatform('tec1', session, {
          focus: true,
          reveal: true,
          tab: 'memory',
        });
        return;
      }
      platformViewProvider.setPlatform('tec1', undefined, {
        focus: true,
        reveal: true,
        tab: 'memory',
      });
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.openRomSource', async () => {
      const session = vscode.debug.activeDebugSession;
      if (!session || session.type !== 'z80') {
        void vscode.window.showErrorMessage('Debug80: No active z80 debug session.');
        return;
      }
      try {
        const sources = await fetchRomSources(session);
        if (sources.length === 0) {
          void vscode.window.showInformationMessage(
            'Debug80: No ROM sources available for this session.'
          );
          return;
        }
        const items = sources.map((source) => ({
          label: source.label,
          description: source.kind === 'listing' ? 'listing' : 'source',
          detail: source.path,
          path: source.path,
        }));
        const picked = await vscode.window.showQuickPick(items, {
          placeHolder: 'Open ROM listing/source',
          matchOnDescription: true,
          matchOnDetail: true,
        });
        if (!picked) {
          return;
        }
        const doc = await vscode.workspace.openTextDocument(picked.path);
        const columns = getSessionColumns(session);
        await vscode.window.showTextDocument(doc, { preview: false, viewColumn: columns.source });
      } catch (err) {
        void vscode.window.showErrorMessage(
          `Debug80: Failed to list ROM sources: ${String(err)}`
        );
      }
    })
  );

  context.subscriptions.push(
    vscode.debug.onDidStartDebugSession((session) => {
      if (session.type === 'z80') {
        sessionState.activeZ80Sessions.add(session.id);
        enforceSourceColumn = true;
        clearTerminal();
        platformViewProvider.clear();
        sessionState.sessionPlatforms.delete(session.id);
        sessionState.sessionColumns.set(session.id, resolveSessionColumns(session));
        if (session.configuration?.openRomSourcesOnLaunch !== false) {
          const sessionId = session.id;
          const column = getSessionColumns(session).source;
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
        sessionState.activeZ80Sessions.delete(session.id);
        sessionState.sessionPlatforms.delete(session.id);
        sessionState.romSourcesOpenedSessions.delete(session.id);
        sessionState.mainSourceOpenedSessions.delete(session.id);
        sessionState.sessionColumns.delete(session.id);
        if (sessionState.activeZ80Sessions.size === 0) {
          enforceSourceColumn = false;
        }
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
        if (id === 'tec1') {
          platformViewProvider.setPlatform('tec1', evt.session, {
            focus: false,
            reveal: true,
            tab: 'ui',
          });
        } else if (id === 'tec1g') {
          platformViewProvider.setPlatform('tec1g', evt.session, {
            focus: false,
            reveal: true,
            tab: 'ui',
          });
          if (body?.uiVisibility) {
            platformViewProvider.setTec1gUiVisibility(body.uiVisibility, false);
          }
        } else {
          const columns = getSessionColumns(evt.session);
          openTerminalPanel(evt.session, {
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
          const sourceColumn = getSessionColumns(evt.session).source;
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
        if (sessionState.terminalPanel === undefined) {
          const column = getSessionColumns(evt.session).panel;
          openTerminalPanel(evt.session, { focus: false, reveal: true, column });
        }
        appendTerminalOutput(text);
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
          glcd: payload.glcd,
          speaker: payload.speaker ?? 0,
          speedMode: payload.speedMode ?? 'slow',
          lcd: payload.lcd,
          ...(payload.glcdDdram !== undefined ? { glcdDdram: payload.glcdDdram } : {}),
          ...(payload.glcdState !== undefined ? { glcdState: payload.glcdState } : {}),
        };
        if (payload.speakerHz !== undefined) {
          platformViewProvider.updateTec1g({ ...update, speakerHz: payload.speakerHz }, evt.session.id);
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
        const columns = getSessionColumns(evt.session);
        const viewColumn = columns.source;
        void vscode.workspace
          .openTextDocument(sourcePath)
          .then((doc) =>
            vscode.window.showTextDocument(doc, { preview: false, viewColumn })
          )
          .then(() => {
            const openRomSources = evt.session.configuration?.openRomSourcesOnLaunch !== false;
            if (!openRomSources || sessionState.romSourcesOpenedSessions.has(evt.session.id)) {
              return;
            }
            return openRomSourcesForSession(evt.session, viewColumn).then((opened) => {
              if (opened) {
                sessionState.romSourcesOpenedSessions.add(evt.session.id);
              }
            });
          });
        return;
      }
    })
  );

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (!enforceSourceColumn || movingEditor || editor === undefined) {
        return;
      }
      if (!isSourceDocument(editor.document)) {
        return;
      }
      const activeSession = vscode.debug.activeDebugSession;
      const preferred =
        activeSession && activeSession.type === 'z80'
          ? getSessionColumns(activeSession).source
          : getPrimaryEditorColumn();
      const column = editor.viewColumn;
      if (column === undefined || column === preferred) {
        return;
      }
      movingEditor = true;
      void vscode.window
        .showTextDocument(editor.document, {
          viewColumn: preferred,
          preserveFocus: true,
          preview: false,
        })
        .then(() => closeDocumentTabsInOtherGroups(editor.document.uri, preferred))
        .then(
          () => {
            movingEditor = false;
          },
          () => {
            movingEditor = false;
          }
        );
    })
  );
}

/**
 * Disposes extension resources on deactivation.
 */
export function deactivate(): void {
  // Nothing to clean up
}

type RomSource = { label: string; path: string; kind: 'listing' | 'source' };

/**
 * Queries the debug adapter for ROM listing/source paths.
 */
async function fetchRomSources(session: vscode.DebugSession): Promise<RomSource[]> {
  const payload = (await session.customRequest('debug80/romSources')) as
    | { sources?: Array<{ label?: string; path?: string; kind?: string }> }
    | undefined;
  const sources =
    payload?.sources?.filter(
      (source) => typeof source.path === 'string' && source.path.length > 0
    ) ?? [];
  return sources.map((source) => ({
    label: source.label ?? path.basename(source.path ?? ''),
    path: source.path ?? '',
    kind: source.kind === 'listing' ? 'listing' : 'source',
  }));
}

/**
 * Opens ROM sources/listings associated with a debug session.
 */
async function openRomSourcesForSession(
  session: vscode.DebugSession,
  viewColumn?: vscode.ViewColumn
): Promise<boolean> {
  const attemptOpen = async (): Promise<boolean> => {
    const sources = await fetchRomSources(session);
    if (sources.length === 0) {
      return false;
    }
    const preferred = sources.filter((source) => source.kind === 'source');
    const targets = preferred.length > 0 ? preferred : sources;
    const seen = new Set<string>();
    for (const source of targets) {
      if (source.path === '' || seen.has(source.path)) {
        continue;
      }
      seen.add(source.path);
      const doc = await vscode.workspace.openTextDocument(source.path);
      await vscode.window.showTextDocument(doc, {
        preview: false,
        preserveFocus: true,
        ...(viewColumn !== undefined ? { viewColumn } : {}),
      });
    }
    return true;
  };

  const attemptDelays = [0, 200, 400, 800, 1200, 1600];
  let lastError: unknown;
  for (const delay of attemptDelays) {
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    try {
      const opened = await attemptOpen();
      if (opened) {
        return true;
      }
    } catch (err) {
      lastError = err;
    }
  }
  if (lastError !== undefined) {
    void vscode.window.showErrorMessage(
      `Debug80: Failed to open ROM sources: ${String(lastError)}`
    );
  }
  return false;
}

/**
 * Scaffolds a debug80 config (and optional launch config) in the workspace.
 */
async function scaffoldProject(includeLaunch: boolean): Promise<boolean> {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) {
    void vscode.window.showErrorMessage('Debug80: No workspace folder open.');
    return false;
  }

  const workspaceRoot = folder.uri.fsPath;
  const vscodeDir = path.join(workspaceRoot, '.vscode');
  const configPath = path.join(vscodeDir, 'debug80.json');
  const launchPath = path.join(vscodeDir, 'launch.json');
  const configExists = fs.existsSync(configPath);

  const inferred = inferDefaultTarget(workspaceRoot);

  let proceed = true;
  if (!configExists) {
    const choice = await vscode.window.showInformationMessage(
      inferred.found
        ? `Debug80: Create .vscode/debug80.json targeting ${inferred.sourceFile}?`
        : `Debug80: Create .vscode/debug80.json targeting ${inferred.sourceFile}? (file not found yet)`,
      { modal: true },
      'Create'
    );
    proceed = choice === 'Create';
  }

  if (!proceed) {
    return false;
  }

  ensureDirExists(path.join(workspaceRoot, path.dirname(inferred.sourceFile)));
  ensureDirExists(path.join(workspaceRoot, inferred.outputDir));
  ensureDirExists(vscodeDir);
  if (includeLaunch) {
    ensureDirExists(vscodeDir);
  }

  let created = false;

  if (!configExists) {
    const defaultConfig = {
      defaultTarget: 'app',
      targets: {
        app: {
          sourceFile: inferred.sourceFile,
          outputDir: inferred.outputDir,
          artifactBase: inferred.artifactBase,
          platform: 'simple',
          simple: {
            regions: [
              { start: 0, end: 2047, kind: 'rom' },
              { start: 2048, end: 65535, kind: 'ram' },
            ],
            appStart: 0x0900,
            entry: 0,
          },
        },
      },
    };

    try {
      fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
      void vscode.window.showInformationMessage(
        `Debug80: Created .vscode/debug80.json targeting ${inferred.sourceFile}.`
      );
      created = true;
    } catch (err) {
      void vscode.window.showErrorMessage(
        `Debug80: Failed to write .vscode/debug80.json: ${String(err)}`
      );
      return false;
    }
  } else if (!includeLaunch) {
    void vscode.window.showInformationMessage('.vscode/debug80.json already exists.');
  }

  if (includeLaunch) {
    if (!fs.existsSync(launchPath)) {
      const launchConfig = {
        version: '0.2.0',
        configurations: [
          {
            name: 'Debug (debug80)',
            type: 'z80',
            request: 'launch',
            projectConfig: '${workspaceFolder}/.vscode/debug80.json',
            target: 'app',
            stopOnEntry: false,
          },
        ],
      };
      try {
        fs.writeFileSync(launchPath, JSON.stringify(launchConfig, null, 2));
        void vscode.window.showInformationMessage(
          'Debug80: Created .vscode/launch.json for debug80.'
        );
        created = true;
      } catch (err) {
        void vscode.window.showErrorMessage(
          `Debug80: Failed to write .vscode/launch.json: ${String(err)}`
        );
        return created;
      }
    } else {
      void vscode.window.showInformationMessage(
        'Debug80: .vscode/launch.json already exists; not overwriting.'
      );
    }
  }

  return created;
}

/**
 * Returns the preferred editor column for source files.
 */
function getPrimaryEditorColumn(): vscode.ViewColumn {
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

/**
 * Returns the preferred editor column for terminal panels.
 */
function getTerminalColumn(): vscode.ViewColumn {
  const activeSession = vscode.debug.activeDebugSession;
  if (activeSession && activeSession.type === 'z80') {
    return getSessionColumns(activeSession).panel;
  }
  return DEFAULT_PANEL_COLUMN;
}

/**
 * Normalizes a column number into a valid ViewColumn.
 */
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

/**
 * Resolves target columns for a debug session.
 */
function resolveSessionColumns(session: vscode.DebugSession): {
  source: vscode.ViewColumn;
  panel: vscode.ViewColumn;
} {
  const config = session.configuration ?? {};
  return {
    source: normalizeColumn(config.sourceColumn, DEFAULT_SOURCE_COLUMN),
    panel: normalizeColumn(config.panelColumn, DEFAULT_PANEL_COLUMN),
  };
}

/**
 * Returns memoized columns for a debug session.
 */
function getSessionColumns(session: vscode.DebugSession): {
  source: vscode.ViewColumn;
  panel: vscode.ViewColumn;
} {
  return sessionState.sessionColumns.get(session.id) ?? resolveSessionColumns(session);
}

/**
 * Checks whether a document is a source-like file for Debug80.
 */
function isSourceDocument(doc: vscode.TextDocument): boolean {
  if (doc.uri.scheme !== 'file') {
    return false;
  }
  const ext = path.extname(doc.fileName).toLowerCase();
  return ext === '.asm' || ext === '.lst';
}

/**
 * Closes matching documents in editor groups other than the target column.
 */
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

/**
 * Opens (or reveals) the Debug80 terminal webview.
 */
function openTerminalPanel(
  session?: vscode.DebugSession,
  options?: { focus?: boolean; reveal?: boolean; column?: vscode.ViewColumn }
): void {
  const focus = options?.focus ?? false;
  const reveal = options?.reveal ?? true;
  const targetColumn = options?.column ?? getTerminalColumn();
  if (sessionState.terminalPanel === undefined) {
    sessionState.terminalPanel = vscode.window.createWebviewPanel(
      'debug80Terminal',
      'Debug80 Terminal',
      targetColumn,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    sessionState.terminalPanel.onDidDispose(() => {
      sessionState.terminalPanel = undefined;
      sessionState.terminalSession = undefined;
      if (sessionState.terminalFlushTimer !== undefined) {
        clearTimeout(sessionState.terminalFlushTimer);
        sessionState.terminalFlushTimer = undefined;
      }
      sessionState.resetTerminalState();
    });
    sessionState.terminalPanel.webview.onDidReceiveMessage(async (msg: { type?: string; text?: string }) => {
      if (msg.type === 'input' && typeof msg.text === 'string') {
        const targetSession = sessionState.terminalSession ?? vscode.debug.activeDebugSession;
        if (targetSession?.type === 'z80') {
          try {
            await targetSession.customRequest('debug80/terminalInput', { text: msg.text });
          } catch {
            // ignore
          }
        }
      }
      if (msg.type === 'break') {
        const targetSession = sessionState.terminalSession ?? vscode.debug.activeDebugSession;
        if (targetSession?.type === 'z80') {
          try {
            await targetSession.customRequest('debug80/terminalBreak', {});
          } catch {
            /* ignore */
          }
        }
      }
    });
  }
  if (session !== undefined) {
    sessionState.terminalSession = session;
  }
  if (reveal) {
    sessionState.terminalPanel.reveal(targetColumn, !focus);
  }
  sessionState.terminalPanel.webview.html = getTerminalHtml(sessionState.terminalBuffer);
  sessionState.terminalPendingOutput = '';
  sessionState.terminalNeedsFullRefresh = false;
}

/**
 * Appends terminal output and schedules a UI refresh.
 */
function appendTerminalOutput(text: string): void {
  const { remaining, shouldClear } = stripAndDetectClear(text);
  if (shouldClear) {
    clearTerminal();
  }
  if (remaining.length === 0) {
    return;
  }
  sessionState.terminalBuffer += remaining;
  if (sessionState.terminalBuffer.length > TERMINAL_BUFFER_MAX) {
    sessionState.terminalBuffer = sessionState.terminalBuffer.slice(sessionState.terminalBuffer.length - TERMINAL_BUFFER_MAX);
    sessionState.terminalNeedsFullRefresh = true;
    sessionState.terminalPendingOutput = '';
  }
  if (sessionState.terminalPanel !== undefined) {
    if (sessionState.terminalNeedsFullRefresh) {
      scheduleTerminalFlush();
      return;
    }
    sessionState.terminalPendingOutput += remaining;
    scheduleTerminalFlush();
  }
}

/**
 * Clears the terminal buffer and forces a full refresh.
 */
function clearTerminal(): void {
  sessionState.resetTerminalState();
  if (sessionState.terminalFlushTimer !== undefined) {
    clearTimeout(sessionState.terminalFlushTimer);
    sessionState.terminalFlushTimer = undefined;
  }
  if (sessionState.terminalPanel !== undefined) {
    void sessionState.terminalPanel.webview.postMessage({ type: 'clear' });
  }
}

/**
 * Builds the terminal webview HTML.
 */
function getTerminalHtml(initial: string): string {
  const escaped = initial.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!DOCTYPE html>
<html lang="en">
<body style="font-family: monospace; padding: 8px;">
  <pre id="out" style="white-space: pre-wrap; word-break: break-word;">${escaped}</pre>
  <div style="margin-top:8px;">
    <input id="input" type="text" style="width:80%;" placeholder="Type and press Enter"/>
    <button id="send">Send</button>
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    const out = document.getElementById('out');
    const input = document.getElementById('input');
    const send = document.getElementById('send');
    window.addEventListener('message', event => {
      const msg = event.data;
      if (msg.type === 'clear') {
        out.textContent = '';
        return;
      }
      if (msg.type === 'output' && typeof msg.text === 'string') {
        out.textContent += msg.text;
        window.scrollTo(0, document.body.scrollHeight);
      }
    });
    function sendInput() {
      const text = input.value;
      const payload = text + "\\n";
      out.textContent += payload;
      window.scrollTo(0, document.body.scrollHeight);
      vscode.postMessage({ type: 'input', text: payload });
      input.value = '';
      input.focus();
    }
    send.addEventListener('click', sendInput);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        sendInput();
      } else if (e.key === 'c' && e.ctrlKey) {
        vscode.postMessage({ type: 'break' });
      }
    });
    input.focus();
  </script>
</body>
</html>`;
}

/**
 * Schedules a batched terminal refresh.
 */
function scheduleTerminalFlush(): void {
  if (sessionState.terminalFlushTimer !== undefined) {
    return;
  }
  sessionState.terminalFlushTimer = setTimeout(() => {
    sessionState.terminalFlushTimer = undefined;
    if (sessionState.terminalPanel === undefined) {
      return;
    }
    if (sessionState.terminalNeedsFullRefresh) {
      void sessionState.terminalPanel.webview.postMessage({ type: 'clear' });
      void sessionState.terminalPanel.webview.postMessage({ type: 'output', text: sessionState.terminalBuffer });
      sessionState.terminalNeedsFullRefresh = false;
      sessionState.terminalPendingOutput = '';
      return;
    }
    if (sessionState.terminalPendingOutput.length > 0) {
      void sessionState.terminalPanel.webview.postMessage({ type: 'output', text: sessionState.terminalPendingOutput });
      sessionState.terminalPendingOutput = '';
    }
  }, TERMINAL_FLUSH_MS);
}

/**
 * Strips clear-screen control sequences and returns remaining text.
 */
function stripAndDetectClear(text: string): { remaining: string; shouldClear: boolean } {
  // The adapter emits terminal output a byte at a time, so ANSI escape sequences
  // (e.g. ESC[2J ESC[H) can arrive split across multiple events. Track a small
  // carry buffer so we can correctly consume them.
  const input = sessionState.terminalAnsiCarry + text;
  sessionState.terminalAnsiCarry = '';

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

    // Support CSI sequences: ESC [ params letter
    if (esc.length === 2) {
      // If it's not CSI, treat it as text and move on.
      if (esc[1] !== '[') {
        flushEscAsText();
      }
      continue;
    }

    const final = esc[esc.length - 1] ?? '';
    const isFinal = /^[A-Za-z]$/.test(final);
    if (!isFinal) {
      // Bound the maximum length we will buffer for an ANSI sequence.
      if (esc.length > 32) {
        flushEscAsText();
      }
      continue;
    }

    // We have a complete CSI sequence; decide whether to clear.
    if (final === 'J') {
      shouldClear = true;
    }

    // Consume the escape sequence (do not emit).
    esc = '';
  }

  // If we ended mid-escape, carry it to the next chunk.
  if (esc.length > 0) {
    sessionState.terminalAnsiCarry = esc;
  }

  return { remaining, shouldClear };
}
