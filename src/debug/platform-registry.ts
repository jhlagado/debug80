/**
 * @fileoverview Platform command registry for custom request routing.
 */

import { CommandHandler } from './command-router';

export interface PlatformContribution {
  id: string;
  commands: Record<string, CommandHandler>;
}

export class PlatformRegistry {
  private readonly commands = new Map<string, CommandHandler>();

  clear(): void {
    this.commands.clear();
  }

  register(contribution: PlatformContribution): void {
    for (const [command, handler] of Object.entries(contribution.commands)) {
      this.commands.set(command, handler);
    }
  }

  getHandler(command: string): CommandHandler | undefined {
    return this.commands.get(command);
  }
}
