/**
 * @file Shared logging abstractions for Debug80.
 */

import * as vscode from 'vscode';

export interface Logger {
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function formatLogMessage(message: string, args: unknown[]): string {
  if (args.length === 0) {
    return message;
  }
  return `${message} ${args.map((value) => formatValue(value)).join(' ')}`.trim();
}

export class OutputChannelLogger implements Logger {
  public constructor(private readonly channel: vscode.OutputChannel) {}

  public debug(message: string, ...args: unknown[]): void {
    this.channel.appendLine(`[DEBUG] ${formatLogMessage(message, args)}`);
  }

  public info(message: string, ...args: unknown[]): void {
    this.channel.appendLine(`[INFO] ${formatLogMessage(message, args)}`);
  }

  public warn(message: string, ...args: unknown[]): void {
    this.channel.appendLine(`[WARN] ${formatLogMessage(message, args)}`);
  }

  public error(message: string, ...args: unknown[]): void {
    this.channel.appendLine(`[ERROR] ${formatLogMessage(message, args)}`);
  }
}

export class NullLogger implements Logger {
  public debug(): void {}

  public info(): void {}

  public warn(): void {}

  public error(): void {}
}
