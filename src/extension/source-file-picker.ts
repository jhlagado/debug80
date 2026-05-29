/**
 * @fileoverview Source file picker commands for project and ROM sources.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { fetchRomSources } from './rom-sources';
import { SourceColumnController } from './source-columns';
import { WorkspaceSelectionController } from './workspace-selection';
import { resolveSessionWorkspaceFolder } from './debug-session-actions';

type SourceFilePickItem = vscode.QuickPickItem & {
  path: string;
};

export async function openPickedSourceFile(
  sourceColumns: SourceColumnController,
  options: {
    workspaceSelection: WorkspaceSelectionController;
    romOnly?: boolean;
  }
): Promise<boolean | undefined> {
  const session = vscode.debug.activeDebugSession;
  const items: SourceFilePickItem[] = [];

  if (session?.type === 'z80') {
    const romSources = await fetchRomSources(session);
    for (const source of romSources) {
      items.push({
        label: source.label,
        description: 'ROM source',
        detail: source.path,
        path: source.path,
      });
    }
  } else if (options.romOnly === true) {
    void vscode.window.showErrorMessage('Debug80: No active z80 debug session.');
    return false;
  }

  if (options.romOnly !== true) {
    const folder =
      session?.type === 'z80'
        ? resolveSessionWorkspaceFolder(session)
        : await options.workspaceSelection.resolveWorkspaceFolder({
            prompt: true,
            requireProject: false,
            placeHolder: 'Select the workspace folder to browse',
          });
    if (folder !== undefined) {
      for (const source of listWorkspaceSourceFiles(folder.uri.fsPath)) {
        items.push({
          label: source,
          description: 'project source',
          detail: path.join(folder.uri.fsPath, source),
          path: path.join(folder.uri.fsPath, source),
        });
      }
    }
  }

  if (items.length === 0) {
    void vscode.window.showInformationMessage(
      options.romOnly === true
        ? 'Debug80: No ROM sources available for this session.'
        : 'Debug80: No source files available.'
    );
    return false;
  }

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: options.romOnly === true ? 'Open ROM source' : 'Open Debug80 source file',
    matchOnDescription: true,
    matchOnDetail: true,
  });
  if (!picked) {
    return undefined;
  }
  const doc = await vscode.workspace.openTextDocument(picked.path);
  const columns = session?.type === 'z80' ? sourceColumns.getSessionColumns(session) : undefined;
  await vscode.window.showTextDocument(doc, {
    preview: false,
    ...(columns !== undefined ? { viewColumn: columns.source } : {}),
  });
  return true;
}

function listWorkspaceSourceFiles(rootPath: string): string[] {
  const results: string[] = [];
  collectWorkspaceSourceFiles(rootPath, rootPath, results);
  return results.sort((a, b) => a.localeCompare(b));
}

function collectWorkspaceSourceFiles(
  rootPath: string,
  currentPath: string,
  results: string[]
): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(currentPath, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const fullPath = path.join(currentPath, entry.name);
    if (entry.isDirectory()) {
      const lower = entry.name.toLowerCase();
      if (lower === '.git' || lower === 'node_modules' || lower === 'build' || lower === 'out') {
        continue;
      }
      collectWorkspaceSourceFiles(rootPath, fullPath, results);
      continue;
    }
    if (!entry.isFile() || !/\.(asm|z80|asmi)$/i.test(entry.name)) {
      continue;
    }
    results.push(path.relative(rootPath, fullPath).split(path.sep).join('/'));
  }
}
