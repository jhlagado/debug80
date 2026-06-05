export type MatrixRoutingCueElements = {
  appRoot: HTMLElement | null;
  keypad: HTMLElement | null;
  cue: HTMLElement | null;
  header: HTMLElement | null;
};

const KEYPAD_DISABLED_CLASS = 'keypad--matrix-attached-disabled';
const HEADER_ACTIVE_CLASS = 'matrix-keyboard-active';

export function applyMatrixRoutingCue(elements: MatrixRoutingCueElements, active: boolean): void {
  const activeValue = active ? 'true' : 'false';
  document.body.dataset.matrixKeyboardActive = activeValue;
  elements.appRoot?.setAttribute('data-matrix-keyboard-active', activeValue);
  elements.keypad?.classList.toggle(KEYPAD_DISABLED_CLASS, active);
  if (active) {
    elements.keypad?.setAttribute('data-scanned-keys-disabled', 'true');
  } else {
    elements.keypad?.removeAttribute('data-scanned-keys-disabled');
  }
  elements.header?.classList.toggle(HEADER_ACTIVE_CLASS, active);

  if (elements.cue) {
    elements.cue.hidden = !active;
  }

  if (active && elements.cue?.id) {
    elements.keypad?.setAttribute('aria-describedby', elements.cue.id);
    return;
  }
  elements.keypad?.removeAttribute('aria-describedby');
}
