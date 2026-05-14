import type * as vscode from 'vscode';
import {
  getMementoForTarget,
  mergeTec1gPanelVisibility,
  TEC1G_UI_VISIBILITY_MEMENTO_KEY,
  type Tec1gVisibilityByTarget,
} from './tec1g-ui-visibility-memento';
import { findProjectConfigPath } from './project-config';
import { resolveProjectStatusSummary } from './project-status';

export interface Tec1gVisibilityContext {
  workspaceState: vscode.Memento | undefined;
  resolveWorkspace: () => vscode.WorkspaceFolder | undefined;
}

export function buildTec1gVisibilityMessage(
  adapterVisibility: Record<string, boolean> | undefined,
  ctx: Tec1gVisibilityContext
): { type: 'uiVisibility'; visibility: Record<string, boolean>; persist: true } {
  return {
    type: 'uiVisibility',
    visibility: mergeTec1gPanelVisibility(adapterVisibility, readTec1gPanelVisibilityMemento(ctx)),
    persist: true,
  };
}

export function readTec1gPanelVisibilityMemento(
  ctx: Tec1gVisibilityContext
): Record<string, boolean> | undefined {
  if (ctx.workspaceState === undefined) {
    return undefined;
  }
  const folder = ctx.resolveWorkspace();
  if (folder === undefined) {
    return undefined;
  }
  if (findProjectConfigPath(folder) === undefined) {
    return undefined;
  }
  const summary = resolveProjectStatusSummary(ctx.workspaceState, folder);
  const targetName = summary?.targetName ?? '__default__';
  const byTarget = ctx.workspaceState.get<Tec1gVisibilityByTarget>(TEC1G_UI_VISIBILITY_MEMENTO_KEY);
  return getMementoForTarget(byTarget, targetName);
}

export function saveTec1gPanelVisibility(
  visibility: Record<string, boolean>,
  targetNameFromWebview: string | undefined,
  ctx: Tec1gVisibilityContext
): void {
  if (ctx.workspaceState === undefined) {
    return;
  }
  const folder = ctx.resolveWorkspace();
  if (folder === undefined) {
    return;
  }
  if (findProjectConfigPath(folder) === undefined) {
    return;
  }
  const resolved =
    targetNameFromWebview !== undefined && targetNameFromWebview.length > 0
      ? targetNameFromWebview
      : (resolveProjectStatusSummary(ctx.workspaceState, folder)?.targetName ?? '__default__');
  const byTarget: Tec1gVisibilityByTarget = {
    ...(ctx.workspaceState.get<Tec1gVisibilityByTarget>(TEC1G_UI_VISIBILITY_MEMENTO_KEY) ?? {}),
  };
  byTarget[resolved] = { ...visibility };
  void ctx.workspaceState.update(TEC1G_UI_VISIBILITY_MEMENTO_KEY, byTarget);
}
