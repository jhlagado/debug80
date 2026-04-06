/**
 * @file Command registration for the Debug80 extension.
 */

import * as path from 'path';
import * as vscode from 'vscode';
import { PlatformViewProvider } from './platform-view-provider';
import {
  findProjectConfigPath,
  listProjectSourceFiles,
  readProjectConfig,
  updateProjectTargetSource,
} from './project-config';
import {
  ProjectTargetSelectionController,
  resolvePreferredTargetName,
} from './project-target-selection';
import { scaffoldProject } from './project-scaffolding';
import { fetchRomSources } from './rom-sources';
import { SourceColumnController } from './source-columns';
import { TerminalPanelController } from './terminal-panel';
import { WorkspaceSelectionController } from './workspace-selection';

type CommandDependencies = {
  context: vscode.ExtensionContext;
  platformViewProvider: PlatformViewProvider;
  sourceColumns: SourceColumnController;
  terminalPanel: TerminalPanelController;
  workspaceSelection: WorkspaceSelectionController;
  targetSelection: ProjectTargetSelectionController;
};

async function resolveFolderForProjectCreation(
  workspaceSelection: WorkspaceSelectionController
): Promise<vscode.WorkspaceFolder | undefined> {
  const folder = await workspaceSelection.resolveWorkspaceFolder({
    prompt: true,
    placeHolder: 'Select a folder for the new Debug80 project',
  });
  if (folder !== undefined) {
    return folder;
  }

  const hasWorkspaceFolders = (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
  if (hasWorkspaceFolders) {
    return undefined;
  }

  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Use Folder for Debug80 Project',
    title: 'Select a folder for the new Debug80 project',
  });
  const folderUri = picked?.[0];
  if (folderUri === undefined) {
    return undefined;
  }

  const existingFolder = vscode.workspace.getWorkspaceFolder(folderUri);
  if (existingFolder !== undefined) {
    workspaceSelection.rememberWorkspace(existingFolder);
    return existingFolder;
  }

  const insertAt = vscode.workspace.workspaceFolders?.length ?? 0;
  const added = vscode.workspace.updateWorkspaceFolders(insertAt, 0, {
    uri: folderUri,
    name: path.basename(folderUri.fsPath),
  });
  if (!added) {
    void vscode.window.showErrorMessage('Debug80: Failed to add the selected folder to the workspace.');
    return undefined;
  }

  const addedFolder =
    vscode.workspace.getWorkspaceFolder(folderUri) ??
    ({
      uri: folderUri,
      name: path.basename(folderUri.fsPath),
      index: insertAt,
    } as vscode.WorkspaceFolder);
  workspaceSelection.rememberWorkspace(addedFolder);
  return addedFolder;
}

function resolveProjectFolderFromResource(
  resource: vscode.Uri | undefined,
  workspaceSelection: WorkspaceSelectionController
): vscode.WorkspaceFolder | undefined {
  if (resource === undefined) {
    return undefined;
  }

  const folder = vscode.workspace.getWorkspaceFolder(resource);
  if (folder === undefined) {
    return undefined;
  }

  const projectConfig = findProjectConfigPath(folder);
  if (projectConfig === undefined) {
    return undefined;
  }

  workspaceSelection.rememberWorkspace(folder);
  return folder;
}

async function startCurrentProjectDebugging(
  folder: vscode.WorkspaceFolder,
  workspaceSelection: WorkspaceSelectionController
): Promise<boolean> {
  const projectConfig = findProjectConfigPath(folder);
  if (projectConfig === undefined) {
    void vscode.window.showErrorMessage(
      `Debug80: Could not find a project config in ${folder.uri.fsPath}.`
    );
    return false;
  }

  workspaceSelection.rememberWorkspace(folder);
  return vscode.debug.startDebugging(folder, {
    type: 'z80',
    request: 'launch',
    name: 'Debug80: Current Project',
    projectConfig,
    stopOnEntry: false,
  });
}

export function registerExtensionCommands({
  context,
  platformViewProvider,
  sourceColumns,
  terminalPanel,
  workspaceSelection,
  targetSelection,
}: CommandDependencies): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.createProject', async () => {
      const folder = await resolveFolderForProjectCreation(workspaceSelection);
      if (!folder) {
        void vscode.window.showErrorMessage('Debug80: No workspace folder available for project creation.');
        return false;
      }
      const created = await scaffoldProject(folder, false);
      if (created) {
        workspaceSelection.rememberWorkspace(folder);
        platformViewProvider.refreshIdleView();
      }
      return created;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.startDebug', async () => {
      const folder = await workspaceSelection.resolveWorkspaceFolder({
        prompt: true,
        requireProject: true,
        placeHolder: 'Select the Debug80 project folder to debug',
      });
      if (!folder) {
        const workspaceFolderCount = vscode.workspace.workspaceFolders?.length ?? 0;
        void vscode.window.showInformationMessage(
          workspaceFolderCount === 0
            ? 'Debug80: No workspace folder open. Open or create a project folder first.'
            : 'Debug80: No configured Debug80 project found. Create a project first.'
        );
        return false;
      }
      return startCurrentProjectDebugging(folder, workspaceSelection);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.restartDebug', async () => {
      const folder = await workspaceSelection.resolveWorkspaceFolder({
        prompt: true,
        requireProject: true,
        placeHolder: 'Select the Debug80 project folder to debug',
      });
      if (!folder) {
        void vscode.window.showInformationMessage('Debug80: No configured Debug80 project found.');
        return false;
      }

      const activeSession = vscode.debug.activeDebugSession;
      if (activeSession?.type === 'z80') {
        await vscode.debug.stopDebugging(activeSession);
      }

      return startCurrentProjectDebugging(folder, workspaceSelection);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.selectWorkspaceFolder', async () => {
      const folder = await workspaceSelection.selectWorkspaceFolder();
      if (!folder) {
        return undefined;
      }

      platformViewProvider.refreshIdleView();

      const projectConfig = findProjectConfigPath(folder);
      if (projectConfig === undefined) {
        void vscode.window.showInformationMessage(
          `Debug80: Selected root ${folder.name}. This root does not contain a Debug80 project config.`
        );
        return folder;
      }

      const activeSession = vscode.debug.activeDebugSession;
      if (activeSession?.type === 'z80') {
        await vscode.debug.stopDebugging(activeSession);
        const restarted = await startCurrentProjectDebugging(folder, workspaceSelection);
        if (restarted) {
          void vscode.window.showInformationMessage(
            `Debug80: Switched to root ${folder.name} and restarted debugging.`
          );
        }
        return folder;
      }

      const started = await startCurrentProjectDebugging(folder, workspaceSelection);
      if (started) {
        void vscode.window.showInformationMessage(
          `Debug80: Selected root ${folder.name} and started debugging.`
        );
      }
      return folder;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.selectTarget', async () => {
      const folder = await workspaceSelection.resolveWorkspaceFolder({
        requireProject: true,
        prompt: true,
        placeHolder: 'Select the Debug80 project folder',
      });
      if (!folder) {
        void vscode.window.showInformationMessage('Debug80: No configured Debug80 project found.');
        return undefined;
      }

      const projectConfig = findProjectConfigPath(folder);
      if (projectConfig === undefined) {
        void vscode.window.showErrorMessage(
          `Debug80: Could not find a project config in ${folder.uri.fsPath}.`
        );
        return undefined;
      }

      const previousTarget = resolvePreferredTargetName(context.workspaceState, projectConfig);

      const target = await targetSelection.resolveTarget(projectConfig, {
        prompt: true,
        forcePrompt: true,
        placeHolder: 'Select the active Debug80 target',
      });
      if (target === null) {
        return undefined;
      }
      if (target === undefined) {
        void vscode.window.showInformationMessage(
          'Debug80: This project does not define any named targets.'
        );
        return undefined;
      }

      platformViewProvider.refreshIdleView();

      const activeSession = vscode.debug.activeDebugSession;
      if (activeSession?.type === 'z80' && target !== previousTarget) {
        await vscode.debug.stopDebugging(activeSession);
        const restarted = await startCurrentProjectDebugging(folder, workspaceSelection);
        if (restarted) {
          void vscode.window.showInformationMessage(
            `Debug80: Switched target to ${target} and restarted debugging.`
          );
          return target;
        }
      }

      if (activeSession?.type !== 'z80') {
        const started = await startCurrentProjectDebugging(folder, workspaceSelection);
        if (started) {
          void vscode.window.showInformationMessage(
            `Debug80: Selected target ${target} and started debugging.`
          );
          return target;
        }
      }

      void vscode.window.showInformationMessage(`Debug80: Selected target ${target}.`);
      return target;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.setEntrySource', async (resource?: vscode.Uri) => {
      const folder =
        resolveProjectFolderFromResource(resource, workspaceSelection) ??
        (await workspaceSelection.resolveWorkspaceFolder({
          requireProject: true,
          prompt: true,
          placeHolder: 'Select the Debug80 project folder',
        }));
      if (!folder) {
        void vscode.window.showInformationMessage('Debug80: No configured Debug80 project found.');
        return undefined;
      }

      const projectConfig = findProjectConfigPath(folder);
      if (projectConfig === undefined) {
        void vscode.window.showErrorMessage(
          `Debug80: Could not find a project config in ${folder.uri.fsPath}.`
        );
        return undefined;
      }

      const target = await targetSelection.resolveTarget(projectConfig, {
        prompt: true,
        placeHolder: 'Select the Debug80 target to update',
      });
      if (target === null) {
        return undefined;
      }
      if (target === undefined) {
        void vscode.window.showInformationMessage(
          'Debug80: This project does not define any named targets.'
        );
        return undefined;
      }

      const config = readProjectConfig(projectConfig);
      const currentSource = config?.targets?.[target]?.sourceFile ?? config?.targets?.[target]?.asm;
      const candidates = listProjectSourceFiles(folder.uri.fsPath);
      if (candidates.length === 0) {
        void vscode.window.showInformationMessage(
          'Debug80: No .asm or .zax source files were found in this project folder.'
        );
        return undefined;
      }

      const resourceRelative =
        resource !== undefined && resource.fsPath.startsWith(folder.uri.fsPath)
          ? path.relative(folder.uri.fsPath, resource.fsPath).split(path.sep).join('/')
          : undefined;
      const initialSelection =
        resourceRelative !== undefined && candidates.includes(resourceRelative)
          ? resourceRelative
          : undefined;

      const picked =
        initialSelection ??
        (
          await vscode.window.showQuickPick(
            candidates.map((candidate) => ({
              label: candidate,
              ...(candidate === currentSource ? { description: 'current entry source' } : {}),
            })),
            {
              placeHolder: 'Select the entry source for the active Debug80 target',
              matchOnDescription: true,
            }
          )
        )?.label;

      if (picked === undefined) {
        return undefined;
      }

      const updated = updateProjectTargetSource(projectConfig, target, picked);
      if (!updated) {
        void vscode.window.showErrorMessage('Debug80: Failed to update the project entry source.');
        return undefined;
      }

      platformViewProvider.refreshIdleView();
      void vscode.window.showInformationMessage(
        `Debug80: Set ${target} entry source to ${picked}.`
      );
      return picked;
    })
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
        terminalPanel.open(undefined, { focus: true });
        return;
      }
      const columns = sourceColumns.getSessionColumns(session);
      terminalPanel.open(session, { focus: true, column: columns.panel });
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
        const columns = sourceColumns.getSessionColumns(session);
        await vscode.window.showTextDocument(doc, { preview: false, viewColumn: columns.source });
      } catch (err) {
        void vscode.window.showErrorMessage(
          `Debug80: Failed to list ROM sources: ${String(err)}`
        );
      }
    })
  );
}
