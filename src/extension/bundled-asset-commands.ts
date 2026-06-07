/**
 * @fileoverview Commands for copying bundled platform assets into projects.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
  createMonitorRomEntrySource,
  monitorRomConventionForBundle,
} from '../debug/monitor-rom-conventions';
import { findProjectConfigPath, readProjectConfig } from './project-config';
import { materializeBundledRom } from './bundle-materialize';
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
      const bundleIds = [...new Set(installPlan.references.map((reference) => reference.bundleId))];
      for (const bundleId of bundleIds) {
        const result = materializeBundledRom(context.extensionUri, folder.uri.fsPath, bundleId, {
          overwrite: pick.value,
        });
        if (!result.ok) {
          void vscode.window.showErrorMessage(`Debug80: ${result.reason}`);
          return false;
        }
        installed.push(result.destinationRelative);
        const entryResult = ensureMonitorRomEntrySource(folder.uri.fsPath, bundleId, pick.value);
        if (!entryResult.ok) {
          void vscode.window.showErrorMessage(`Debug80: ${entryResult.reason}`);
          return false;
        }
        if (entryResult.createdRelativePath !== undefined) {
          installed.push(entryResult.createdRelativePath);
        }
      }
      void vscode.window.showInformationMessage(
        `Debug80: Copied monitor ROM into project for ${installPlan.label}: ${installed.join(', ')}`
      );
      return true;
    })
  );
}

function ensureMonitorRomEntrySource(
  workspaceRoot: string,
  bundleId: string,
  overwrite: boolean
): { ok: true; createdRelativePath?: string } | { ok: false; reason: string } {
  const convention = monitorRomConventionForBundle(bundleId);
  if (convention === undefined) {
    return { ok: true };
  }
  const target = path.resolve(workspaceRoot, convention.sourceEntryRel);
  if (fs.existsSync(target) && !overwrite) {
    return { ok: true };
  }
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, createMonitorRomEntrySource(convention));
  } catch (err) {
    return {
      ok: false,
      reason: `Could not create ${convention.sourceEntryRel}: ${String(err)}`,
    };
  }
  return { ok: true, createdRelativePath: convention.sourceEntryRel };
}
