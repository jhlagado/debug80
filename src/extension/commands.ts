/**
 * @file Command registration for the Debug80 extension.
 */

import * as path from 'path';
import { randomBytes } from 'crypto';
import * as vscode from 'vscode';
import { PlatformViewProvider } from './platform-view-provider';
import {
  DEBUG80_PROJECT_VERSION,
  findProjectConfigPath,
  listProjectSourceFiles,
  readProjectConfig,
  resolveProjectPlatform,
  writeProjectConfig,
  updateProjectTargetSource,
} from './project-config';
import {
  ProjectTargetSelectionController,
  listProjectTargetChoices,
  resolvePreferredTargetName,
} from './project-target-selection';
import { BUNDLED_MON3_V1_REL, materializeBundledRom } from './bundle-materialize';
import { scaffoldProject } from './project-scaffolding';
import { fetchRomSources } from './rom-sources';
import { SourceColumnController } from './source-columns';
import { TerminalPanelController } from './terminal-panel';
import { WorkspaceSelectionController } from './workspace-selection';
import type { ProjectConfig } from '../debug/types';
import { TEC1_APP_START_DEFAULT } from '../platforms/tec1/constants';
import {
  TEC1G_APP_START_DEFAULT,
  TEC1G_RAM_END,
  TEC1G_RAM_START,
  TEC1G_ROM0_END,
  TEC1G_ROM0_START,
  TEC1G_ROM1_END,
  TEC1G_ROM1_START,
} from '../platforms/tec1g/constants';

type CommandDependencies = {
  context: vscode.ExtensionContext;
  platformViewProvider: PlatformViewProvider;
  sourceColumns: SourceColumnController;
  terminalPanel: TerminalPanelController;
  workspaceSelection: WorkspaceSelectionController;
  targetSelection: ProjectTargetSelectionController;
};

type SelectWorkspaceFolderArgs = {
  rootPath?: string;
};

type StartDebugArgs = {
  rootPath?: string;
};

type SelectTargetArgs = {
  rootPath?: string;
  targetName?: string;
};

type ConfigureFieldId =
  | 'targetPlatformOverride'
  | 'program'
  | 'assembler'
  | 'targetName'
  | 'outputDir'
  | 'artifactBase';

function createSimplePlatformDefaults(): Record<string, unknown> {
  return {
    regions: [
      { start: 0, end: 2047, kind: 'rom' },
      { start: 2048, end: 65535, kind: 'ram' },
    ],
    appStart: 0x0900,
    entry: 0,
  };
}

function createTec1PlatformDefaults(): Record<string, unknown> {
  return {
    regions: [
      { start: 0, end: 2047, kind: 'rom' },
      { start: 2048, end: 4095, kind: 'ram' },
    ],
    appStart: TEC1_APP_START_DEFAULT,
    entry: 0,
  };
}

function createTec1gPlatformDefaults(): Record<string, unknown> {
  return {
    regions: [
      { start: TEC1G_ROM0_START, end: TEC1G_ROM0_END, kind: 'rom' },
      { start: TEC1G_RAM_START, end: TEC1G_RAM_END, kind: 'ram' },
      { start: TEC1G_ROM1_START, end: TEC1G_ROM1_END, kind: 'rom' },
    ],
    appStart: TEC1G_APP_START_DEFAULT,
    entry: 0,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createNonce(): string {
  return randomBytes(16).toString('base64');
}

function buildProjectConfigPanelHtml(
  config: ProjectConfig,
  cspSource: string,
  nonce: string
): string {
  const currentPlatform = resolveProjectPlatform(config) ?? 'simple';
  const targetNames = Object.keys(config.targets ?? {});
  const currentDefault = config.defaultTarget ?? config.target ?? targetNames[0] ?? '';
  const platformOptions = ['simple', 'tec1', 'tec1g']
    .map(
      (platform) =>
        `<option value="${platform}"${
          platform === currentPlatform ? ' selected' : ''
        }>${platform}</option>`
    )
    .join('');
  const targetOptions = targetNames
    .map(
      (targetName) =>
        `<option value="${escapeHtml(targetName)}"${
          targetName === currentDefault ? ' selected' : ''
        }>${escapeHtml(targetName)}</option>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <title>Debug80 Project Config</title>
  <style nonce="${nonce}">
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 16px; }
    h2 { margin-top: 0; }
    .row { margin-bottom: 12px; display: flex; flex-direction: column; gap: 6px; max-width: 480px; }
    label { font-size: 12px; opacity: 0.9; }
    select, button { padding: 6px 8px; font: inherit; }
    .hint { font-size: 12px; opacity: 0.8; margin-top: 8px; max-width: 600px; }
  </style>
</head>
<body>
  <h2>Debug80 Project Configuration</h2>
  <div class="row">
    <label for="platform">Project Default Platform</label>
    <select id="platform">${platformOptions}</select>
  </div>
  <div class="row">
    <label for="defaultTarget">Default Target</label>
    <select id="defaultTarget">${targetOptions}</select>
  </div>
  <button id="save">Save Configuration</button>
  <div class="hint">This panel edits project-level settings only. Per-target platform overrides remain available in target configuration flows.</div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    document.getElementById('save')?.addEventListener('click', () => {
      const platform = document.getElementById('platform')?.value ?? '';
      const defaultTarget = document.getElementById('defaultTarget')?.value ?? '';
      vscode.postMessage({ type: 'saveProjectConfig', platform, defaultTarget });
    });
  </script>
</body>
</html>`;
}

function findWorkspaceFolder(rootPath: string | undefined): vscode.WorkspaceFolder | undefined {
  if (rootPath === undefined || rootPath.length === 0) {
    return undefined;
  }
  return vscode.workspace.workspaceFolders?.find((folder) => folder.uri.fsPath === rootPath);
}

async function resolveFolderForProjectCreation(
  workspaceSelection: WorkspaceSelectionController,
  rootPath?: string
): Promise<vscode.WorkspaceFolder | undefined> {
  const directFolder = findWorkspaceFolder(rootPath);
  if (directFolder !== undefined) {
    workspaceSelection.rememberWorkspace(directFolder);
    return directFolder;
  }

  if (rootPath !== undefined && rootPath.length > 0) {
    void vscode.window.showInformationMessage(
      `Debug80: The workspace root ${rootPath} is not open in this window.`
    );
    return undefined;
  }

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
  });
}

async function maybeAutoStartSingleTargetForRootChange(
  folder: vscode.WorkspaceFolder,
  workspaceSelection: WorkspaceSelectionController,
  targetSelection: ProjectTargetSelectionController
): Promise<string | undefined> {
  const projectConfig = findProjectConfigPath(folder);
  if (projectConfig === undefined) {
    return undefined;
  }

  const choices = listProjectTargetChoices(projectConfig);
  if (choices.length !== 1) {
    return undefined;
  }

  const onlyTarget = choices[0]?.name;
  if (onlyTarget === undefined) {
    return undefined;
  }

  targetSelection.rememberTarget(projectConfig, onlyTarget);

  const activeSession = vscode.debug.activeDebugSession;
  if (activeSession?.type === 'z80') {
    await vscode.debug.stopDebugging(activeSession);
  }

  const started = await startCurrentProjectDebugging(folder, workspaceSelection);
  if (!started) {
    return undefined;
  }

  return onlyTarget;
}

function resolveProjectPlatformForFolder(folder: vscode.WorkspaceFolder): string | undefined {
  const projectConfig = findProjectConfigPath(folder);
  if (projectConfig === undefined) {
    return undefined;
  }
  return resolveProjectPlatform(readProjectConfig(projectConfig));
}

function projectConfigFromSession(session: vscode.DebugSession): string | undefined {
  const configuration = session.configuration as { projectConfig?: unknown } | undefined;
  const projectConfigRaw = configuration?.projectConfig;
  if (typeof projectConfigRaw !== 'string' || projectConfigRaw.trim() === '') {
    return undefined;
  }
  return projectConfigRaw;
}

function resolveSessionProjectPlatform(session: vscode.DebugSession): string | undefined {
  const projectConfigRaw = projectConfigFromSession(session);
  if (projectConfigRaw === undefined) {
    return undefined;
  }
  const projectConfigPath = path.isAbsolute(projectConfigRaw)
    ? projectConfigRaw
    : session.workspaceFolder !== undefined
      ? path.join(session.workspaceFolder.uri.fsPath, projectConfigRaw)
      : projectConfigRaw;
  return resolveProjectPlatform(readProjectConfig(projectConfigPath));
}

function resolveSessionProjectConfigPath(session: vscode.DebugSession): string | undefined {
  const projectConfigRaw = projectConfigFromSession(session);
  if (projectConfigRaw === undefined) {
    return undefined;
  }
  if (path.isAbsolute(projectConfigRaw)) {
    return path.normalize(projectConfigRaw);
  }
  if (session.workspaceFolder !== undefined) {
    return path.normalize(path.join(session.workspaceFolder.uri.fsPath, projectConfigRaw));
  }
  return path.normalize(projectConfigRaw);
}

export function registerExtensionCommands({
  context,
  platformViewProvider,
  sourceColumns,
  terminalPanel,
  workspaceSelection,
  targetSelection,
}: CommandDependencies): void {
  let creatingProject = false;
  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.createProject', async (args?: { rootPath?: string; platform?: string }) => {
      if (creatingProject) {
        return false;
      }
      creatingProject = true;
      try {
        // Defer one event-loop tick so that the trailing mouseup from a welcome-view
        // link click settles before any quick-pick or open-dialog is shown.
        // Without this the picker opens and is immediately dismissed.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        const folder = await resolveFolderForProjectCreation(workspaceSelection, args?.rootPath);
        if (!folder) {
          void vscode.window.showErrorMessage(
            'Debug80: No workspace folder available for project creation.'
          );
          return false;
        }
        const created = await scaffoldProject(folder, false, context.extensionUri, args?.platform);
        if (created) {
          workspaceSelection.rememberWorkspace(folder);
          platformViewProvider.refreshIdleView();
        }
        return created;
      } finally {
        creatingProject = false;
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.materializeBundledRom', async () => {
      const folder = await workspaceSelection.resolveWorkspaceFolder({
        prompt: true,
        requireProject: false,
        placeHolder: 'Select the workspace folder to install bundled MON3 ROM and listing',
      });
      if (folder === undefined) {
        return false;
      }
      const pick = await vscode.window.showQuickPick(
        [
          { label: 'Skip existing files', value: false as const },
          { label: 'Overwrite existing files', value: true as const },
        ],
        { placeHolder: 'If bundled files already exist, should they be overwritten?' }
      );
      if (pick === undefined) {
        return undefined;
      }
      const result = materializeBundledRom(
        context.extensionUri,
        folder.uri.fsPath,
        BUNDLED_MON3_V1_REL,
        { overwrite: pick.value }
      );
      if (result.ok) {
        const listingNote =
          result.listingRelativePath !== undefined
            ? ` Listing: ${result.listingRelativePath}.`
            : '';
        void vscode.window.showInformationMessage(
          `Debug80: Installed bundled MON3 ROM at ${result.romRelativePath}.${listingNote}`
        );
        return true;
      }
      void vscode.window.showErrorMessage(`Debug80: ${result.reason}`);
      return false;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.startDebug', async (args?: StartDebugArgs) => {
      const directFolder = findWorkspaceFolder(args?.rootPath);
      const folder =
        directFolder &&
        findProjectConfigPath(directFolder) !== undefined
          ? directFolder
          : await workspaceSelection.resolveWorkspaceFolder({
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
    vscode.commands.registerCommand(
      'debug80.selectWorkspaceFolder',
      async (args?: SelectWorkspaceFolderArgs | string) => {
        const rootPath = typeof args === 'string' ? args : args?.rootPath;
        const folder =
          findWorkspaceFolder(rootPath) ??
          (rootPath === undefined ? await workspaceSelection.selectWorkspaceFolder() : undefined);
        if (!folder) {
          if (rootPath !== undefined) {
            void vscode.window.showInformationMessage(
              `Debug80: The workspace root ${rootPath} is not open in this window.`
            );
            return undefined;
          }
          return undefined;
        }

        workspaceSelection.rememberWorkspace(folder);
        platformViewProvider.refreshIdleView();

        let restartedForRootChange = false;
        const activeSession = vscode.debug.activeDebugSession;
        if (activeSession?.type === 'z80') {
          const nextProjectConfigPath = findProjectConfigPath(folder);
          const previousProjectConfigPath = resolveSessionProjectConfigPath(activeSession);
          const previousPlatform = resolveSessionProjectPlatform(activeSession);
          const nextPlatform = resolveProjectPlatformForFolder(folder);
          const projectChanged =
            previousProjectConfigPath !== undefined &&
            nextProjectConfigPath !== undefined &&
            previousProjectConfigPath !== path.normalize(nextProjectConfigPath);
          if (
            projectChanged ||
            (previousPlatform !== undefined &&
              nextPlatform !== undefined &&
              previousPlatform !== nextPlatform)
          ) {
            await vscode.debug.stopDebugging(activeSession);
            const restarted = await startCurrentProjectDebugging(folder, workspaceSelection);
            restartedForRootChange = restarted;
            if (restarted) {
              const reason =
                previousPlatform !== undefined &&
                nextPlatform !== undefined &&
                previousPlatform !== nextPlatform
                  ? nextPlatform
                  : 'selected project';
              void vscode.window.showInformationMessage(
                `Debug80: Selected root ${folder.name}; restarted debugging for ${reason}.`
              );
            }
          }
        }

        const singleTarget = restartedForRootChange
          ? undefined
          : await maybeAutoStartSingleTargetForRootChange(
              folder,
              workspaceSelection,
              targetSelection
            );
        if (singleTarget !== undefined) {
          void vscode.window.showInformationMessage(
            `Debug80: Selected root ${folder.name} and started target ${singleTarget}.`
          );
        }
        return folder;
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'debug80.selectTarget',
      async (args?: SelectTargetArgs) => {
        const folder =
          findWorkspaceFolder(args?.rootPath) ??
          (args?.rootPath === undefined
            ? await workspaceSelection.resolveWorkspaceFolder({
                requireProject: true,
                prompt: true,
                placeHolder: 'Select the Debug80 project folder',
              })
            : undefined);
        if (!folder) {
          if (args?.rootPath !== undefined) {
            void vscode.window.showInformationMessage(
              `Debug80: The workspace root ${args.rootPath} is not open in this window.`
            );
            return undefined;
          }
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

        const directTarget =
          args?.targetName !== undefined
            ? listProjectTargetChoices(projectConfig).find((choice) => choice.name === args.targetName)
                ?.name
            : undefined;
        const target =
          directTarget ??
          (await targetSelection.resolveTarget(projectConfig, {
            prompt: true,
            forcePrompt: true,
            placeHolder: 'Select the active Debug80 target',
          }));
        if (target === null) {
          return undefined;
        }
        if (target === undefined) {
          if (args?.targetName !== undefined) {
            void vscode.window.showInformationMessage(
              `Debug80: Target ${args.targetName} is not defined in this project.`
            );
            return undefined;
          }
          void vscode.window.showInformationMessage(
            'Debug80: This project does not define any named targets.'
          );
          return undefined;
        }

        targetSelection.rememberTarget(projectConfig, target);
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
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.configureProject', async () => {
      const folder = await workspaceSelection.resolveWorkspaceFolder({
        requireProject: true,
        prompt: true,
        placeHolder: 'Select the Debug80 project folder to configure',
      });
      if (!folder) {
        void vscode.window.showInformationMessage('Debug80: No configured Debug80 project found.');
        return undefined;
      }

      const projectConfigPath = findProjectConfigPath(folder);
      if (projectConfigPath === undefined) {
        void vscode.window.showErrorMessage(
          `Debug80: Could not find a project config in ${folder.uri.fsPath}.`
        );
        return undefined;
      }

      const config = readProjectConfig(projectConfigPath);
      if (config === undefined) {
        void vscode.window.showErrorMessage('Debug80: Failed to read project config.');
        return undefined;
      }

      const target = await targetSelection.resolveTarget(projectConfigPath, {
        prompt: true,
        forcePrompt: true,
        placeHolder: 'Select the Debug80 target to configure',
      });
      if (target === undefined || target === null) {
        return undefined;
      }

      const pick = await vscode.window.showQuickPick(
        [
          { label: 'Target Platform Override', value: 'targetPlatformOverride' as ConfigureFieldId },
          { label: 'Program File', value: 'program' as ConfigureFieldId },
          { label: 'Assembler', value: 'assembler' as ConfigureFieldId },
          { label: 'Target Name', value: 'targetName' as ConfigureFieldId },
          { label: 'Output Directory', value: 'outputDir' as ConfigureFieldId },
          { label: 'Artifact Base', value: 'artifactBase' as ConfigureFieldId },
        ],
        {
          placeHolder: 'Select what to configure for this target',
        }
      );
      if (!pick) {
        return undefined;
      }

      const targets = (config.targets ?? {}) as Record<string, Record<string, unknown>>;
      const currentTarget = targets[target];
      if (currentTarget === undefined) {
        void vscode.window.showErrorMessage(`Debug80: Target ${target} no longer exists.`);
        return undefined;
      }

      const updatedTarget: Record<string, unknown> = { ...currentTarget };
      let nextTargetName = target;

      if (pick.value === 'targetPlatformOverride') {
        const platformPick = await vscode.window.showQuickPick(
          [
            { label: 'simple', detail: 'Generic Debug80 memory-map platform' },
            { label: 'tec1', detail: 'Classic TEC-1 keypad/LCD platform' },
            { label: 'tec1g', detail: 'TEC-1G LCD/GLCD/matrix platform' },
          ],
          { placeHolder: 'Select a platform override for this target' }
        );
        if (!platformPick) {
          return undefined;
        }
        const platform = platformPick.label as 'simple' | 'tec1' | 'tec1g';
        updatedTarget.platform = platform;
        delete updatedTarget.simple;
        delete updatedTarget.tec1;
        delete updatedTarget.tec1g;
        if (platform === 'tec1') {
          updatedTarget.tec1 = createTec1PlatformDefaults();
        } else if (platform === 'tec1g') {
          updatedTarget.tec1g = createTec1gPlatformDefaults();
        } else {
          updatedTarget.simple = createSimplePlatformDefaults();
        }
        config.projectVersion = DEBUG80_PROJECT_VERSION;
        // Keep project-level platform stable for mixed-target projects.
        if (Object.keys(targets).length <= 1) {
          config.projectPlatform = platform;
        }
      } else if (pick.value === 'program') {
        const sources = listProjectSourceFiles(folder.uri.fsPath);
        if (sources.length === 0) {
          void vscode.window.showInformationMessage(
            'Debug80: No .asm or .zax source files were found in this project folder.'
          );
          return undefined;
        }
        const sourcePick = await vscode.window.showQuickPick(
          sources.map((src) => ({ label: src })),
          { placeHolder: 'Select the program file for this target' }
        );
        if (!sourcePick) {
          return undefined;
        }
        updatedTarget.sourceFile = sourcePick.label;
        updatedTarget.asm = sourcePick.label;
        if (sourcePick.label.toLowerCase().endsWith('.zax')) {
          updatedTarget.assembler = 'zax';
        } else if (updatedTarget.assembler === 'zax') {
          delete updatedTarget.assembler;
        }
      } else if (pick.value === 'assembler') {
        const assemblerPick = await vscode.window.showQuickPick(
          [
            { label: 'default', detail: 'Use extension default by source file extension' },
            { label: 'asm80', detail: 'Force asm80 backend' },
            { label: 'zax', detail: 'Force zax backend' },
          ],
          { placeHolder: 'Select assembler for this target' }
        );
        if (!assemblerPick) {
          return undefined;
        }
        if (assemblerPick.label === 'default') {
          delete updatedTarget.assembler;
        } else {
          updatedTarget.assembler = assemblerPick.label;
        }
      } else if (pick.value === 'targetName') {
        const targetName = (await vscode.window.showInputBox({
          prompt: 'Debug80 target name',
          value: target,
          validateInput: (value) => {
            const trimmed = value.trim();
            if (trimmed.length === 0) {
              return 'Target name cannot be empty.';
            }
            if (trimmed !== target && targets[trimmed] !== undefined) {
              return 'A target with this name already exists.';
            }
            return undefined;
          },
        }))?.trim();
        if (targetName === undefined || targetName.length === 0 || targetName === target) {
          return undefined;
        }
        delete targets[target];
        targets[targetName] = updatedTarget;
        nextTargetName = targetName;
        if (config.defaultTarget === target) {
          config.defaultTarget = targetName;
        }
        if (config.target === target) {
          config.target = targetName;
        }
      } else if (pick.value === 'outputDir') {
        const outputDir = (await vscode.window.showInputBox({
          prompt: 'Output directory',
          value: String(updatedTarget.outputDir ?? ''),
          placeHolder: 'build',
        }))?.trim();
        if (outputDir === undefined || outputDir.length === 0) {
          return undefined;
        }
        updatedTarget.outputDir = outputDir;
      } else if (pick.value === 'artifactBase') {
        const artifactBase = (await vscode.window.showInputBox({
          prompt: 'Artifact base',
          value: String(updatedTarget.artifactBase ?? ''),
          placeHolder: 'main',
        }))?.trim();
        if (artifactBase === undefined || artifactBase.length === 0) {
          return undefined;
        }
        updatedTarget.artifactBase = artifactBase;
      }

      targets[nextTargetName] = updatedTarget;
      config.targets = targets as NonNullable<ProjectConfig['targets']>;
      const written = writeProjectConfig(projectConfigPath, config);
      if (!written) {
        void vscode.window.showErrorMessage('Debug80: Failed to update project config.');
        return undefined;
      }

      targetSelection.rememberTarget(projectConfigPath, nextTargetName);
      platformViewProvider.refreshIdleView();
      void vscode.window.showInformationMessage(
        `Debug80: Updated ${nextTargetName} (${pick.label}).`
      );
      return nextTargetName;
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
              ...(candidate === currentSource ? { description: 'current program file' } : {}),
            })),
            {
              placeHolder: 'Select the program file for the active Debug80 target',
              matchOnDescription: true,
            }
          )
        )?.label;

      if (picked === undefined) {
        return undefined;
      }

      const updated = updateProjectTargetSource(projectConfig, target, picked);
      if (!updated) {
        void vscode.window.showErrorMessage('Debug80: Failed to update the project program file.');
        return undefined;
      }

      platformViewProvider.refreshIdleView();
      void vscode.window.showInformationMessage(
        `Debug80: Set ${target} program file to ${picked}.`
      );
      return picked;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.openProjectConfigPanel', async () => {
      const folder = await workspaceSelection.resolveWorkspaceFolder({
        requireProject: true,
        prompt: true,
        placeHolder: 'Select the Debug80 project folder to configure',
      });
      if (!folder) {
        void vscode.window.showInformationMessage('Debug80: No configured Debug80 project found.');
        return undefined;
      }

      const projectConfigPath = findProjectConfigPath(folder);
      if (projectConfigPath === undefined) {
        void vscode.window.showErrorMessage(
          `Debug80: Could not find a project config in ${folder.uri.fsPath}.`
        );
        return undefined;
      }

      const initialConfig = readProjectConfig(projectConfigPath);
      if (initialConfig === undefined) {
        void vscode.window.showErrorMessage('Debug80: Failed to read project config.');
        return undefined;
      }
      let config: ProjectConfig = initialConfig;

      const panel = vscode.window.createWebviewPanel(
        'debug80ProjectConfig',
        `Debug80 Project Settings: ${folder.name}`,
        vscode.ViewColumn.Active,
        { enableScripts: true, retainContextWhenHidden: true }
      );
      panel.webview.html = buildProjectConfigPanelHtml(config, panel.webview.cspSource, createNonce());

      const messageDisposable = panel.webview.onDidReceiveMessage((msg: unknown) => {
        const payload = msg as { type?: string; platform?: string; defaultTarget?: string };
        if (payload.type !== 'saveProjectConfig') {
          return;
        }

        const platform = payload.platform;
        const defaultTarget = payload.defaultTarget;
        if (
          (platform !== 'simple' && platform !== 'tec1' && platform !== 'tec1g') ||
          typeof defaultTarget !== 'string'
        ) {
          void vscode.window.showErrorMessage('Debug80: Invalid project configuration values.');
          return;
        }

        const targets = config.targets ?? {};
        if (targets[defaultTarget] === undefined) {
          void vscode.window.showErrorMessage('Debug80: Selected default target no longer exists.');
          return;
        }

        const next: ProjectConfig = {
          ...config,
          projectVersion: DEBUG80_PROJECT_VERSION,
          projectPlatform: platform,
          defaultTarget,
          target: defaultTarget,
        };
        const written = writeProjectConfig(projectConfigPath, next);
        if (!written) {
          void vscode.window.showErrorMessage('Debug80: Failed to update project config.');
          return;
        }

        config = next;
        panel.webview.html = buildProjectConfigPanelHtml(
          config,
          panel.webview.cspSource,
          createNonce()
        );
        platformViewProvider.refreshIdleView();
        void vscode.window.showInformationMessage('Debug80: Project configuration updated.');
      });
      panel.onDidDispose(() => {
        messageDisposable.dispose();
      });

      return true;
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
