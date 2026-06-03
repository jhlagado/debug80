export type MatrixRoutingCueElements = {
  appRoot: HTMLElement | null;
  keypad: HTMLElement | null;
  cue: HTMLElement | null;
  header: HTMLElement | null;
};

const KEYPAD_ROUTED_CLASS = 'keypad--keyboard-routed-to-matrix';
const HEADER_ACTIVE_CLASS = 'matrix-keyboard-active';

export function applyMatrixRoutingCue(elements: MatrixRoutingCueElements, active: boolean): void {
  const activeValue = active ? 'true' : 'false';
  document.body.dataset.matrixKeyboardActive = activeValue;
  elements.appRoot?.setAttribute('data-matrix-keyboard-active', activeValue);
  elements.keypad?.classList.toggle(KEYPAD_ROUTED_CLASS, active);
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
