import { describe, expect, it } from 'vitest';
import { createTecKeypad } from '../../webview/common/tec-keypad';

function makeStatusElement(id: string): HTMLElement {
  const element = document.createElement('span');
  element.id = id;
  return element;
}

function makeKeypad() {
  document.body.innerHTML = '';
  const keypadEl = document.createElement('div');
  document.body.appendChild(keypadEl);
  const statusShadow = makeStatusElement('statusShadow');
  const statusProtect = makeStatusElement('statusProtect');
  const statusExpand = makeStatusElement('statusExpand');
  const statusCaps = makeStatusElement('statusCaps');
  const statusBank0 = makeStatusElement('statusBank0');
  const statusBank1 = makeStatusElement('statusBank1');
  const statusBank2 = makeStatusElement('statusBank2');
  const statusBank3 = makeStatusElement('statusBank3');

  const keypad = createTecKeypad(
    { postMessage: () => undefined },
    keypadEl,
    {
      statusEls: {
        statusShadow,
        statusProtect,
        statusExpand,
        statusCaps,
        statusBank0,
        statusBank1,
        statusBank2,
        statusBank3,
      },
    }
  );

  return {
    keypad,
    statusCaps,
    statusBank0,
    statusBank1,
    statusBank2,
    statusBank3,
  };
}

describe('TEC-1G SYS_CTRL status lamps', () => {
  it('uses bit 7 for caps lock and bits 3-6 for memory expansion bank lamps', () => {
    const { keypad, statusCaps, statusBank0, statusBank1, statusBank2, statusBank3 } = makeKeypad();

    keypad.setSysCtrlValue(0x20);
    keypad.updateStatusLeds();

    expect(statusCaps.classList.contains('on')).toBe(false);
    expect(statusBank0.classList.contains('on')).toBe(false);
    expect(statusBank1.classList.contains('on')).toBe(false);
    expect(statusBank2.classList.contains('on')).toBe(true);
    expect(statusBank3.classList.contains('on')).toBe(false);

    keypad.setSysCtrlValue(0x80);
    keypad.updateStatusLeds();

    expect(statusCaps.classList.contains('on')).toBe(true);
    expect(statusBank0.classList.contains('on')).toBe(false);
    expect(statusBank1.classList.contains('on')).toBe(false);
    expect(statusBank2.classList.contains('on')).toBe(false);
    expect(statusBank3.classList.contains('on')).toBe(false);
  });
});
