/**
 * @fileoverview Commands for copying bundled platform assets into projects.
 */

import * as vscode from 'vscode';
import { findProjectConfigPath, readProjectConfig } from './project-config';
import { materializeBundledAsset } from './bundle-materialize';
import {
  buildBundledAssetFallbackPlans,
  resolveProjectBundledAssetInstallPlan,
} from './bundle-asset-installer';
import { WorkspaceSelectionController } from './workspace-selection';

export function registerBundledAssetCommands(options: {
  context: vscode.ExtensionContext;
  workspaceSelection: WorkspaceSelectionController;
}): void {
  const { context, workspaceSelection } = options;

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
}
