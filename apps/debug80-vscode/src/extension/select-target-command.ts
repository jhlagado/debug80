import * as vscode from 'vscode';
import { addProjectTarget, findProjectConfigPath } from './project-config';
import { listProjectTargetChoices, resolvePreferredTargetName } from './project-target-selection';
import {
  resolveTargetProjectFolder,
  type SelectTargetArgs,
  type TargetCommandContext,
} from './target-command-context';

export async function selectTargetCommand(
  options: TargetCommandContext,
  args?: SelectTargetArgs
): Promise<string | undefined> {
  const { context, platformViewProvider, workspaceSelection, targetSelection } = options;
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
      ? listProjectTargetChoices(projectConfig).find((choice) => choice.name === args.targetName)
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

  const target =
    directTargetChoice?.name ??
    (await targetSelection.resolveTarget(projectConfig, {
      prompt: true,
      forcePrompt: true,
      placeHolder: 'Select the active Debug80 target',
    }));
  if (target === null) {
    return undefined;
  }
  if (target === undefined) {
    void vscode.window.showInformationMessage(
      args?.targetName !== undefined
        ? `Debug80: Target ${args.targetName} is not defined in this project.`
        : 'Debug80: This project does not define any named targets.'
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
}
