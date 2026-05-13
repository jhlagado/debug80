/**
 * Shared keypad behaviour: focus management, shift/modifier latch, and key dispatch.
 *
 * Platforms wrap this to add their own button layout and CSS. The core owns:
 *   - tabIndex and container mousedown → focus wiring
 *   - shift latch state + sendKey bit manipulation
 *   - per-button mousedown focus helper
 *
 * The shift indicator element is registered after creation via setOnShiftChange()
 * so the platform can provide the button reference once it has built the keypad.
 */

import type { VscodeApi } from './vscode';

export interface KeypadCore {
  sendKey(code: number): void;
  setShiftLatched(value: boolean): void;
  getShiftLatched(): boolean;
  toggleShift(): void;
  focusKeypad(): void;
  /** Wire a per-button focus mousedown handler. Call once per button element. */
  addButtonFocusHandler(button: HTMLElement): void;
  /** Register a callback that fires whenever the shift latch state changes. */
  setOnShiftChange(callback: (latched: boolean) => void): void;
}

export function createKeypadCore(
  keypadEl: HTMLElement,
  vscode: VscodeApi,
  shiftBit: number
): KeypadCore {
  let shiftLatched = false;
  let onShiftChange: ((latched: boolean) => void) | null = null;

  keypadEl.tabIndex = 0;
  keypadEl.addEventListener('mousedown', (e) => {
    e.preventDefault();
    keypadEl.focus();
  });

  function setShiftLatched(value: boolean): void {
    shiftLatched = value;
    onShiftChange?.(value);
  }

  function sendKey(code: number): void {
    const adjusted = shiftLatched ? code & ~shiftBit : code | shiftBit;
    vscode.postMessage({ type: 'key', code: adjusted });
    if (shiftLatched) {
      setShiftLatched(false);
    }
  }

  return {
    sendKey,
    setShiftLatched,
    getShiftLatched: () => shiftLatched,
    toggleShift: () => setShiftLatched(!shiftLatched),
    focusKeypad: () => keypadEl.focus(),
    addButtonFocusHandler(button: HTMLElement): void {
      button.addEventListener('mousedown', (e) => {
        e.preventDefault();
        keypadEl.focus();
      });
    },
    setOnShiftChange(callback: (latched: boolean) => void): void {
      onShiftChange = callback;
    },
  };
}
