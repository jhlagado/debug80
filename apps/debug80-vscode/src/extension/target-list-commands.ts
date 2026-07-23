import * as vscode from 'vscode';
import {
  addProjectTarget,
  findProjectConfigPath,
  projectTargetNameFromSource,
  readProjectConfig,
  removeProjectTarget,
} from './project-config';
import { resolvePreferredTargetName } from './project-target-selection';
import { entrySourceKey, getTargetEntrySource } from './project-target-source-policy';
import { isTargetEntrySourcePath, listTargetSourceFiles } from './target-discovery';
import {
  resolveTargetProjectFolder,
  type AddTargetArgs,
  type SelectTargetArgs,
  type TargetCommandContext,
} from './target-command-context';

export async function addTargetCommand(
  options: TargetCommandContext,
  args?: AddTargetArgs
): Promise<string | undefined> {
  const { platformViewProvider, workspaceSelection, targetSelection } = options;
  const folderResolution = await resolveTargetProjectFolder(args, workspaceSelection);
  if (folderResolution.kind !== 'found') {
    void vscode.window.showInformationMessage('Debug80: No configured Debug80 project found.');
    return undefined;
  }
  const { folder } = folderResolution;
  const projectConfigPath = findProjectConfigPath(folder);
  const config = projectConfigPath !== undefined ? readProjectConfig(projectConfigPath) : undefined;
  if (projectConfigPath === undefined || config === undefined) {
    void vscode.window.showErrorMessage('Debug80: Failed to read project config.');
    return undefined;
  }

  const configuredSources = new Set(
    Object.values(config.targets ?? {}).flatMap((target) => {
      const source = getTargetEntrySource(target);
      return source === undefined ? [] : [entrySourceKey(folder.uri.fsPath, source)];
    })
  );
  const candidates = listTargetSourceFiles(folder.uri.fsPath).filter(
    (source) => !configuredSources.has(entrySourceKey(folder.uri.fsPath, source))
  );
  if (candidates.length === 0) {
    void vscode.window.showInformationMessage(
      'Debug80: Every eligible ASM, Z80, or Glimmer program file is already a target.'
    );
    return undefined;
  }

  const sourceFile = await selectTargetSource(candidates, args?.sourceFile);
  if (sourceFile === undefined) {
    return undefined;
  }
  const targetName = nextTargetName(config.targets ?? {}, sourceFile);
  if (!addProjectTarget(projectConfigPath, targetName, sourceFile)) {
    void vscode.window.showErrorMessage(`Debug80: Failed to add target ${targetName}.`);
    return undefined;
  }

  targetSelection.rememberTarget(projectConfigPath, targetName);
  platformViewProvider.refreshIdleView();
  void vscode.window.showInformationMessage(
    `Debug80: Added target ${targetName} from ${sourceFile}.`
  );
  return targetName;
}

export async function removeTargetCommand(
  options: TargetCommandContext,
  args?: SelectTargetArgs
): Promise<string | undefined> {
  const { context, platformViewProvider, workspaceSelection, targetSelection } = options;
  const folderResolution = await resolveTargetProjectFolder(args, workspaceSelection);
  if (folderResolution.kind !== 'found') {
    void vscode.window.showInformationMessage('Debug80: No configured Debug80 project found.');
    return undefined;
  }
  const projectConfigPath = findProjectConfigPath(folderResolution.folder);
  if (projectConfigPath === undefined) {
    void vscode.window.showErrorMessage('Debug80: Failed to read project config.');
    return undefined;
  }
  const targetName =
    args?.targetName ?? resolvePreferredTargetName(context.workspaceState, projectConfigPath);
  if (targetName === undefined) {
    void vscode.window.showInformationMessage('Debug80: Select a configured target first.');
    return undefined;
  }

  const confirmed = await vscode.window.showWarningMessage(
    `Remove target ${targetName} from this project? Its source files and build artifacts will not be deleted.`,
    { modal: true },
    'Remove Target'
  );
  if (confirmed !== 'Remove Target') {
    return undefined;
  }
  const result = removeProjectTarget(projectConfigPath, targetName);
  if (result.kind !== 'removed') {
    void vscode.window.showErrorMessage(`Debug80: Failed to remove target ${targetName}.`);
    return undefined;
  }

  if (result.nextTarget === undefined) {
    targetSelection.forgetTarget(projectConfigPath);
  } else {
    targetSelection.rememberTarget(projectConfigPath, result.nextTarget);
  }
  platformViewProvider.refreshIdleView();
  void vscode.window.showInformationMessage(
    result.nextTarget === undefined
      ? `Debug80: Removed target ${targetName}. The project has no targets now; pick a program file to add one.`
      : `Debug80: Removed target ${targetName}. Source files were left unchanged.`
  );
  return result.nextTarget;
}

async function selectTargetSource(
  candidates: string[],
  requestedSource: string | undefined
): Promise<string | undefined> {
  if (requestedSource !== undefined && candidates.includes(requestedSource)) {
    return requestedSource;
  }
  return (
    await vscode.window.showQuickPick(
      candidates.map((source) => ({
        label: source,
        ...(isTargetEntrySourcePath(source) ? { description: 'suggested entry' } : {}),
      })),
      {
        placeHolder: 'Select an ASM, Z80, or Glimmer program file to add as a target',
        matchOnDescription: true,
      }
    )
  )?.label;
}

function nextTargetName(targets: Record<string, unknown>, sourceFile: string): string {
  const existingNames = new Set(Object.keys(targets));
  const baseName = projectTargetNameFromSource(sourceFile) || 'target';
  let targetName = baseName;
  let suffix = 2;
  while (existingNames.has(targetName)) {
    targetName = `${baseName}-${suffix++}`;
  }
  return targetName;
}
