/**
 * @fileoverview Commands for starting, rebuilding, and retargeting debug sessions.
 */

import * as path from 'path';
import * as vscode from 'vscode';
import type {
  AzmPanelContractUpdateMode,
  AzmPanelRegisterContractsMode,
} from '../contracts/platform-view';
import { PlatformViewProvider } from './platform-view-provider';
import { ProjectTargetSelectionController } from './project-target-selection';
import { WorkspaceSelectionController } from './workspace-selection';
import { findProjectConfigPath } from './project-config';
import { promptToInitializeSelectedFolder } from './project-initialization-prompt';
import { findWorkspaceFolder } from './workspace-folder-resolver';
import {
  buildCurrentProjectTarget,
  maybeAutoStartSingleTargetForRootChange,
  resolveProjectPlatformForFolder,
  resolveSessionProjectConfigPath,
  resolveSessionWorkspaceFolder,
  startCurrentProjectDebugging,
} from './debug-session-actions';

type SelectWorkspaceFolderArgs = {
  rootPath?: string;
  platform?: string;
};

type StartDebugArgs = {
  rootPath?: string;
};

export function registerDebugLifecycleCommands(options: {
  context: vscode.ExtensionContext;
  platformViewProvider: PlatformViewProvider;
  workspaceSelection: WorkspaceSelectionController;
  targetSelection: ProjectTargetSelectionController;
}): void {
  const { context, platformViewProvider, workspaceSelection, targetSelection } = options;

  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.startDebug', async (args?: StartDebugArgs) => {
      const folder = await resolveDebugProjectFolder(args?.rootPath, workspaceSelection);
      if (!folder) {
        const workspaceFolderCount = vscode.workspace.workspaceFolders?.length ?? 0;
        void vscode.window.showInformationMessage(
          workspaceFolderCount === 0
            ? 'Debug80: No workspace folder open. Open or create a project folder first.'
            : 'Debug80: No configured Debug80 project found. Create a project first.'
        );
        return false;
      }
      platformViewProvider.setBuildStatus(undefined);
      return startCurrentProjectDebugging(
        folder,
        workspaceSelection,
        panelLaunchOptions(platformViewProvider)
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.restartDebug', async () => {
      const activeSession = vscode.debug.activeDebugSession;
      const folder = await resolveRestartProjectFolder(activeSession, workspaceSelection);
      if (!folder) {
        void vscode.window.showInformationMessage('Debug80: No configured Debug80 project found.');
        return false;
      }

      platformViewProvider.setBuildStatus(undefined);

      if (activeSession?.type === 'z80') {
        await vscode.debug.stopDebugging(activeSession);
      }

      return startCurrentProjectDebugging(
        folder,
        workspaceSelection,
        panelLaunchOptions(platformViewProvider)
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.buildTarget', async () => {
      const activeSession = vscode.debug.activeDebugSession;
      const folder = await resolveRestartProjectFolder(activeSession, workspaceSelection);
      if (!folder) {
        void vscode.window.showInformationMessage('Debug80: No configured Debug80 project found.');
        return false;
      }
      platformViewProvider.setBuildStatus(undefined);
      return buildCurrentProjectTarget(
        folder,
        workspaceSelection,
        panelLaunchOptions(platformViewProvider),
        (message, state) => platformViewProvider.setBuildStatus(message, state)
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'debug80.selectWorkspaceFolder',
      async (args?: SelectWorkspaceFolderArgs | string) => {
        const rootPath = typeof args === 'string' ? args : args?.rootPath;
        const platform = typeof args === 'string' ? undefined : args?.platform;
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

        const projectConfigPath = findProjectConfigPath(folder);
        if (projectConfigPath === undefined) {
          const created = await promptToInitializeSelectedFolder(folder, platform);
          if (created) {
            workspaceSelection.rememberWorkspace(folder);
            platformViewProvider.refreshIdleView();
            platformViewProvider.reveal?.(false);
          }
          return folder;
        }

        let restartedForRootChange = false;
        const activeSession = vscode.debug.activeDebugSession;
        if (activeSession?.type === 'z80') {
          const previousProjectConfig = resolveSessionProjectConfigPath(activeSession);
          const nextProjectConfig = projectConfigPath;
          if (
            previousProjectConfig !== undefined &&
            nextProjectConfig !== undefined &&
            path.normalize(nextProjectConfig) !== previousProjectConfig
          ) {
            await vscode.debug.stopDebugging(activeSession);
            const restarted = await startCurrentProjectDebugging(
              folder,
              workspaceSelection,
              panelLaunchOptions(platformViewProvider)
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
              panelLaunchOptions(platformViewProvider)
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
}

function panelLaunchOptions(platformViewProvider: PlatformViewProvider): {
  stopOnEntry: boolean;
  azmRegisterContractsMode: AzmPanelRegisterContractsMode;
  azmContractUpdateMode: AzmPanelContractUpdateMode;
} {
  return {
    stopOnEntry: platformViewProvider.stopOnEntry,
    azmRegisterContractsMode: platformViewProvider.azmRegisterContractsMode ?? 'enforce',
    azmContractUpdateMode: platformViewProvider.azmContractUpdateMode ?? 'ask',
  };
}

async function resolveDebugProjectFolder(
  rootPath: string | undefined,
  workspaceSelection: WorkspaceSelectionController
): Promise<vscode.WorkspaceFolder | undefined> {
  const directFolder = findWorkspaceFolder(rootPath);
  if (directFolder !== undefined && findProjectConfigPath(directFolder) !== undefined) {
    return directFolder;
  }
  return workspaceSelection.resolveWorkspaceFolder({
    prompt: true,
    requireProject: true,
    placeHolder: 'Select the Debug80 project folder to debug',
  });
}

async function resolveRestartProjectFolder(
  activeSession: vscode.DebugSession | undefined,
  workspaceSelection: WorkspaceSelectionController
): Promise<vscode.WorkspaceFolder | undefined> {
  if (activeSession?.type === 'z80') {
    const sessionFolder = resolveSessionWorkspaceFolder(activeSession);
    if (sessionFolder !== undefined) {
      return sessionFolder;
    }
  }
  return workspaceSelection.resolveWorkspaceFolder({
    prompt: true,
    requireProject: true,
    placeHolder: 'Select the Debug80 project folder to debug',
  });
}
