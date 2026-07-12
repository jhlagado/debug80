/**
 * @file TEC-1G joystick panel input routing.
 */

import type { VscodeApi } from '../common/vscode';

type JoystickBinding = {
  bit: number;
};

type ArrowKeyMode = 'move' | 'fire';

const BASE_KEY_BINDINGS: Record<string, JoystickBinding> = {
  KeyW: { bit: 0x01 },
  KeyS: { bit: 0x02 },
  KeyA: { bit: 0x04 },
  KeyD: { bit: 0x08 },
  KeyI: { bit: 0x10 },
  KeyJ: { bit: 0x40 },
  Space: { bit: 0x40 },
  KeyK: { bit: 0x20 },
  KeyL: { bit: 0x80 },
};

const ARROW_MOVE_BINDINGS: Record<string, JoystickBinding> = {
  ArrowUp: { bit: 0x01 },
  ArrowDown: { bit: 0x02 },
  ArrowLeft: { bit: 0x04 },
  ArrowRight: { bit: 0x08 },
};

const ARROW_FIRE_BINDINGS: Record<string, JoystickBinding> = {
  ArrowUp: { bit: 0x10 },
  ArrowLeft: { bit: 0x40 },
  ArrowRight: { bit: 0x80 },
  ArrowDown: { bit: 0x20 },
};

const ARROW_KEY_CODES = new Set(Object.keys(ARROW_MOVE_BINDINGS));

export type JoystickUiController = {
  init: () => void;
  handleKeyEvent: (event: KeyboardEvent, pressed: boolean) => boolean;
  clear: () => void;
};

export function createJoystickUiController(
  vscode: VscodeApi,
  isKeyboardActive: () => boolean
): JoystickUiController {
  const root = document.getElementById('accordion-joystick') as HTMLElement | null;
  const buttons = new Map<number, HTMLElement[]>();
  const arrowModeButtons = new Map<ArrowKeyMode, HTMLElement[]>();
  const heldPointerBits = new Set<number>();
  const heldKeyboardCodes = new Set<string>();
  let arrowKeyMode: ArrowKeyMode = 'move';
  let lastPostedMask = -1;

  function currentMask(): number {
    let mask = 0;
    for (const bit of heldPointerBits) {
      mask |= bit;
    }
    for (const code of heldKeyboardCodes) {
      mask |= resolveBinding(code)?.bit ?? 0;
    }
    return mask & 0xff;
  }

  function postMask(): void {
    const mask = currentMask();
    if (mask === lastPostedMask) {
      return;
    }
    lastPostedMask = mask;
    vscode.postMessage({ type: 'joystick', mask });
  }

  function syncButtons(): void {
    const mask = currentMask();
    for (const [bit, elements] of buttons) {
      const active = (mask & bit) !== 0;
      for (const element of elements) {
        element.classList.toggle('active', active);
        element.setAttribute('aria-pressed', active ? 'true' : 'false');
      }
    }
  }

  function applyState(): void {
    syncButtons();
    postMask();
  }

  function syncArrowModeButtons(): void {
    for (const [mode, elements] of arrowModeButtons) {
      const active = mode === arrowKeyMode;
      for (const element of elements) {
        element.classList.toggle('active', active);
        element.setAttribute('aria-pressed', active ? 'true' : 'false');
      }
    }
  }

  function readBit(element: HTMLElement): number | null {
    const raw = element.dataset.joystickBit;
    if (raw === undefined) {
      return null;
    }
    const bit = Number(raw);
    return Number.isFinite(bit) ? bit & 0xff : null;
  }

  function setPointerBit(bit: number, pressed: boolean): void {
    if (pressed) {
      heldPointerBits.add(bit);
    } else {
      heldPointerBits.delete(bit);
    }
    applyState();
  }

  function readArrowKeyMode(element: HTMLElement): ArrowKeyMode | null {
    return element.dataset.joystickArrowMode === 'move' ||
      element.dataset.joystickArrowMode === 'fire'
      ? element.dataset.joystickArrowMode
      : null;
  }

  function resolveBinding(code: string): JoystickBinding | undefined {
    return (
      BASE_KEY_BINDINGS[code] ??
      (arrowKeyMode === 'move' ? ARROW_MOVE_BINDINGS : ARROW_FIRE_BINDINGS)[code]
    );
  }

  function setArrowKeyMode(mode: ArrowKeyMode): void {
    if (arrowKeyMode === mode) {
      syncArrowModeButtons();
      return;
    }
    arrowKeyMode = mode;
    for (const code of heldKeyboardCodes) {
      if (ARROW_KEY_CODES.has(code)) {
        heldKeyboardCodes.delete(code);
      }
    }
    syncArrowModeButtons();
    applyState();
  }

  function init(): void {
    if (!root) {
      return;
    }
    root.querySelectorAll<HTMLElement>('[data-joystick-bit]').forEach((button) => {
      const bit = readBit(button);
      if (bit === null) {
        return;
      }
      const existing = buttons.get(bit) ?? [];
      existing.push(button);
      buttons.set(bit, existing);
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('pointerdown', (event: PointerEvent) => {
        event.preventDefault();
        button.focus();
        try {
          button.setPointerCapture(event.pointerId);
        } catch {
          /* ignore browsers without pointer capture for this element */
        }
        setPointerBit(bit, true);
      });
      const release = (event: PointerEvent): void => {
        try {
          button.releasePointerCapture(event.pointerId);
        } catch {
          /* ignore */
        }
        setPointerBit(bit, false);
      };
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
    });
    root.querySelectorAll<HTMLElement>('[data-joystick-arrow-mode]').forEach((button) => {
      const mode = readArrowKeyMode(button);
      if (!mode) {
        return;
      }
      const existing = arrowModeButtons.get(mode) ?? [];
      existing.push(button);
      arrowModeButtons.set(mode, existing);
      button.addEventListener('click', () => setArrowKeyMode(mode));
    });
    syncArrowModeButtons();
    applyState();
  }

  function handleKeyEvent(event: KeyboardEvent, pressed: boolean): boolean {
    if (!isKeyboardActive()) {
      return false;
    }
    const binding = resolveBinding(event.code);
    if (!binding) {
      return false;
    }
    event.preventDefault();
    event.stopPropagation();
    if (pressed) {
      heldKeyboardCodes.add(event.code);
    } else {
      heldKeyboardCodes.delete(event.code);
    }
    applyState();
    return true;
  }

  function clear(): void {
    heldPointerBits.clear();
    heldKeyboardCodes.clear();
    applyState();
  }

  return { init, handleKeyEvent, clear };
}
