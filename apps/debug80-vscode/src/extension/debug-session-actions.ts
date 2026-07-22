/**
 * @file Actions for starting and managing Debug80 debug sessions.
 */

import * as path from 'path';
import * as vscode from 'vscode';
import {
  findProjectConfigPath,
  isInitializedDebug80Project,
  readProjectConfig,
  resolveProjectPlatform,
} from './project-config';
import {
  ProjectTargetSelectionController,
  listProjectTargetChoices,
} from './project-target-selection';
import { WorkspaceSelectionController } from './workspace-selection';
import type {
  AzmPanelContractUpdateMode,
  AzmPanelRegisterContractsMode,
} from '../contracts/platform-view';
import { populateFromConfig } from '../debug/launch-args';
import { resolveArtifacts, resolveBaseDir } from '../debug/mapping/path-resolver';
import { resolveAssemblerBackend } from '../debug/launch/assembler-backend';
import { assembleIfRequested } from '../debug/launch/launch-pipeline';
import { AssembleFailureError, formatAssemblyDiagnostic } from '../debug/launch/assembler';
import type { LaunchRequestArguments } from '../debug/session/types';
import { resolvePlatformProvider } from '../platforms/provider';
import { assertValidLaunchArgs } from '../debug/launch/config-validation';

export type PanelLaunchOptions = {
  stopOnEntry: boolean;
  azmRegisterContractsMode: AzmPanelRegisterContractsMode;
  azmContractUpdateMode: AzmPanelContractUpdateMode;
};

type ProjectActionContext = {
  projectConfig: string;
  azm: ReturnType<typeof resolveAzmLaunchOptions>;
};

function resolveAzmLaunchOptions(options: PanelLaunchOptions):
  | {
      registerContracts: 'off' | 'audit' | 'error';
      emitRegisterReport?: boolean;
      registerContractsProfile?: 'mon3';
    }
  | undefined {
  void options.azmContractUpdateMode;
  if (options.azmRegisterContractsMode === 'enforce') {
    return {
      registerContracts: 'error',
      emitRegisterReport: true,
      registerContractsProfile: 'mon3',
    };
  }
  if (options.azmRegisterContractsMode === 'audit') {
    return {
      registerContracts: 'audit',
      emitRegisterReport: true,
      registerContractsProfile: 'mon3',
    };
  }
  return { registerContracts: 'off' };
}

function resolveProjectActionContext(
  folder: vscode.WorkspaceFolder,
  workspaceSelection: WorkspaceSelectionController,
  options: PanelLaunchOptions
): ProjectActionContext | undefined {
  const projectConfig = findProjectConfigPath(folder);
  if (projectConfig === undefined) {
    void vscode.window.showErrorMessage(
      `Debug80: Could not find a project config in ${folder.uri.fsPath}.`
    );
    return undefined;
  }

  const targets = readProjectConfig(projectConfig)?.targets ?? {};
  if (Object.keys(targets).length === 0) {
    void vscode.window.showInformationMessage(
      'Debug80: This project has no targets yet. Pick a program file from the target dropdown first.'
    );
    return undefined;
  }

  workspaceSelection.rememberWorkspace(folder);
  return { projectConfig, azm: resolveAzmLaunchOptions(options) };
}

export async function startCurrentProjectDebugging(
  folder: vscode.WorkspaceFolder,
  workspaceSelection: WorkspaceSelectionController,
  options: PanelLaunchOptions
): Promise<boolean> {
  const context = resolveProjectActionContext(folder, workspaceSelection, options);
  if (context === undefined) {
    return false;
  }
  return vscode.debug.startDebugging(folder, {
    type: 'z80',
    request: 'launch',
    name: 'Debug80: Current Project',
    projectConfig: context.projectConfig,
    stopOnEntry: options.stopOnEntry,
    ...(context.azm !== undefined ? { azm: context.azm } : {}),
  });
}

/**
 * Builds the current target's artifacts without launching a debug session,
 * for workflows that only need the HEX (e.g. sending to real hardware).
 */
export async function buildCurrentProjectTarget(
  folder: vscode.WorkspaceFolder,
  workspaceSelection: WorkspaceSelectionController,
  targetSelection: ProjectTargetSelectionController,
  options: PanelLaunchOptions,
  output: vscode.OutputChannel,
  setBuildStatus: (message: string | undefined, state?: 'neutral' | 'error') => void
): Promise<boolean> {
  const context = resolveProjectActionContext(folder, workspaceSelection, options);
  if (context === undefined) {
    return false;
  }
  const target = await targetSelection.resolveTarget(context.projectConfig, {
    prompt: true,
    placeHolder: 'Select the Debug80 target to build',
  });
  if (target === null || target === undefined) {
    return false;
  }

  const args: LaunchRequestArguments = {
    projectConfig: context.projectConfig,
    target,
    ...(context.azm !== undefined ? { azm: context.azm } : {}),
  };
  try {
    assertValidLaunchArgs(args);
    const merged = populateFromConfig(args, {
      resolveBaseDir: (requestArgs) => resolveBaseDir(requestArgs),
    });
    assertValidLaunchArgs(merged);
    const baseDir = resolveBaseDir(merged);
    const { hexPath, asmPath } = resolveArtifacts(merged, baseDir);
    if (asmPath === undefined || asmPath === '') {
      throw new Error('The selected target has no program file to build.');
    }

    setBuildStatus(`Building ${path.relative(baseDir, asmPath)}...`);
    const platformProvider = await resolvePlatformProvider(merged);
    await assembleIfRequested({
      backend: resolveAssemblerBackend(merged.assembler, asmPath),
      args: { ...merged, assemble: true },
      asmPath,
      hexPath,
      sourceRoot: baseDir,
      platform: platformProvider.id,
      ...(platformProvider.simpleConfig !== undefined
        ? { simpleConfig: platformProvider.simpleConfig }
        : {}),
      onOutput: (message) => output.append(message),
    });

    const successMessage = `Build succeeded: ${path.relative(baseDir, hexPath)}`;
    setBuildStatus(successMessage);
    output.appendLine(`Debug80: ${successMessage}`);
    return true;
  } catch (error) {
    if (error instanceof AssembleFailureError) {
      const diagnostic = error.result.diagnostic;
      const summary =
        diagnostic !== undefined ? formatAssemblyDiagnostic(diagnostic) : error.message;
      const firstLine = summary.split('\n')[0] ?? 'Unknown assembly error.';
      setBuildStatus(`Build failed: ${firstLine}`, 'error');
      output.appendLine(`Debug80: Build failed: ${summary}`);
      output.show(true);
      return false;
    }
    setBuildStatus('Build failed.', 'error');
    output.appendLine(`Debug80: Build failed: ${String(error)}`);
    output.show(true);
    return false;
  }
}

export async function maybeAutoStartSingleTargetForRootChange(
  folder: vscode.WorkspaceFolder,
  workspaceSelection: WorkspaceSelectionController,
  targetSelection: ProjectTargetSelectionController,
  options: PanelLaunchOptions
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

  const started = await startCurrentProjectDebugging(folder, workspaceSelection, options);
  if (!started) {
    return undefined;
  }

  return onlyTarget;
}

export function resolveProjectPlatformForFolder(
  folder: vscode.WorkspaceFolder
): string | undefined {
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

export function resolveSessionProjectConfigPath(session: vscode.DebugSession): string | undefined {
  const projectConfigRaw = projectConfigFromSession(session);
  if (projectConfigRaw === undefined) {
    return undefined;
  }
  return path.normalize(
    path.isAbsolute(projectConfigRaw)
      ? projectConfigRaw
      : session.workspaceFolder !== undefined
        ? path.join(session.workspaceFolder.uri.fsPath, projectConfigRaw)
        : projectConfigRaw
  );
}

export function resolveSessionWorkspaceFolder(
  session: vscode.DebugSession
): vscode.WorkspaceFolder | undefined {
  const projectConfigPath = resolveSessionProjectConfigPath(session);
  if (projectConfigPath === undefined) {
    const sessionFolder = session.workspaceFolder;
    return sessionFolder !== undefined && isInitializedDebug80Project(sessionFolder)
      ? sessionFolder
      : undefined;
  }

  const sessionFolder = session.workspaceFolder;
  const sessionProjectConfig =
    sessionFolder !== undefined ? findProjectConfigPath(sessionFolder) : undefined;
  if (
    sessionFolder !== undefined &&
    sessionProjectConfig !== undefined &&
    path.normalize(sessionProjectConfig) === projectConfigPath
  ) {
    return sessionFolder;
  }

  return (vscode.workspace.workspaceFolders ?? []).find((folder) => {
    const candidate = findProjectConfigPath(folder);
    return candidate !== undefined && path.normalize(candidate) === projectConfigPath;
  });
}
