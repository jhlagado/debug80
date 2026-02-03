/**
 * @fileoverview Command routing for debug adapter custom requests.
 */

import { DebugProtocol } from '@vscode/debugprotocol';

export type CommandHandler = (response: DebugProtocol.Response, args: unknown) => boolean;

export class CommandRouter {
  private readonly handlers = new Map<string, CommandHandler>();

  register(command: string, handler: CommandHandler): void {
    this.handlers.set(command, handler);
  }

  handle(command: string, response: DebugProtocol.Response, args: unknown): boolean {
    const handler = this.handlers.get(command);
    if (!handler) {
      return false;
    }
    return handler(response, args);
  }
}
