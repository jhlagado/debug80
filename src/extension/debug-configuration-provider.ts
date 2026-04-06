/**
 * @file Debug configuration provider for current-project-aware z80 launches.
 */

import * as vscode from 'vscode';
import { findProjectConfigPath } from './project-config';
import { ProjectTargetSelectionController } from './project-target-selection';
import { WorkspaceSelectionController } from './workspace-selection';

type Debug80LaunchConfig = vscode.DebugConfiguration & {
  projectConfig?: string;
  asm?: string;
  sourceFile?: string;
  hex?: string;
  listing?: string;
};

export class Debug80ConfigurationProvider implements vscode.DebugConfigurationProvider {
  constructor(
    private readonly workspaceSelection: WorkspaceSelectionController,
    private readonly targetSelection: ProjectTargetSelectionController
  ) {}

  provideDebugConfigurations(
    _folder: vscode.WorkspaceFolder | undefined
  ): vscode.DebugConfiguration[] {
    return [this.createCurrentProjectConfig()];
  }

  async resolveDebugConfiguration(
    folder: vscode.WorkspaceFolder | undefined,
    config: Debug80LaunchConfig
  ): Promise<vscode.DebugConfiguration | null | undefined> {
    // Handle F5 with no launch.json / empty config — VS Code passes {}
    const configKeys = Object.keys(config).filter((k) => k !== 'name' && k !== 'request' && k !== 'type');
    const isEmptyConfig = !config.type && configKeys.length === 0;
    if (isEmptyConfig) {
      config = this.createCurrentProjectConfig();
    }

    const normalized = this.normalizeConfig(config);

    if (this.hasExplicitArtifactInputs(normalized)) {
      if (folder !== undefined) {
        this.workspaceSelection.rememberWorkspace(folder);
      }
      return normalized;
    }

    if (normalized.projectConfig !== undefined && normalized.projectConfig !== '') {
      if (folder !== undefined) {
        this.workspaceSelection.rememberWorkspace(folder);
      }
      return normalized;
    }

    // Use the folder VS Code gave us if it's a valid project
    let projectFolder: vscode.WorkspaceFolder | undefined;
    if (folder !== undefined && findProjectConfigPath(folder) !== undefined) {
      projectFolder = folder;
    } else {
      projectFolder = await this.workspaceSelection.resolveWorkspaceFolder({
        requireProject: true,
        prompt: true,
        placeHolder: 'Select the Debug80 project folder to debug',
      });
    }

    if (projectFolder === undefined) {
      const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
      if (workspaceFolders.length === 0) {
        void vscode.window.showInformationMessage(
          'Debug80: No workspace folder open. Open or create a project folder first.'
        );
        return null;
      }

      const choice = await vscode.window.showInformationMessage(
        'Debug80: No configured Debug80 project found. Create one now?',
        'Create Project'
      );
      if (choice !== 'Create Project') {
        return null;
      }

      const createdResult: unknown = await vscode.commands.executeCommand(
        'debug80.createProject'
      );
      if (createdResult !== true) {
        return null;
      }

      projectFolder = await this.workspaceSelection.resolveWorkspaceFolder({
        requireProject: true,
        prompt: true,
        placeHolder: 'Select the Debug80 project folder to debug',
      });
      if (projectFolder === undefined) {
        return null;
      }
    }

    const projectConfig = findProjectConfigPath(projectFolder);
    if (projectConfig === undefined) {
      void vscode.window.showErrorMessage(
        `Debug80: Could not find a project config in ${projectFolder.uri.fsPath}.`
      );
      return null;
    }

    this.workspaceSelection.rememberWorkspace(projectFolder);
    return {
      ...normalized,
      projectConfig,
    };
  }

  async resolveDebugConfigurationWithSubstitutedVariables(
    folder: vscode.WorkspaceFolder | undefined,
    config: Debug80LaunchConfig
  ): Promise<vscode.DebugConfiguration | null | undefined> {
    const normalized = this.normalizeConfig(config);

    if (this.hasExplicitArtifactInputs(normalized)) {
      if (folder !== undefined) {
        this.workspaceSelection.rememberWorkspace(folder);
      }
      return normalized;
    }

    const projectConfig = normalized.projectConfig;
    if (projectConfig === undefined || projectConfig === '') {
      return normalized;
    }

    if (normalized.target !== undefined && normalized.target !== '') {
      return normalized;
    }

    const target = await this.targetSelection.resolveTarget(projectConfig, {
      prompt: true,
      placeHolder: 'Select the Debug80 target to debug',
    });
    if (target === null) {
      return null;
    }
    if (target === undefined) {
      return normalized;
    }

    return {
      ...normalized,
      target,
    };
  }

  private normalizeConfig(config: Debug80LaunchConfig): Debug80LaunchConfig {
    const stopOnEntry = typeof config.stopOnEntry === 'boolean' ? config.stopOnEntry : true;

    return {
      ...config,
      type: 'z80',
      request: 'launch',
      name: config.name ?? 'Debug80: Current Project',
      stopOnEntry,
    };
  }

  private createCurrentProjectConfig(): vscode.DebugConfiguration {
    return this.normalizeConfig({
      type: 'z80',
      request: 'launch',
      name: 'Debug80: Current Project',
      stopOnEntry: true,
    });
  }

  private hasExplicitArtifactInputs(config: Debug80LaunchConfig): boolean {
    return Boolean(
      (config.asm !== undefined && config.asm !== '') ||
        (config.sourceFile !== undefined && config.sourceFile !== '') ||
        (config.hex !== undefined && config.hex !== '') ||
        (config.listing !== undefined && config.listing !== '')
    );
  }
}