/**
 * @file Command registration for the Debug80 extension.
 */

import * as vscode from 'vscode';
import { PlatformViewProvider } from './platform-view-provider';
import { ProjectTargetSelectionController } from './project-target-selection';
import { SourceColumnController } from './source-columns';
import { TerminalPanelController } from './terminal-panel';
import { WorkspaceSelectionController } from './workspace-selection';
import { registerBundledAssetCommands } from './bundled-asset-commands';
import { registerCallStackCommands } from './call-stack-commands';
import { registerDebugLifecycleCommands } from './debug-lifecycle-commands';
import { registerPanelViewCommands } from './panel-view-commands';
import { registerProjectWorkspaceCommands } from './project-workspace-commands';
import { registerSerialCommands } from './serial-commands';
import { registerSourceCommands } from './source-commands';
import { registerTargetCommands } from './target-commands';
import { registerTerminalCommands } from './terminal-commands';

type CommandDependencies = {
  context: vscode.ExtensionContext;
  platformViewProvider: PlatformViewProvider;
  sourceColumns: SourceColumnController;
  terminalPanel: TerminalPanelController;
  workspaceSelection: WorkspaceSelectionController;
  targetSelection: ProjectTargetSelectionController;
  output: vscode.OutputChannel;
};

export function registerExtensionCommands({
  context,
  platformViewProvider,
  sourceColumns,
  terminalPanel,
  workspaceSelection,
  targetSelection,
  output,
}: CommandDependencies): void {
  registerProjectWorkspaceCommands({ context, platformViewProvider, workspaceSelection });
  registerPanelViewCommands({ context, platformViewProvider, sourceColumns, terminalPanel });
  registerSourceCommands({ context, sourceColumns, workspaceSelection });
  registerTerminalCommands(context);
  registerBundledAssetCommands({ context, workspaceSelection });
  registerCallStackCommands(context);
  registerDebugLifecycleCommands({
    context,
    platformViewProvider,
    workspaceSelection,
    targetSelection,
    output,
  });
  registerTargetCommands({ context, platformViewProvider, workspaceSelection, targetSelection });
  registerSerialCommands({ context, platformViewProvider, workspaceSelection });
}
