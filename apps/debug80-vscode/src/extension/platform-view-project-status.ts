import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type {
  AzmPanelContractUpdateMode,
  AzmPanelRegisterContractsMode,
  PlatformId,
  ProjectStatusPayload,
} from '../contracts/platform-view';
import {
  findProjectConfigPath,
  readProjectConfig,
  resolveProjectAzmSymbolCase,
  resolveProjectPlatform,
} from './project-config';
import { resolveCoolTermHexArtifact } from './coolterm/coolterm-hex-artifact';
import { parseD8DebugMap } from '../mapping/d8-map';
import { isD8MapPossiblyStale, resolveD8MapPathForTarget } from './d8-definition-provider';
import { listProjectTargetChoices } from './project-target-selection';
import { resolveProjectStatusSummary } from './project-status';
import { resolveRememberedWorkspaceFolder } from './workspace-selection';

type TargetUiVisibility = NonNullable<ProjectStatusPayload['targetUiVisibility']>;

export interface PlatformViewProjectStatusContext {
  workspaceState: vscode.Memento | undefined;
  selectedWorkspace: vscode.WorkspaceFolder | undefined;
  currentPlatform: PlatformId | undefined;
  stopOnEntry: boolean;
  azmRegisterContractsMode?: AzmPanelRegisterContractsMode;
  azmContractUpdateMode?: AzmPanelContractUpdateMode;
  coolTermAvailable?: boolean;
  hardwareStatusText?: string;
  hardwareStatusState?: 'neutral' | 'error';
  buildStatusText?: string;
  buildStatusState?: 'neutral' | 'error';
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
      azmRegisterContractsMode: ctx.azmRegisterContractsMode ?? 'enforce',
      azmContractUpdateMode: ctx.azmContractUpdateMode ?? 'ask',
      azmSymbolCase: 'strict',
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
      azmRegisterContractsMode: ctx.azmRegisterContractsMode ?? 'enforce',
      azmContractUpdateMode: ctx.azmContractUpdateMode ?? 'ask',
      azmSymbolCase: 'strict',
    };
  }

  const config = readProjectConfig(projectConfigPath);
  const platform = resolveProjectPlatform(config) ?? 'simple';

  const hexArtifact = resolveCoolTermHexArtifact(folder.uri.fsPath, projectStatus?.targetName);
  const sourceMapStatus = resolveSourceMapStatus(folder, projectConfigPath, ctx.workspaceState);
  const targetUiVisibility = resolveTargetUiVisibility(config, projectStatus?.targetName);
  return {
    roots,
    targets: listProjectTargetChoices(projectConfigPath),
    rootName: folder.name,
    rootPath: folder.uri.fsPath,
    projectState: 'initialized',
    hasProject: true,
    platform,
    stopOnEntry: ctx.stopOnEntry,
    azmRegisterContractsMode: ctx.azmRegisterContractsMode ?? 'enforce',
    azmContractUpdateMode: ctx.azmContractUpdateMode ?? 'ask',
    azmSymbolCase: resolveProjectAzmSymbolCase(config),
    coolTermAvailable: ctx.coolTermAvailable === true,
    hardwareStatusText: ctx.hardwareStatusText ?? buildDefaultHardwareStatus(hexArtifact),
    hardwareStatusState:
      ctx.hardwareStatusText !== undefined ? (ctx.hardwareStatusState ?? 'neutral') : 'neutral',
    ...(ctx.buildStatusText !== undefined
      ? {
          buildStatusText: ctx.buildStatusText,
          buildStatusState: ctx.buildStatusState ?? 'neutral',
        }
      : {}),
    sourceMapStatusText: sourceMapStatus.text,
    sourceMapStatusState: sourceMapStatus.state,
    ...(hexArtifact.kind === 'found' || hexArtifact.kind === 'missing'
      ? { coolTermHexPath: hexArtifact.path }
      : {}),
    ...(projectStatus?.targetName !== undefined ? { targetName: projectStatus.targetName } : {}),
    ...(projectStatus?.entrySource !== undefined ? { entrySource: projectStatus.entrySource } : {}),
    ...(targetUiVisibility !== undefined ? { targetUiVisibility } : {}),
  };
}

function resolveTargetUiVisibility(
  config: ReturnType<typeof readProjectConfig>,
  targetName: string | undefined
): TargetUiVisibility | undefined {
  if (targetName === undefined) {
    return undefined;
  }
  const target = config?.targets?.[targetName];
  if (target === undefined || typeof target !== 'object') {
    return undefined;
  }
  const tec1g = (target as { tec1g?: unknown }).tec1g;
  if (tec1g === null || typeof tec1g !== 'object' || Array.isArray(tec1g)) {
    return undefined;
  }
  const uiVisibility = (tec1g as { uiVisibility?: unknown }).uiVisibility;
  if (uiVisibility === null || typeof uiVisibility !== 'object' || Array.isArray(uiVisibility)) {
    return undefined;
  }
  const source = uiVisibility as Record<string, unknown>;
  const result: TargetUiVisibility = {};
  if (typeof source.tms9918 === 'boolean') {
    result.tms9918 = source.tms9918;
  }
  if (typeof source.glcd === 'boolean') {
    result.glcd = source.glcd;
  }
  if (typeof source.serial === 'boolean') {
    result.serial = source.serial;
  }
  if (typeof source.matrix === 'boolean') {
    result.matrix = source.matrix;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function resolveSourceMapStatus(
  folder: vscode.WorkspaceFolder,
  projectConfigPath: string,
  workspaceState: vscode.Memento | undefined
): { text: string; state: NonNullable<ProjectStatusPayload['sourceMapStatusState']> } {
  const sourceMapPath = resolveD8MapPathForTarget(
    folder.uri.fsPath,
    projectConfigPath,
    workspaceState
  );
  if (sourceMapPath === undefined) {
    return { text: 'Source map: select a target and build.', state: 'unknown' };
  }
  if (!fs.existsSync(sourceMapPath)) {
    return { text: 'Source map: missing, build the selected target.', state: 'missing' };
  }
  let parsed: ReturnType<typeof parseD8DebugMap>;
  try {
    parsed = parseD8DebugMap(fs.readFileSync(sourceMapPath, 'utf-8'));
  } catch {
    return { text: 'Source map: unreadable, rebuild the selected target.', state: 'invalid' };
  }
  if (parsed.map === undefined) {
    return { text: 'Source map: invalid, rebuild the selected target.', state: 'invalid' };
  }
  if (isD8MapPossiblyStale(parsed.map, sourceMapPath, folder.uri.fsPath)) {
    return { text: 'Source map: stale, build recommended.', state: 'stale' };
  }
  return { text: 'Source map: current.', state: 'current' };
}

function buildDefaultHardwareStatus(
  hexArtifact: ReturnType<typeof resolveCoolTermHexArtifact>
): string {
  if (hexArtifact.kind === 'found') {
    return `Ready to send ${path.basename(hexArtifact.path)} via CoolTerm.`;
  }
  if (hexArtifact.kind === 'missing') {
    return `HEX file ${path.basename(hexArtifact.path)} was not found. Build the selected target first.`;
  }
  return 'Select a target with a buildable HEX artifact before sending to hardware.';
}
