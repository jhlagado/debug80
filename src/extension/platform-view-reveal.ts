/**
 * @file Reveal/focus helper for the Debug80 platform view.
 */

import * as vscode from 'vscode';

export interface PlatformViewRevealCommands {
  executeCommand: (command: string) => Thenable<unknown>;
}

export interface PlatformViewRevealTarget {
  show?: (preserveFocus?: boolean) => void;
}

export interface PlatformViewRevealOptions {
  focusCommand: string;
  fallbackCommand: string;
  focus: boolean;
  target: PlatformViewRevealTarget | undefined;
  commands?: PlatformViewRevealCommands;
}

/**
 * Reveals the platform view, falling back to the Debug view if direct focus fails.
 */
export function revealPlatformView(options: PlatformViewRevealOptions): void {
  const { focusCommand, fallbackCommand, focus, target, commands = vscodeCommands() } = options;
  const command = focus ? focusCommand : fallbackCommand;

  void commands.executeCommand(command).then(
    () => {
      target?.show?.(!focus);
    },
    () => {
      void commands.executeCommand(fallbackCommand).then(
        () => {
          target?.show?.(!focus);
        },
        () => {
          target?.show?.(!focus);
        }
      );
    }
  );
}

function vscodeCommands(): PlatformViewRevealCommands {
  return vscode.commands;
}
