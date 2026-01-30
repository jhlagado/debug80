/**
 * @fileoverview IO request helpers for terminal/serial/speed commands.
 */

import { extractSerialText, extractSpeedMode, extractTerminalText, TerminalState } from './types';

export interface SerialTarget {
  queueSerial: (bytes: number[]) => void;
}

export interface SpeedTarget {
  setSpeed: (mode: 'slow' | 'fast') => void;
}

export function applyTerminalInput(args: unknown, terminalState: TerminalState): void {
  const textValue = extractTerminalText(args);
  const bytes = Array.from(textValue, (ch) => ch.charCodeAt(0) & 0xff);
  terminalState.input.push(...bytes);
}

export function applyTerminalBreak(terminalState: TerminalState): void {
  terminalState.breakRequested = true;
}

export function applySerialInput(args: unknown, target: SerialTarget): void {
  const textValue = extractSerialText(args);
  const bytes = Array.from(textValue, (ch) => ch.charCodeAt(0) & 0xff);
  target.queueSerial(bytes);
}

export function applySpeedChange(args: unknown, target: SpeedTarget): string | null {
  const mode = extractSpeedMode(args);
  if (mode === undefined) {
    return 'Debug80: Missing speed mode.';
  }
  target.setSpeed(mode);
  return null;
}
