/**
 * Shared keypad behaviour: focus management, shift/modifier latch, and key dispatch.
 *
 * Platforms wrap this to add their own button layout and CSS. The core owns:
 *   - tabIndex and container mousedown → focus wiring
 *   - shift latch state + key-code adjustment
 *   - per-button mousedown focus helper
 *
 * The shift indicator element is registered after creation via setOnShiftChange()
 * so the platform can provide the button reference once it has built the keypad.
 */

import type { VscodeApi } from './vscode';

export type KeypadPressHandle = {
  code: number;
  generation: number;
};

export interface KeypadCore {
  /** Press-and-hold: posts pressed=true and returns ownership of that press. */
  pressKey(code: number): KeypadPressHandle;
  /** Releases a press only while its ownership handle is still current. */
  releaseKey(press: KeypadPressHandle): void;
  /** Releases every active press, regardless of its input route. */
  releaseAllKeys(): void;
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
  let pressGeneration = 0;
  const activePresses = new Map<number, KeypadPressHandle>();

  keypadEl.tabIndex = 0;
  keypadEl.addEventListener('mousedown', (e) => {
    e.preventDefault();
    keypadEl.focus();
  });

  function setShiftLatched(value: boolean): void {
    shiftLatched = value;
    onShiftChange?.(value);
  }

  function adjustForShift(code: number): number {
    const adjusted = shiftLatched ? code & ~shiftBit : code | shiftBit;
    if (shiftLatched) {
      setShiftLatched(false);
    }
    return adjusted;
  }

  function pressKey(code: number): KeypadPressHandle {
    const adjusted = adjustForShift(code);
    const press = { code: adjusted, generation: ++pressGeneration };
    activePresses.set(adjusted, press);
    vscode.postMessage({ type: 'key', code: adjusted, pressed: true });
    return press;
  }

  function releaseKey(press: KeypadPressHandle): void {
    if (activePresses.get(press.code)?.generation !== press.generation) {
      return;
    }
    activePresses.delete(press.code);
    vscode.postMessage({ type: 'key', code: press.code, pressed: false });
  }

  function releaseAllKeys(): void {
    const presses = Array.from(activePresses.values());
    activePresses.clear();
    for (const press of presses) {
      vscode.postMessage({ type: 'key', code: press.code, pressed: false });
    }
  }

  return {
    pressKey,
    releaseKey,
    releaseAllKeys,
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
