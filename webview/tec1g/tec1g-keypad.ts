/**
 * @file TEC-1G keypad — SysCtrl-enabled wrapper around shared `createTecKeypad`.
 */

import type { VscodeApi } from '../common/vscode';
import { createTecKeypad, type TecKeypad, type TecKeypadStatusEls } from '../common/tec-keypad';

export type Tec1gKeypad = TecKeypad;

export function createTec1gKeypad(
  vscode: VscodeApi,
  keypadEl: HTMLElement,
  statusEls: TecKeypadStatusEls
): Tec1gKeypad {
  return createTecKeypad(vscode, keypadEl, { statusEls });
}

export { TEC1G_KEY_MAP, TEC1G_SHIFT_BIT } from '../common/tec-keypad';
