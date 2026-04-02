/**
 * @file ROM source helpers for Debug80 sessions.
 */

import * as path from 'path';
import * as vscode from 'vscode';

export type RomSource = { label: string; path: string; kind: 'listing' | 'source' };

export async function fetchRomSources(session: vscode.DebugSession): Promise<RomSource[]> {
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

export async function openRomSourcesForSession(
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
