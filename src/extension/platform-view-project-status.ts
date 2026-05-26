import * as vscode from 'vscode';
import * as path from 'path';
import type {
  AzmPanelContractUpdateMode,
  AzmPanelRegisterCareMode,
  PlatformId,
  ProjectStatusPayload,
} from '../contracts/platform-view';
import { findProjectConfigPath, readProjectConfig, resolveProjectPlatform } from './project-config';
import { resolveCoolTermHexArtifact } from './coolterm/coolterm-hex-artifact';
import { listProjectTargetChoices } from './project-target-selection';
import { resolveProjectStatusSummary } from './project-status';
import { resolveRememberedWorkspaceFolder } from './workspace-selection';

export interface PlatformViewProjectStatusContext {
  workspaceState: vscode.Memento | undefined;
  selectedWorkspace: vscode.WorkspaceFolder | undefined;
  currentPlatform: PlatformId | undefined;
  stopOnEntry: boolean;
  azmRegisterCareMode?: AzmPanelRegisterCareMode;
  azmContractUpdateMode?: AzmPanelContractUpdateMode;
  coolTermAvailable?: boolean;
  hardwareStatusText?: string;
}

export function resolvePlatformViewWorkspace(
  ctx: Pick<PlatformViewProjectStatusContext, 'workspaceState' | 'selectedWorkspace'>,
  folders: readonly vscode.WorkspaceFolder[] = vscode.workspace.workspaceFolders ?? []
): vscode.WorkspaceFolder | undefined {
  if (
    ctx.selectedWorkspace !== undefined &&
    folders.some((folder) => folder.uri.fsPath === ctx.selectedWorkspace?.uri.fsPath)
  ) {
    return ctx.selectedWorkspace;
  }
  return (
    resolveRememberedWorkspaceFolder(ctx.workspaceState, folders) ??
    (folders.length === 1 ? folders[0] : undefined)
  );
}

export function buildPlatformViewProjectStatus(
  ctx: PlatformViewProjectStatusContext,
  folders: readonly vscode.WorkspaceFolder[] = vscode.workspace.workspaceFolders ?? []
): ProjectStatusPayload {
  const roots = folders.map((folder) => ({
    name: folder.name,
    path: folder.uri.fsPath,
    hasProject: findProjectConfigPath(folder) !== undefined,
  }));
  const folder = resolvePlatformViewWorkspace(ctx, folders);
  if (folder === undefined) {
    return {
      roots,
      targets: [],
      projectState: roots.length === 0 ? 'noWorkspace' : 'uninitialized',
      hasProject: false,
      platform: ctx.currentPlatform ?? 'simple',
      stopOnEntry: ctx.stopOnEntry,
      azmRegisterCareMode: ctx.azmRegisterCareMode ?? 'enforce',
      azmContractUpdateMode: ctx.azmContractUpdateMode ?? 'ask',
    };
  }

  const projectConfigPath = findProjectConfigPath(folder);
  const hasProject = projectConfigPath !== undefined;
  const projectStatus =
    hasProject && ctx.workspaceState !== undefined
      ? resolveProjectStatusSummary(ctx.workspaceState, folder)
      : undefined;
  if (!hasProject) {
    return {
      roots,
      targets: [],
      rootName: folder.name,
      rootPath: folder.uri.fsPath,
      projectState: 'uninitialized',
      hasProject: false,
      platform: ctx.currentPlatform ?? 'simple',
      stopOnEntry: ctx.stopOnEntry,
      azmRegisterCareMode: ctx.azmRegisterCareMode ?? 'enforce',
      azmContractUpdateMode: ctx.azmContractUpdateMode ?? 'ask',
    };
  }

  const config = readProjectConfig(projectConfigPath);
  const platform = resolveProjectPlatform(config) ?? 'simple';

  const hexArtifact = resolveCoolTermHexArtifact(folder.uri.fsPath, projectStatus?.targetName);
  return {
    roots,
    targets: listProjectTargetChoices(projectConfigPath),
    rootName: folder.name,
    rootPath: folder.uri.fsPath,
    projectState: 'initialized',
    hasProject: true,
    platform,
    stopOnEntry: ctx.stopOnEntry,
    azmRegisterCareMode: ctx.azmRegisterCareMode ?? 'enforce',
    azmContractUpdateMode: ctx.azmContractUpdateMode ?? 'ask',
    coolTermAvailable: ctx.coolTermAvailable === true,
    hardwareStatusText:
      ctx.hardwareStatusText ??
      buildDefaultHardwareStatus(ctx.coolTermAvailable === true, hexArtifact),
    ...(hexArtifact.kind === 'found' || hexArtifact.kind === 'missing'
      ? { coolTermHexPath: hexArtifact.path }
      : {}),
    ...(projectStatus?.targetName !== undefined ? { targetName: projectStatus.targetName } : {}),
    ...(projectStatus?.entrySource !== undefined ? { entrySource: projectStatus.entrySource } : {}),
  };
}

function buildDefaultHardwareStatus(
  coolTermAvailable: boolean,
  hexArtifact: ReturnType<typeof resolveCoolTermHexArtifact>
): string {
  if (!coolTermAvailable) {
    return 'CoolTerm not detected. Start CoolTerm and enable Remote Control Socket.';
  }
  if (hexArtifact.kind === 'found') {
    return `Ready to send ${path.basename(hexArtifact.path)} via CoolTerm.`;
  }
  if (hexArtifact.kind === 'missing') {
    return `HEX file not found at ${hexArtifact.path}. Build the selected target first.`;
  }
  return 'Select a target with a buildable HEX artifact before sending to hardware.';
}
