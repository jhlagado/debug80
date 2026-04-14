/**
 * @file TEC-1G on-screen keypad construction and SysCtrl / status LED helpers.
 */

import type { VscodeApi } from '../common/vscode';
import {
  TEC1G_CONTROL_LABELS,
  TEC1G_CONTROL_ORDER,
  TEC1G_HEX_ORDER,
  TEC1G_KEY_MAP,
  TEC1G_SHIFT_BIT,
} from './keypad-layout';

export type Tec1gKeypad = {
  sendKey: (code: number) => void;
  setShiftLatched: (value: boolean) => void;
  getShiftLatched: () => boolean;
  shiftButton: HTMLDivElement;
  setSysCtrlValue: (value: number) => void;
  getSysCtrlValue: () => number;
  updateSysCtrl: () => void;
  updateStatusLeds: () => void;
};

/**
 * Builds the keypad grid, RESET, FN shift, and SysCtrl bar; returns control helpers for host updates.
 */
export function createTec1gKeypad(
  vscode: VscodeApi,
  keypadEl: HTMLElement,
  statusEls: {
    statusShadow: HTMLElement | null;
    statusProtect: HTMLElement | null;
    statusExpand: HTMLElement | null;
    statusCaps: HTMLElement | null;
  }
): Tec1gKeypad {
  let sysCtrlSegs: HTMLElement[] = [];
  let sysCtrlValue = 0;
  let shiftLatched = false;

  function setShiftLatched(value: boolean): void {
    shiftLatched = value;
    shiftButton.classList.toggle('active', shiftLatched);
  }

  function sendKey(code: number): void {
    let adjusted = code;
    if (shiftLatched) {
      adjusted = code & ~TEC1G_SHIFT_BIT;
    } else {
      adjusted = code | TEC1G_SHIFT_BIT;
    }
    vscode.postMessage({ type: 'key', code: adjusted });
    if (shiftLatched) {
      setShiftLatched(false);
    }
  }

  function addButton(
    label: string,
    action: () => void,
    className: string | undefined,
    col: number | undefined,
    row: number | undefined,
    isLongLabel: boolean
  ): HTMLDivElement {
    const button = document.createElement('div');
    button.className = className ? 'keycap ' + className : 'keycap';
    const labelSpan = document.createElement('span');
    labelSpan.className = 'label ' + (isLongLabel ? 'long' : 'short');
    labelSpan.textContent = label;
    button.appendChild(labelSpan);
    if (col) {
      button.style.gridColumn = String(col);
    }
    if (row) {
      button.style.gridRow = String(row);
    }
    button.addEventListener('click', action);
    keypadEl.appendChild(button);
    return button;
  }

  function addSysCtrlBar(col: number, row: number, rowSpan?: number): void {
    const bar = document.createElement('div');
    bar.className = 'sysctrl';
    for (let i = 0; i < 8; i += 1) {
      const seg = document.createElement('div');
      seg.className = 'sysctrl-seg';
      bar.appendChild(seg);
    }
    bar.style.gridColumn = String(col);
    bar.style.gridRow = rowSpan ? row + ' / span ' + rowSpan : String(row);
    keypadEl.appendChild(bar);
    sysCtrlSegs = Array.from(bar.querySelectorAll('.sysctrl-seg'));
  }

  function updateSysCtrl(): void {
    if (!sysCtrlSegs.length) {
      return;
    }
    for (let i = 0; i < 8; i += 1) {
      const on = (sysCtrlValue & (1 << i)) !== 0;
      const seg = sysCtrlSegs[7 - i];
      if (seg) {
        seg.classList.toggle('on', on);
      }
    }
  }

  function updateStatusLeds(): void {
    const shadowOn = (sysCtrlValue & 0x01) === 0;
    const protectOn = (sysCtrlValue & 0x02) !== 0;
    const expandOn = (sysCtrlValue & 0x04) !== 0;
    const capsOn = (sysCtrlValue & 0x20) !== 0;
    const { statusShadow, statusProtect, statusExpand, statusCaps } = statusEls;
    if (statusShadow) {
      statusShadow.classList.toggle('on', shadowOn);
    }
    if (statusProtect) {
      statusProtect.classList.toggle('on', protectOn);
    }
    if (statusExpand) {
      statusExpand.classList.toggle('on', expandOn);
    }
    if (statusCaps) {
      statusCaps.classList.toggle('on', capsOn);
    }
  }

  addButton(
    'RESET',
    () => {
      setShiftLatched(false);
      vscode.postMessage({ type: 'reset' });
    },
    'keycap-light',
    1,
    1,
    true
  );
  addSysCtrlBar(1, 2, 2);

  for (let row = 0; row < 4; row += 1) {
    const control = TEC1G_CONTROL_ORDER[row];
    const rowNum = row + 1;
    const controlLabel = TEC1G_CONTROL_LABELS[control] ?? control;
    const isLong = controlLabel.length > 1;
    addButton(
      controlLabel,
      () => sendKey(TEC1G_KEY_MAP[control]),
      'keycap-light',
      2,
      rowNum,
      isLong
    );
    const rowStart = row * 4;
    for (let col = 0; col < 4; col += 1) {
      const label = TEC1G_HEX_ORDER[rowStart + col];
      addButton(
        label,
        () => sendKey(TEC1G_KEY_MAP[label]),
        'keycap-cream',
        3 + col,
        rowNum,
        false
      );
    }
  }

  const shiftButton = addButton(
    'FN',
    () => {
      setShiftLatched(!shiftLatched);
    },
    'keycap-light',
    1,
    4,
    true
  );

  return {
    sendKey,
    setShiftLatched,
    getShiftLatched: () => shiftLatched,
    shiftButton,
    setSysCtrlValue: (value: number) => {
      sysCtrlValue = value;
    },
    getSysCtrlValue: () => sysCtrlValue,
    updateSysCtrl,
    updateStatusLeds,
  };
}

export { TEC1G_KEY_MAP, TEC1G_SHIFT_BIT };
