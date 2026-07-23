import * as vscode from 'vscode';
import { configureProjectCommand, setEntrySourceCommand } from './configure-target-commands';
import { openProjectConfigPanel } from './project-config-panel';
import { selectTargetCommand } from './select-target-command';
import { addTargetCommand, removeTargetCommand } from './target-list-commands';
import type {
  AddTargetArgs,
  SelectTargetArgs,
  TargetCommandContext,
} from './target-command-context';

export type { SelectTargetArgs } from './target-command-context';
export { resolveTargetProjectFolder } from './target-command-context';

export function registerTargetCommands(options: TargetCommandContext): void {
  const { context, platformViewProvider, workspaceSelection } = options;
  context.subscriptions.push(
    vscode.commands.registerCommand('debug80.selectTarget', (args?: SelectTargetArgs) =>
      selectTargetCommand(options, args)
    ),
    vscode.commands.registerCommand('debug80.addTarget', (args?: AddTargetArgs) =>
      addTargetCommand(options, args)
    ),
    vscode.commands.registerCommand('debug80.removeTarget', (args?: SelectTargetArgs) =>
      removeTargetCommand(options, args)
    ),
    vscode.commands.registerCommand('debug80.configureProject', () =>
      configureProjectCommand(options)
    ),
    vscode.commands.registerCommand('debug80.setEntrySource', (resource?: vscode.Uri) =>
      setEntrySourceCommand(options, resource)
    ),
    vscode.commands.registerCommand('debug80.openProjectConfigPanel', () =>
      openProjectConfigPanel(workspaceSelection, platformViewProvider)
    )
  );
}
