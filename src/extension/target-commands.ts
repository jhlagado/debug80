/**
 * @fileoverview Target selection and project target configuration commands.
 */

import * as vscode from 'vscode';
import type { Debug80PlatformId } from '../debug/session/types';
import { PlatformViewProvider } from './platform-view-provider';
import {
  addProjectTarget,
  findProjectConfigPath,
  readProjectConfig,
  updateProjectTargetSource,
  writeProjectConfig,
} from './project-config';
import { listTargetEntrySourceFiles } from './target-discovery';
import { openProjectConfigPanel } from './project-config-panel';
import {
  ProjectTargetSelectionController,
  listProjectTargetChoices,
  resolvePreferredTargetName,
} from './project-target-selection';
import { buildSourcePickItems, resolveResourceSourceSelection } from './source-selection';
import { WorkspaceSelectionController } from './workspace-selection';
import { findWorkspaceFolder, resolveProjectFolderFromResource } from './workspace-folder-resolver';
import {
  applyConfigureProjectTargetEdit,
  type ConfigureProjectTargetEdit,
} from './configure-project-edit';

export type SelectTargetArgs = {
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

type TargetProjectFolderResolution =
  | { kind: 'found'; folder: vscode.WorkspaceFolder }
  | { kind: 'missing-explicit-root'; rootPath: string }
  | { kind: 'none' };

export function registerTargetCommands(options: {
  context: vscode.ExtensionContext;
  platformViewProvider: PlatformViewProvider;
  workspaceSelection: WorkspaceSelectionController;
  targetSelection: ProjectTargetSelectionController;
}): void {
  const { context, platformViewProvider, workspaceSelection, targetSelection } = options;

  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.selectTarget', async (args?: SelectTargetArgs) => {
      const folderResolution = await resolveTargetProjectFolder(args, workspaceSelection);
      if (folderResolution.kind === 'missing-explicit-root') {
        void vscode.window.showInformationMessage(
          `Debug80: The workspace root ${folderResolution.rootPath} is not open in this window.`
        );
        return undefined;
      }
      if (folderResolution.kind === 'none') {
        void vscode.window.showInformationMessage('Debug80: No configured Debug80 project found.');
        return undefined;
      }
      const { folder } = folderResolution;

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
          `Debug80: Selected target ${target}. Press Build to apply it to the current session.`
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

      const edit = await resolveTargetEdit(pick.value, target, config, folder);
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
      const candidates = listTargetEntrySourceFiles(folder.uri.fsPath);
      if (candidates.length === 0) {
        void vscode.window.showInformationMessage(
          'Debug80: No target entry files were found in this project folder (.main.asm or main.asm).'
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
}

export async function resolveTargetProjectFolder(
  args: SelectTargetArgs | undefined,
  workspaceSelection: WorkspaceSelectionController
): Promise<TargetProjectFolderResolution> {
  const folder = findWorkspaceFolder(args?.rootPath);
  if (folder !== undefined) {
    return { kind: 'found', folder };
  }
  if (args?.rootPath !== undefined) {
    return { kind: 'missing-explicit-root', rootPath: args.rootPath };
  }
  const promptedFolder = await workspaceSelection.resolveWorkspaceFolder({
    prompt: true,
    requireProject: true,
    placeHolder: 'Select the Debug80 project folder',
  });
  return promptedFolder !== undefined
    ? { kind: 'found', folder: promptedFolder }
    : { kind: 'none' };
}

async function resolveTargetEdit(
  field: ConfigureFieldId,
  target: string,
  config: NonNullable<ReturnType<typeof readProjectConfig>>,
  folder: vscode.WorkspaceFolder
): Promise<ConfigureProjectTargetEdit | undefined> {
  if (field === 'targetPlatformOverride') {
    const platformPick = await vscode.window.showQuickPick(
      [
        { label: 'simple', detail: 'Generic Debug80 memory-map platform' },
        { label: 'tec1', detail: 'Classic TEC-1 keypad/LCD platform' },
        { label: 'tec1g', detail: 'TEC-1G LCD/GLCD/matrix platform' },
      ],
      { placeHolder: 'Select a platform override for this target' }
    );
    return platformPick
      ? { kind: 'targetPlatformOverride', platform: platformPick.label as Debug80PlatformId }
      : undefined;
  }
  if (field === 'program') {
    const sources = listTargetEntrySourceFiles(folder.uri.fsPath);
    if (sources.length === 0) {
      void vscode.window.showInformationMessage(
        'Debug80: No target entry files were found in this project folder (.main.asm or main.asm).'
      );
      return undefined;
    }
    const sourcePick = await vscode.window.showQuickPick(
      sources.map((src) => ({ label: src })),
      { placeHolder: 'Select the program file for this target' }
    );
    return sourcePick ? { kind: 'program', sourceFile: sourcePick.label } : undefined;
  }
  if (field === 'assembler') {
    const assemblerPick = await vscode.window.showQuickPick(
      [
        { label: 'default', detail: 'Use extension default by source file extension' },
        { label: 'azm', detail: 'Force AZM backend' },
      ],
      { placeHolder: 'Select assembler for this target' }
    );
    return assemblerPick
      ? {
          kind: 'assembler',
          assembler: assemblerPick.label === 'default' ? undefined : assemblerPick.label,
        }
      : undefined;
  }
  if (field === 'targetName') {
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
    return targetName === undefined || targetName.length === 0 || targetName === target
      ? undefined
      : { kind: 'targetName', targetName };
  }
  if (field === 'outputDir') {
    const outputDir = (
      await vscode.window.showInputBox({
        prompt: 'Output directory',
        value: String(config.targets?.[target]?.outputDir ?? ''),
        placeHolder: 'build',
      })
    )?.trim();
    return outputDir === undefined || outputDir.length === 0
      ? undefined
      : { kind: 'outputDir', outputDir };
  }
  const artifactBase = (
    await vscode.window.showInputBox({
      prompt: 'Artifact base',
      value: String(config.targets?.[target]?.artifactBase ?? ''),
      placeHolder: 'main',
    })
  )?.trim();
  return artifactBase === undefined || artifactBase.length === 0
    ? undefined
    : { kind: 'artifactBase', artifactBase };
}
