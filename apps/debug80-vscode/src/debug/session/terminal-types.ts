/**
 * @fileoverview Terminal configuration and runtime state types.
 */

/**
 * Terminal configuration for serial I/O emulation.
 */
export interface TerminalConfig {
  /** Port number for transmitting data (default: 0) */
  txPort?: number;
  /** Port number for receiving data (default: 1) */
  rxPort?: number;
  /** Port number for status register (default: 2) */
  statusPort?: number;
  /** Whether to trigger interrupts on input (default: false) */
  interrupt?: boolean;
}

/**
 * Normalized terminal configuration with all values required.
 */
export interface TerminalConfigNormalized {
  txPort: number;
  rxPort: number;
  statusPort: number;
  interrupt: boolean;
}

/**
 * Runtime state for terminal emulation.
 */
export interface TerminalState {
  config: TerminalConfigNormalized;
  input: number[];
  breakRequested?: boolean;
}
