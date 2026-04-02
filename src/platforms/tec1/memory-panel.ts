/**
 * @file TEC-1 memory panel webview controller.
 */

import * as vscode from 'vscode';

import { getTec1MemoryHtml } from './memory-panel-html';
import type { Tec1MemorySnapshotPayload } from './memory-panel-html';

export interface Tec1MemoryPanelController {
  open(
    session?: vscode.DebugSession,
    options?: { focus?: boolean; reveal?: boolean; column?: vscode.ViewColumn }
  ): void;
  handleSessionTerminated(sessionId: string): void;
}

/**
 * Creates the TEC-1 memory panel controller.
 */
export function createTec1MemoryPanelController(
  getTargetColumn: () => vscode.ViewColumn,
  getFallbackSession: () => vscode.DebugSession | undefined
): Tec1MemoryPanelController {
  let panel: vscode.WebviewPanel | undefined;
  let session: vscode.DebugSession | undefined;
  const windowBefore = 16;
  const rowSize = 16;
  const viewModes: Record<string, string> = { a: 'pc', b: 'sp', c: 'hl', d: 'de' };
  const viewAfter: Record<string, number> = { a: 16, b: 16, c: 16, d: 16 };
  const viewAddress: Record<string, number | undefined> = {
    a: undefined,
    b: undefined,
    c: undefined,
    d: undefined,
  };
  let refreshTimer: ReturnType<typeof setInterval> | undefined;
  let refreshInFlight = false;
  const autoRefreshMs = 150;

  const open = (
    targetSession?: vscode.DebugSession,
    options?: { focus?: boolean; reveal?: boolean; column?: vscode.ViewColumn }
  ): void => {
    const focus = options?.focus ?? false;
    const reveal = options?.reveal ?? true;
    const targetColumn = options?.column ?? getTargetColumn();
    if (panel === undefined) {
      panel = vscode.window.createWebviewPanel(
        'debug80Tec1Memory',
        'Debug80 TEC-1 Memory',
        targetColumn,
        { enableScripts: true, retainContextWhenHidden: true }
      );
      panel.onDidDispose(() => {
        stopAutoRefresh();
        panel = undefined;
        session = undefined;
      });
      panel.onDidChangeViewState((event) => {
        if (event.webviewPanel.visible) {
          startAutoRefresh();
        } else {
          stopAutoRefresh();
        }
      });
      panel.webview.onDidReceiveMessage(
        (msg: {
          type?: string;
          views?: Array<{ id?: string; view?: string; after?: number; address?: number }>;
        }) => {
          if (msg.type === 'refresh') {
            if (Array.isArray(msg.views)) {
              for (const entry of msg.views) {
                const id = typeof entry.id === 'string' ? entry.id : '';
                if (id !== 'a' && id !== 'b' && id !== 'c' && id !== 'd') {
                  continue;
                }
                const currentAfter = viewAfter[id] ?? 16;
                const afterSize = Number.isFinite(entry.after)
                  ? (entry.after as number)
                  : currentAfter;
                viewAfter[id] = clampWindow(afterSize);
                const currentView = viewModes[id] ?? 'hl';
                viewModes[id] = typeof entry.view === 'string' ? entry.view : currentView;
                viewAddress[id] =
                  typeof entry.address === 'number' && Number.isFinite(entry.address)
                    ? (entry.address & 0xffff)
                    : undefined;
              }
            }
            void refreshSnapshot(true);
          }
        }
      );
    }
    if (targetSession !== undefined) {
      session = targetSession;
    } else if (session === undefined) {
      session = getFallbackSession();
    }
    if (reveal) {
      panel.reveal(targetColumn, !focus);
    }
    panel.webview.html = getTec1MemoryHtml();
    void refreshSnapshot(true);
    startAutoRefresh();
  };

  const handleSessionTerminated = (sessionId: string): void => {
    if (session?.id === sessionId) {
      session = undefined;
    }
  };

  return {
    open,
    handleSessionTerminated,
  };

  /**
   * Requests a memory snapshot and posts it to the webview.
   */
  async function refreshSnapshot(allowErrors?: boolean): Promise<void> {
    if (panel === undefined) {
      return;
    }
    if (refreshInFlight) {
      return;
    }
    const target = session ?? getFallbackSession();
    if (!target || target.type !== 'z80') {
      if (allowErrors === true) {
        void panel.webview.postMessage({
          type: 'snapshotError',
          message: 'No active z80 session.',
        });
      }
      return;
    }
    refreshInFlight = true;
    try {
      const views = Object.keys(viewModes).map((id) => ({
        id,
        view: viewModes[id],
        after: viewAfter[id],
        address: viewModes[id] === 'absolute' ? viewAddress[id] : undefined,
      }));
      const payload = (await target.customRequest('debug80/tec1MemorySnapshot', {
        before: windowBefore,
        rowSize,
        views,
      })) as unknown;
      if (payload === null || payload === undefined || typeof payload !== 'object') {
        void panel.webview.postMessage({
          type: 'snapshotError',
          message: 'Invalid snapshot payload.',
        });
        return;
      }
      void panel.webview.postMessage({
        type: 'snapshot',
        ...(payload as Tec1MemorySnapshotPayload),
      });
    } catch (err) {
      if (allowErrors === true) {
        void panel.webview.postMessage({
          type: 'snapshotError',
          message: `Failed to read memory: ${String(err)}`,
        });
      }
    } finally {
      refreshInFlight = false;
    }
  }

  /**
   * Starts periodic snapshot refresh.
   */
  function startAutoRefresh(): void {
    if (refreshTimer !== undefined) {
      return;
    }
    refreshTimer = setInterval(() => {
      void refreshSnapshot(false);
    }, autoRefreshMs);
  }

  /**
   * Stops periodic snapshot refresh.
   */
  function stopAutoRefresh(): void {
    if (refreshTimer !== undefined) {
      clearInterval(refreshTimer);
      refreshTimer = undefined;
    }
  }
}

/**
 * Clamps memory window size to a safe range.
 */
function clampWindow(value: number): number {
  if (!Number.isFinite(value) || value < 1) {
    return 16;
  }
  return Math.min(1024, Math.max(1, Math.floor(value)));
}
