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
  writeProjectConfig,
  updateProjectTargetSource,
  addProjectTarget,
} from './project-config';
import {
  ProjectTargetSelectionController,
  listProjectTargetChoices,
  resolvePreferredTargetName,
} from './project-target-selection';
import { materializeBundledAsset } from './bundle-materialize';
import { scaffoldProject } from './project-scaffolding';
import { fetchRomSources } from './rom-sources';
import { SourceColumnController } from './source-columns';
import { TerminalPanelController } from './terminal-panel';
import { WorkspaceSelectionController } from './workspace-selection';
import type { Debug80PlatformId } from '../debug/session/types';
import {
  buildBundledAssetFallbackPlans,
  resolveProjectBundledAssetInstallPlan,
} from './bundle-asset-installer';
import {
  findWorkspaceFolder,
  resolveFolderForProjectCreation,
  resolveProjectFolderFromResource,
} from './workspace-folder-resolver';
import { buildSourcePickItems, resolveResourceSourceSelection } from './source-selection';
import {
  startCurrentProjectDebugging,
  maybeAutoStartSingleTargetForRootChange,
  resolveProjectPlatformForFolder,
  resolveSessionProjectConfigPath,
  resolveSessionWorkspaceFolder,
} from './debug-session-actions';
import { openProjectConfigPanel } from './project-config-panel';
import {
  applyConfigureProjectTargetEdit,
  type ConfigureProjectTargetEdit,
} from './configure-project-edit';

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
    vscode.commands.registerCommand(
      'debug80.createProject',
      async (args?: { rootPath?: string; platform?: string }) => {
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
          const created = await scaffoldProject(
            folder,
            false,
            context.extensionUri,
            args?.platform
          );
          if (created) {
            workspaceSelection.rememberWorkspace(folder);
            platformViewProvider.refreshIdleView();
            platformViewProvider.reveal?.(false);
          }
          return created;
        } finally {
          creatingProject = false;
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.openDebug80View', () => {
      platformViewProvider.reveal(true);
      return true;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.addWorkspaceFolder', async () => {
      const picked = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: 'Add Folder to Workspace',
        title: 'Add a folder to the Debug80 workspace',
      });
      const folderUri = picked?.[0];
      if (folderUri === undefined) {
        return;
      }
      const existing = vscode.workspace.getWorkspaceFolder(folderUri);
      if (existing !== undefined) {
        workspaceSelection.rememberWorkspace(existing);
        return;
      }
      const insertAt = vscode.workspace.workspaceFolders?.length ?? 0;
      const added = vscode.workspace.updateWorkspaceFolders(insertAt, 0, {
        uri: folderUri,
        name: path.basename(folderUri.fsPath),
      });
      if (!added) {
        void vscode.window.showErrorMessage(
          'Debug80: Failed to add the selected folder to the workspace.'
        );
        return;
      }
      const addedFolder =
        vscode.workspace.getWorkspaceFolder(folderUri) ??
        ({
          uri: folderUri,
          name: path.basename(folderUri.fsPath),
          index: insertAt,
        } as vscode.WorkspaceFolder);
      workspaceSelection.rememberWorkspace(addedFolder);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.materializeBundledRom', async () => {
      const folder = await workspaceSelection.resolveWorkspaceFolder({
        prompt: true,
        requireProject: false,
        placeHolder: 'Select the workspace folder to install bundled assets',
      });
      if (folder === undefined) {
        return false;
      }
      const projectConfigPath = findProjectConfigPath(folder);
      const projectConfig =
        projectConfigPath !== undefined ? readProjectConfig(projectConfigPath) : undefined;
      const projectPlan =
        projectConfig !== undefined
          ? resolveProjectBundledAssetInstallPlan(projectConfig)
          : undefined;
      let installPlan = projectPlan;
      if (installPlan === undefined) {
        const pick = await vscode.window.showQuickPick(
          buildBundledAssetFallbackPlans().map((plan) => ({
            label: plan.label,
            plan,
          })),
          {
            placeHolder: 'Select the bundled asset set to install',
          }
        );
        installPlan = pick?.plan;
      }
      if (installPlan === undefined) {
        void vscode.window.showErrorMessage(
          'Debug80: No bundled asset references were available to install.'
        );
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
      const installed: string[] = [];
      for (const reference of installPlan.references) {
        const result = materializeBundledAsset(context.extensionUri, folder.uri.fsPath, reference, {
          overwrite: pick.value,
        });
        if (!result.ok) {
          void vscode.window.showErrorMessage(`Debug80: ${result.reason}`);
          return false;
        }
        installed.push(result.materializedRelativePath);
      }
      void vscode.window.showInformationMessage(
        `Debug80: Installed bundled assets for ${installPlan.label}: ${installed.join(', ')}`
      );
      return true;
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.startDebug', async (args?: StartDebugArgs) => {
      const directFolder = findWorkspaceFolder(args?.rootPath);
      const folder =
        directFolder && findProjectConfigPath(directFolder) !== undefined
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
      return startCurrentProjectDebugging(
        folder,
        workspaceSelection,
        platformViewProvider.stopOnEntry
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.restartDebug', async () => {
      const activeSession = vscode.debug.activeDebugSession;
      const folder =
        activeSession?.type === 'z80'
          ? (resolveSessionWorkspaceFolder(activeSession) ??
            (await workspaceSelection.resolveWorkspaceFolder({
              prompt: true,
              requireProject: true,
              placeHolder: 'Select the Debug80 project folder to debug',
            })))
          : await workspaceSelection.resolveWorkspaceFolder({
              prompt: true,
              requireProject: true,
              placeHolder: 'Select the Debug80 project folder to debug',
            });
      if (!folder) {
        void vscode.window.showInformationMessage('Debug80: No configured Debug80 project found.');
        return false;
      }

      if (activeSession?.type === 'z80') {
        await vscode.debug.stopDebugging(activeSession);
      }

      return startCurrentProjectDebugging(
        folder,
        workspaceSelection,
        platformViewProvider.stopOnEntry
      );
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
        platformViewProvider.reveal?.(false);

        let restartedForRootChange = false;
        const activeSession = vscode.debug.activeDebugSession;
        if (activeSession?.type === 'z80') {
          const previousProjectConfig = resolveSessionProjectConfigPath(activeSession);
          const nextProjectConfig = findProjectConfigPath(folder);
          if (
            previousProjectConfig !== undefined &&
            nextProjectConfig !== undefined &&
            path.normalize(nextProjectConfig) !== previousProjectConfig
          ) {
            await vscode.debug.stopDebugging(activeSession);
            const restarted = await startCurrentProjectDebugging(
              folder,
              workspaceSelection,
              platformViewProvider.stopOnEntry
            );
            restartedForRootChange = restarted;
            if (restarted) {
              const nextPlatform = resolveProjectPlatformForFolder(folder);
              void vscode.window.showInformationMessage(
                nextPlatform !== undefined
                  ? `Debug80: Selected root ${folder.name}; restarted debugging for ${nextPlatform}.`
                  : `Debug80: Selected root ${folder.name}; restarted debugging.`
              );
            }
          }
        }

        const singleTarget = restartedForRootChange
          ? undefined
          : await maybeAutoStartSingleTargetForRootChange(
              folder,
              workspaceSelection,
              targetSelection,
              platformViewProvider.stopOnEntry
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
    vscode.commands.registerCommand('debug80.selectTarget', async (args?: SelectTargetArgs) => {
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

      const directTargetChoice =
        args?.targetName !== undefined
          ? listProjectTargetChoices(projectConfig).find(
              (choice) => choice.name === args.targetName
            )
          : undefined;

      // If this is a discovered (unconfigured) source file, add it as a real target first
      if (directTargetChoice?.discovered === true && directTargetChoice.sourceFile !== undefined) {
        const ok = addProjectTarget(
          projectConfig,
          directTargetChoice.name,
          directTargetChoice.sourceFile
        );
        if (!ok) {
          void vscode.window.showErrorMessage(
            `Debug80: Failed to add target "${directTargetChoice.name}" to debug80.json.`
          );
          return undefined;
        }
      }

      const directTarget = directTargetChoice?.name;
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
        void vscode.window.showInformationMessage(
          `Debug80: Selected target ${target}. Press Restart to apply it to the current session.`
        );
        return target;
      }

      void vscode.window.showInformationMessage(`Debug80: Selected target ${target}.`);
      return target;
    })
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
          {
            label: 'Target Platform Override',
            value: 'targetPlatformOverride' as ConfigureFieldId,
          },
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

      const currentTarget = config.targets?.[target];
      if (currentTarget === undefined) {
        void vscode.window.showErrorMessage(`Debug80: Target ${target} no longer exists.`);
        return undefined;
      }

      let edit: ConfigureProjectTargetEdit | undefined;

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
        edit = {
          kind: 'targetPlatformOverride',
          platform: platformPick.label as Debug80PlatformId,
        };
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
        edit = { kind: 'program', sourceFile: sourcePick.label };
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
        edit = {
          kind: 'assembler',
          assembler: assemblerPick.label === 'default' ? undefined : assemblerPick.label,
        };
      } else if (pick.value === 'targetName') {
        const targets = config.targets ?? {};
        const targetName = (
          await vscode.window.showInputBox({
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
          })
        )?.trim();
        if (targetName === undefined || targetName.length === 0 || targetName === target) {
          return undefined;
        }
        edit = { kind: 'targetName', targetName };
      } else if (pick.value === 'outputDir') {
        const outputDir = (
          await vscode.window.showInputBox({
            prompt: 'Output directory',
            value: String(config.targets?.[target]?.outputDir ?? ''),
            placeHolder: 'build',
          })
        )?.trim();
        if (outputDir === undefined || outputDir.length === 0) {
          return undefined;
        }
        edit = { kind: 'outputDir', outputDir };
      } else if (pick.value === 'artifactBase') {
        const artifactBase = (
          await vscode.window.showInputBox({
            prompt: 'Artifact base',
            value: String(config.targets?.[target]?.artifactBase ?? ''),
            placeHolder: 'main',
          })
        )?.trim();
        if (artifactBase === undefined || artifactBase.length === 0) {
          return undefined;
        }
        edit = { kind: 'artifactBase', artifactBase };
      }

      if (edit === undefined) {
        return undefined;
      }
      const editResult = applyConfigureProjectTargetEdit(config, target, edit);
      if (editResult.kind === 'missingTarget') {
        void vscode.window.showErrorMessage(`Debug80: Target ${target} no longer exists.`);
        return undefined;
      }
      if (editResult.kind === 'noChange') {
        return undefined;
      }
      const written = writeProjectConfig(projectConfigPath, config);
      if (!written) {
        void vscode.window.showErrorMessage('Debug80: Failed to update project config.');
        return undefined;
      }

      targetSelection.rememberTarget(projectConfigPath, editResult.targetName);
      platformViewProvider.refreshIdleView();
      void vscode.window.showInformationMessage(
        `Debug80: Updated ${editResult.targetName} (${pick.label}).`
      );
      return editResult.targetName;
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

      const initialSelection = resolveResourceSourceSelection(
        resource?.fsPath,
        folder.uri.fsPath,
        candidates
      );

      const picked =
        initialSelection ??
        (
          await vscode.window.showQuickPick(buildSourcePickItems(candidates, currentSource), {
            placeHolder: 'Select the program file for the active Debug80 target',
            matchOnDescription: true,
          })
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
    vscode.commands.registerCommand('debug80.openProjectConfigPanel', () =>
      openProjectConfigPanel(workspaceSelection, platformViewProvider)
    )
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
        void vscode.window.showErrorMessage(`Debug80: Failed to list ROM sources: ${String(err)}`);
      }
    })
  );
}
