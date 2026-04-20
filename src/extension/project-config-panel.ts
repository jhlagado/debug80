/**
 * @fileoverview Handler for the debug80.openProjectConfigPanel command.
 */

import * as vscode from 'vscode';
import {
  DEBUG80_PROJECT_VERSION,
  findProjectConfigPath,
  readProjectConfig,
  writeProjectConfig,
} from './project-config';
import { buildProjectConfigPanelHtml, createNonce } from './config-panel-html';
import type { WorkspaceSelectionController } from './workspace-selection';
import type { ProjectConfig } from '../debug/session/types';

export async function openProjectConfigPanel(
  workspaceSelection: WorkspaceSelectionController,
  platformViewProvider: { refreshIdleView(): void }
): Promise<boolean | undefined> {
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

  const initialConfig = readProjectConfig(projectConfigPath);
  if (initialConfig === undefined) {
    void vscode.window.showErrorMessage('Debug80: Failed to read project config.');
    return undefined;
  }
  let config: ProjectConfig = initialConfig;

  const panel = vscode.window.createWebviewPanel(
    'debug80ProjectConfig',
    `Debug80 Project Settings: ${folder.name}`,
    vscode.ViewColumn.Active,
    { enableScripts: true, retainContextWhenHidden: true }
  );
  panel.webview.html = buildProjectConfigPanelHtml(config, panel.webview.cspSource, createNonce());

  const messageDisposable = panel.webview.onDidReceiveMessage((msg: unknown) => {
    const payload = msg as { type?: string; platform?: string; defaultTarget?: string };
    if (payload.type !== 'saveProjectConfig') {
      return;
    }

    const platform = payload.platform;
    const defaultTarget = payload.defaultTarget;
    if (
      (platform !== 'simple' && platform !== 'tec1' && platform !== 'tec1g') ||
      typeof defaultTarget !== 'string'
    ) {
      void vscode.window.showErrorMessage('Debug80: Invalid project configuration values.');
      return;
    }

    const targets = config.targets ?? {};
    if (targets[defaultTarget] === undefined) {
      void vscode.window.showErrorMessage('Debug80: Selected default target no longer exists.');
      return;
    }

    const next: ProjectConfig = {
      ...config,
      projectVersion: DEBUG80_PROJECT_VERSION,
      projectPlatform: platform,
      defaultTarget,
      target: defaultTarget,
    };
    const written = writeProjectConfig(projectConfigPath, next);
    if (!written) {
      void vscode.window.showErrorMessage('Debug80: Failed to update project config.');
      return;
    }

    config = next;
    panel.webview.html = buildProjectConfigPanelHtml(
      config,
      panel.webview.cspSource,
      createNonce()
    );
    platformViewProvider.refreshIdleView();
    void vscode.window.showInformationMessage('Debug80: Project configuration updated.');
  });
  panel.onDidDispose(() => {
    messageDisposable.dispose();
  });

  return true;
}
