import * as vscode from 'vscode';
import type { Debug80PlatformId, ProjectConfig } from '../debug/session/types';
import {
  findProjectConfigPath,
  readProjectConfig,
  updateProjectTargetSource,
  writeProjectConfig,
} from './project-config';
import { buildSourcePickItems, resolveResourceSourceSelection } from './source-selection';
import { listTargetSourceFiles } from './target-discovery';
import type { TargetCommandContext } from './target-command-context';
import { resolveProjectFolderFromResource } from './workspace-folder-resolver';
import {
  applyConfigureProjectTargetEdit,
  type ConfigureProjectTargetEdit,
} from './configure-project-edit';

type ConfigureFieldId =
  'targetPlatformOverride' | 'program' | 'assembler' | 'targetName' | 'outputDir' | 'artifactBase';

export async function configureProjectCommand(
  options: TargetCommandContext
): Promise<string | undefined> {
  const { platformViewProvider, workspaceSelection, targetSelection } = options;
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
  const pick = await selectConfigureField();
  if (!pick) {
    return undefined;
  }
  if (config.targets?.[target] === undefined) {
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
  if (!writeProjectConfig(projectConfigPath, config)) {
    void vscode.window.showErrorMessage('Debug80: Failed to update project config.');
    return undefined;
  }

  targetSelection.rememberTarget(projectConfigPath, editResult.targetName);
  platformViewProvider.refreshIdleView();
  void vscode.window.showInformationMessage(
    `Debug80: Updated ${editResult.targetName} (${pick.label}).`
  );
  return editResult.targetName;
}

export async function setEntrySourceCommand(
  options: TargetCommandContext,
  resource?: vscode.Uri
): Promise<string | undefined> {
  const { platformViewProvider, workspaceSelection, targetSelection } = options;
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
  const candidates = listTargetSourceFiles(folder.uri.fsPath);
  if (candidates.length === 0) {
    void vscode.window.showInformationMessage(
      'Debug80: No runnable AZM or Glimmer entry files were found in this project folder.'
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
  if (!updateProjectTargetSource(projectConfig, target, picked)) {
    void vscode.window.showErrorMessage('Debug80: Failed to update the project program file.');
    return undefined;
  }
  platformViewProvider.refreshIdleView();
  void vscode.window.showInformationMessage(`Debug80: Set ${target} program file to ${picked}.`);
  return picked;
}

async function selectConfigureField(): Promise<
  { label: string; value: ConfigureFieldId } | undefined
> {
  return vscode.window.showQuickPick(
    [
      { label: 'Target Platform Override', value: 'targetPlatformOverride' },
      { label: 'Program File', value: 'program' },
      { label: 'Assembler', value: 'assembler' },
      { label: 'Target Name', value: 'targetName' },
      { label: 'Output Directory', value: 'outputDir' },
      { label: 'Artifact Base', value: 'artifactBase' },
    ] satisfies Array<{ label: string; value: ConfigureFieldId }>,
    { placeHolder: 'Select what to configure for this target' }
  );
}

async function resolveTargetEdit(
  field: ConfigureFieldId,
  target: string,
  config: ProjectConfig,
  folder: vscode.WorkspaceFolder
): Promise<ConfigureProjectTargetEdit | undefined> {
  if (field === 'targetPlatformOverride') {
    return selectPlatformOverride();
  }
  if (field === 'program') {
    return selectProgram(folder);
  }
  if (field === 'assembler') {
    return selectAssembler();
  }
  if (field === 'targetName') {
    return editTargetName(target, config);
  }
  if (field === 'outputDir') {
    return editOutputDir(target, config);
  }
  return editArtifactBase(target, config);
}

async function selectPlatformOverride(): Promise<ConfigureProjectTargetEdit | undefined> {
  const pick = await vscode.window.showQuickPick(
    [
      { label: 'simple', detail: 'Generic Debug80 memory-map platform' },
      { label: 'tec1', detail: 'Classic TEC-1 keypad/LCD platform' },
      { label: 'tec1g', detail: 'TEC-1G LCD/GLCD/matrix platform' },
    ],
    { placeHolder: 'Select a platform override for this target' }
  );
  return pick
    ? { kind: 'targetPlatformOverride', platform: pick.label as Debug80PlatformId }
    : undefined;
}

async function selectProgram(
  folder: vscode.WorkspaceFolder
): Promise<ConfigureProjectTargetEdit | undefined> {
  const sources = listTargetSourceFiles(folder.uri.fsPath);
  if (sources.length === 0) {
    void vscode.window.showInformationMessage(
      'Debug80: No runnable AZM or Glimmer entry files were found in this project folder.'
    );
    return undefined;
  }
  const pick = await vscode.window.showQuickPick(
    sources.map((source) => ({ label: source })),
    { placeHolder: 'Select the program file for this target' }
  );
  return pick ? { kind: 'program', sourceFile: pick.label } : undefined;
}

async function selectAssembler(): Promise<ConfigureProjectTargetEdit | undefined> {
  const pick = await vscode.window.showQuickPick(
    [
      { label: 'default', detail: 'Use extension default by source file extension' },
      { label: 'azm', detail: 'Force AZM backend' },
      { label: 'glimmer', detail: 'Force Glimmer frontend and AZM backend' },
    ],
    { placeHolder: 'Select assembler for this target' }
  );
  return pick
    ? { kind: 'assembler', assembler: pick.label === 'default' ? undefined : pick.label }
    : undefined;
}

async function editTargetName(
  target: string,
  config: ProjectConfig
): Promise<ConfigureProjectTargetEdit | undefined> {
  const targets = config.targets ?? {};
  const value = (
    await vscode.window.showInputBox({
      prompt: 'Debug80 target name',
      value: target,
      validateInput: (candidate) => {
        const trimmed = candidate.trim();
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
  return value === undefined || value.length === 0 || value === target
    ? undefined
    : { kind: 'targetName', targetName: value };
}

async function editOutputDir(
  target: string,
  config: ProjectConfig
): Promise<ConfigureProjectTargetEdit | undefined> {
  const value = (
    await vscode.window.showInputBox({
      prompt: 'Output directory',
      value: String(config.targets?.[target]?.outputDir ?? ''),
      placeHolder: 'build',
    })
  )?.trim();
  return value !== undefined && value.length > 0
    ? { kind: 'outputDir', outputDir: value }
    : undefined;
}

async function editArtifactBase(
  target: string,
  config: ProjectConfig
): Promise<ConfigureProjectTargetEdit | undefined> {
  const value = (
    await vscode.window.showInputBox({
      prompt: 'Artifact base',
      value: String(config.targets?.[target]?.artifactBase ?? ''),
      placeHolder: 'main',
    })
  )?.trim();
  return value !== undefined && value.length > 0
    ? { kind: 'artifactBase', artifactBase: value }
    : undefined;
}
