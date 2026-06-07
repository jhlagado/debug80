export type MatrixRoutingCueElements = {
  appRoot: HTMLElement | null;
  keypad: HTMLElement | null;
  cue: HTMLElement | null;
  header: HTMLElement | null;
};

const KEYPAD_DISABLED_CLASS = 'keypad--matrix-attached-disabled';
const HEADER_ACTIVE_CLASS = 'matrix-keyboard-active';
const HEADER_CAPTURED_CLASS = 'matrix-keyboard-captured';

export function applyMatrixRoutingCue(
  elements: MatrixRoutingCueElements,
  active: boolean,
  captured = active
): void {
  const activeValue = active ? 'true' : 'false';
  const capturedValue = active && captured ? 'true' : 'false';
  document.body.dataset.matrixKeyboardActive = activeValue;
  document.body.dataset.matrixKeyboardCaptured = capturedValue;
  elements.appRoot?.setAttribute('data-matrix-keyboard-active', activeValue);
  elements.appRoot?.setAttribute('data-matrix-keyboard-captured', capturedValue);
  elements.keypad?.classList.toggle(KEYPAD_DISABLED_CLASS, active);
  if (active) {
    elements.keypad?.setAttribute('data-scanned-keys-disabled', 'true');
  } else {
    elements.keypad?.removeAttribute('data-scanned-keys-disabled');
  }
  elements.header?.classList.toggle(HEADER_ACTIVE_CLASS, active);
  elements.header?.classList.toggle(HEADER_CAPTURED_CLASS, active && captured);

  if (elements.cue) {
    elements.cue.hidden = !active;
    elements.cue.innerHTML = active
      ? captured
        ? '<span class="keypad-routing-dot" aria-hidden="true"></span><span>Keyboard captured</span><span class="keypad-routing-note">Esc releases</span>'
        : '<span class="keypad-routing-dot" aria-hidden="true"></span><span>Keyboard released</span><span class="keypad-routing-note">click emulator to capture</span>'
      : '';
  }

  if (active && elements.cue?.id) {
    elements.keypad?.setAttribute('aria-describedby', elements.cue.id);
    return;
  }
  elements.keypad?.removeAttribute('aria-describedby');
}
