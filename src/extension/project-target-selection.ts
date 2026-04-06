/**
 * @file Project target selection and persistence helpers.
 */

import * as vscode from 'vscode';
import { readProjectConfig } from './project-config';

const TARGET_KEY_PREFIX = 'debug80.selectedTarget:';

type ResolveTargetOptions = {
  prompt?: boolean;
  forcePrompt?: boolean;
  placeHolder?: string;
};

type TargetChoice = {
  name: string;
  description?: string;
  detail?: string;
};

type TargetQuickPickItem = vscode.QuickPickItem & {
  targetName: string;
};

type LoadedTargetChoices = {
  choices: TargetChoice[];
  defaultTarget?: string;
};

export function getStoredTargetName(
  workspaceState: vscode.Memento,
  projectConfigPath: string
): string | undefined {
  return workspaceState.get<string>(targetKeyFor(projectConfigPath));
}

export function resolvePreferredTargetName(
  workspaceState: vscode.Memento,
  projectConfigPath: string
): string | undefined {
  const { choices, defaultTarget } = loadTargetChoices(projectConfigPath);
  if (choices.length === 0) {
    return undefined;
  }

  const stored = getStoredTargetName(workspaceState, projectConfigPath);
  if (stored !== undefined && choices.some((choice) => choice.name === stored)) {
    return stored;
  }

  if (defaultTarget !== undefined && choices.some((choice) => choice.name === defaultTarget)) {
    return defaultTarget;
  }

  if (choices.length === 1) {
    return choices[0]?.name;
  }

  return undefined;
}

export class ProjectTargetSelectionController {
  constructor(private readonly context: vscode.ExtensionContext) {}

  rememberTarget(projectConfigPath: string, targetName: string): void {
    void this.context.workspaceState.update(targetKeyFor(projectConfigPath), targetName);
  }

  async resolveTarget(
    projectConfigPath: string,
    options: ResolveTargetOptions = {}
  ): Promise<string | null | undefined> {
    const { choices, defaultTarget } = loadTargetChoices(projectConfigPath);
    if (choices.length === 0) {
      return undefined;
    }

    const stored = getStoredTargetName(this.context.workspaceState, projectConfigPath);
    const forcePrompt = options.forcePrompt === true;
    const hasStored = stored !== undefined && choices.some((choice) => choice.name === stored);
    const hasDefault =
      defaultTarget !== undefined && choices.some((choice) => choice.name === defaultTarget);

    if (!forcePrompt && hasStored && stored !== undefined) {
      this.rememberTarget(projectConfigPath, stored);
      return stored;
    }

    if (!forcePrompt && hasDefault && defaultTarget !== undefined) {
      this.rememberTarget(projectConfigPath, defaultTarget);
      return defaultTarget;
    }

    if (choices.length === 1) {
      const only = choices[0]?.name;
      if (only !== undefined) {
        this.rememberTarget(projectConfigPath, only);
      }
      return only;
    }

    if (options.prompt !== true) {
      return undefined;
    }

    const items: TargetQuickPickItem[] = choices.map((choice) => {
      const status =
        choice.name === stored
          ? 'current'
          : choice.name === defaultTarget
            ? 'default'
            : undefined;
      const descriptionParts = [choice.description, status].filter(
        (value): value is string => value !== undefined && value.length > 0
      );
      return {
        label: choice.name,
        ...(descriptionParts.length > 0
          ? { description: descriptionParts.join(' • ') }
          : {}),
        ...(choice.detail !== undefined ? { detail: choice.detail } : {}),
        targetName: choice.name,
      };
    });

    const picked = await vscode.window.showQuickPick<TargetQuickPickItem>(
      items,
      {
        placeHolder: options.placeHolder ?? 'Select the Debug80 target',
        matchOnDescription: true,
        matchOnDetail: true,
      }
    );
    if (picked === undefined) {
      return null;
    }

    this.rememberTarget(projectConfigPath, picked.targetName);
    return picked.targetName;
  }

}

function loadTargetChoices(projectConfigPath: string): LoadedTargetChoices {
  const config = readProjectConfig(projectConfigPath);
  const targets = config?.targets ?? {};
  const entries = Object.entries(targets);
  const choices = entries.map(([name, target]) => ({
    name,
    ...(target.platform !== undefined || target.assembler !== undefined
      ? { description: target.platform ?? target.assembler }
      : {}),
    ...(target.sourceFile !== undefined || target.asm !== undefined || target.source !== undefined
      ? { detail: target.sourceFile ?? target.asm ?? target.source }
      : {}),
  }));

  const defaultTarget = config?.target ?? config?.defaultTarget;
  return {
    choices,
    ...(defaultTarget !== undefined ? { defaultTarget } : {}),
  };
}

function targetKeyFor(projectConfigPath: string): string {
  return `${TARGET_KEY_PREFIX}${projectConfigPath}`;
}