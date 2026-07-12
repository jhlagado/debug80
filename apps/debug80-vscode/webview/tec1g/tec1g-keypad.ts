/**
 * @file TEC-1G keypad — SysCtrl-enabled wrapper around shared `createTecKeypad`.
 */

import type { VscodeApi } from '../common/vscode';
import { createTecKeypad, type TecKeypad, type TecKeypadStatusEls } from '../common/tec-keypad';

export type Tec1gKeypad = TecKeypad;

export type Tec1gKeypadOptions = {
  onReset?: (state: { fn: boolean }) => void;
};

export function createTec1gKeypad(
  vscode: VscodeApi,
  keypadEl: HTMLElement,
  statusEls: TecKeypadStatusEls,
  options?: Tec1gKeypadOptions
): Tec1gKeypad {
  return createTecKeypad(vscode, keypadEl, { statusEls, onReset: options?.onReset });
}
