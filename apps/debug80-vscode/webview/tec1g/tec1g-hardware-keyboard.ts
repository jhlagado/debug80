import {
  releaseAllTecKeypadKeys,
  routeTecKeypadKeyup,
  routeTecKeypadShortcut,
} from '../common/keypad-focus-routing';
import { resolveTecKeypadShortcut } from '../common/tec-keyboard-shortcuts';
import type { Tec1gKeypad } from './tec1g-keypad';
import type { JoystickUiController } from './joystick-ui';
import type { MatrixUiController } from './matrix-ui';
import { shouldBypassEmulatorKeyboardTarget, type KeyboardOwner } from './keyboard-owner';

export interface Tec1gHardwareKeyboardController {
  dispose(): void;
  releaseAll(): void;
}

export function wireTec1gHardwareKeyboard(options: {
  machineSurface: HTMLElement;
  matrixKeyboardSurface: HTMLElement;
  joystickSurface: HTMLElement;
  keypad: Tec1gKeypad;
  matrixUi: MatrixUiController;
  joystickUi: JoystickUiController;
  getOwner: () => KeyboardOwner;
  selectOwner: (owner: Exclude<KeyboardOwner, null>) => void;
  applyMatrixKeyboardCapture: (captured: boolean) => void;
  updateMatrixKeyboardCue: () => void;
  onReset: (fn: boolean) => void;
}): Tec1gHardwareKeyboardController {
  const surfaces = [options.machineSurface, options.matrixKeyboardSurface, options.joystickSurface];

  function isHardwareKeyboardSurface(target: EventTarget | null): target is Node {
    return target instanceof Node && surfaces.some((surface) => surface.contains(target));
  }

  function shouldBypass(event: KeyboardEvent): boolean {
    return shouldBypassEmulatorKeyboardTarget(event.target);
  }

  function releaseAll(): void {
    releaseAllTecKeypadKeys(options.keypad);
    options.applyMatrixKeyboardCapture(false);
    options.joystickUi.clear();
  }

  function onPointerDown(event: PointerEvent): void {
    const target = event.target;
    if (shouldBypassEmulatorKeyboardTarget(target) || !isHardwareKeyboardSurface(target)) return;
    if (options.joystickSurface.contains(target)) {
      options.selectOwner('joystick');
    } else if (options.matrixKeyboardSurface.contains(target)) {
      options.selectOwner('matrixKeyboard');
    } else if (options.machineSurface.contains(target)) {
      options.selectOwner('keypad');
    }
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.repeat || shouldBypass(event)) return;
    const owner = options.getOwner();
    if (owner === 'matrixKeyboard' && options.matrixUi.handleKeyEvent(event, true)) {
      options.updateMatrixKeyboardCue();
      return;
    }
    if (owner === 'joystick' && options.joystickUi.handleKeyEvent(event, true)) return;
    if (owner !== 'keypad') return;
    routeTecKeypadShortcut(event, resolveTecKeypadShortcut(event.key), options.keypad, ({ fn }) => {
      releaseAllTecKeypadKeys(options.keypad);
      options.onReset(fn);
    });
  }

  function onKeyUp(event: KeyboardEvent): void {
    if (routeTecKeypadKeyup(event, options.keypad) || shouldBypass(event)) return;
    const owner = options.getOwner();
    if (owner === 'matrixKeyboard' && options.matrixUi.handleKeyEvent(event, false)) {
      options.updateMatrixKeyboardCue();
      return;
    }
    if (owner === 'joystick') options.joystickUi.handleKeyEvent(event, false);
  }

  document.addEventListener('pointerdown', onPointerDown, { capture: true });
  window.addEventListener('keydown', onKeyDown, { capture: true });
  window.addEventListener('keyup', onKeyUp, { capture: true });
  window.addEventListener('blur', releaseAll);

  return {
    releaseAll,
    dispose() {
      releaseAll();
      document.removeEventListener('pointerdown', onPointerDown, { capture: true });
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('keyup', onKeyUp, { capture: true });
      window.removeEventListener('blur', releaseAll);
    },
  };
}
