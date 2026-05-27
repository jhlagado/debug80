/**
 * @file Regression test: permanent TEC-1G peripheral layout.
 *
 * Validates that:
 * 1. All TEC-1G hardware/peripheral panels are rendered directly.
 * 2. The legacy checkbox-driven visibility mechanism is absent.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const HTML_PATH = path.resolve(__dirname, '../../webview/tec1g/index.html');
const CSS_PATH = path.resolve(__dirname, '../../webview/tec1g/styles.css');
const COMMON_CSS_PATH = path.resolve(__dirname, '../../webview/common/styles.css');

/**
 * Builds a minimal DOM from the real HTML template and injects the real CSS.
 * Template tokens ({{cspSource}}, etc.) are stripped since they aren't needed.
 */
function buildDom(): Document {
  const html = fs.readFileSync(HTML_PATH, 'utf8').replace(/\{\{\w+\}\}/g, '');
  const css = fs.readFileSync(CSS_PATH, 'utf8');
  document.documentElement.innerHTML = html.replace('</head>', `<style>${css}</style></head>`);
  return document;
}

describe('tec1g UI visibility controls', () => {
  let doc: Document;

  beforeEach(() => {
    doc = buildDom();
  });

  it('colors TEC-1G data digits green while the logical data pair renders on the right', () => {
    const css = fs.readFileSync(CSS_PATH, 'utf8');
    const commonCss = fs.readFileSync(COMMON_CSS_PATH, 'utf8');

    expect(commonCss).toContain('flex-direction: row-reverse');
    expect(css).toContain('.display .digit--data .seg');
    expect(css).toContain('.display .digit--data .seg.on');
    expect(css).toContain('#35ff8f');
  });

  it('splits the TEC-1G hardware and displays into separate accordion panels', () => {
    const panelUi = doc.querySelector('#panel-ui');
    const projectContent = doc.querySelector('#accordion-project');
    const frame = doc.querySelector('#panel-ui > .tec1g-ui-frame');
    const layout = doc.querySelector('#panel-ui .tec1g-layout');
    const displaysContent = doc.querySelector('#accordion-displays');
    const serialContent = doc.querySelector('#accordion-serial');
    const matrixKeyboardContent = doc.querySelector('#accordion-matrix-keyboard');
    const glcdStack = doc.querySelector('.glcd-stack');
    const status = doc.querySelector('.status');
    const hardwareGrid = doc.querySelector('.hardware-grid');
    const displayCol = doc.querySelector('.hardware-display-col');
    const keypadCol = doc.querySelector('.hardware-keypad-col');
    const peripheralGrid = doc.querySelector('.peripheral-grid');

    expect(projectContent?.querySelector('#projectHeader')).toBe(doc.querySelector('#projectHeader'));
    expect(projectContent?.querySelector('#setupCard')).toBe(doc.querySelector('#setupCard'));
    expect(projectContent?.querySelector('.debug80-toolbar')).toBe(
      doc.querySelector('.debug80-toolbar')
    );
    expect(panelUi?.firstElementChild).toBe(frame);
    expect(frame?.children[0]).toBe(layout);
    expect(frame?.children.length).toBe(1);
    expect(layout).not.toBeNull();
    expect(layout?.firstElementChild).toBe(hardwareGrid);
    expect(displaysContent?.querySelector('.peripheral-grid')).toBe(peripheralGrid);
    expect(peripheralGrid?.children[0]).toBe(glcdStack);
    expect(peripheralGrid?.children[1]).toBe(doc.querySelector('.matrix'));
    expect(glcdStack?.children[0]).toBe(status);
    expect(glcdStack?.children[1]).toBe(doc.querySelector('.glcd'));
    expect(hardwareGrid?.children[0]).toBe(displayCol);
    expect(hardwareGrid?.children[1]).toBe(keypadCol);
    expect(displayCol?.querySelector('.lcd')).not.toBeNull();
    expect(displayCol?.querySelector('.display-block')).not.toBeNull();
    expect(status?.querySelector('#statusLeds')).not.toBeNull();
    expect(keypadCol?.querySelector('#keypad.keypad')).not.toBeNull();
    expect(peripheralGrid?.querySelector('.glcd')).not.toBeNull();
    expect(peripheralGrid?.querySelector('.matrix')).not.toBeNull();
    expect(serialContent?.querySelector('.serial')).toBe(doc.querySelector('.serial'));
    expect(matrixKeyboardContent?.querySelector('.matrix-keyboard')).toBe(
      doc.querySelector('.matrix-keyboard')
    );
    expect(
      doc.querySelector<HTMLButtonElement>('[data-accordion-toggle="displays"]')?.textContent
    ).toBe('Displays');
    expect(
      doc.querySelector<HTMLButtonElement>('[data-accordion-toggle="serial"]')?.textContent
    ).toBe('Serial');
    expect(
      doc.querySelector<HTMLButtonElement>('[data-accordion-toggle="matrixKeyboard"]')
        ?.textContent
    ).toBe('Matrix Keyboard');
    expect(
      Array.from(doc.querySelectorAll<HTMLButtonElement>('[data-accordion-toggle]')).map(
        (button) => button.dataset.accordionToggle
      )
    ).toEqual(['project', 'displays', 'machine', 'registers', 'memory', 'serial', 'matrixKeyboard']);

    const css = fs.readFileSync(CSS_PATH, 'utf8');
    expect(css).toContain('.tec1g-ui-frame');
    expect(css).toContain('--tec1g-panel-width');
    expect(css).toContain('width: var(--tec1g-panel-width)');
    expect(css).toContain('.panel-displays');
    expect(css).toContain('.panel-serial');
    expect(css).toContain('.panel-matrix-keyboard');
    expect(css).toContain('.panel-serial .serial');
    expect(css).toContain('.panel-matrix-keyboard .matrix-keyboard');
    expect(css).toContain('align-items: end');
    expect(css).toContain('.glcd-stack');
    expect(css).toContain('.hardware-grid');
    expect(css).toContain('display: inline-flex');
    expect(css).toContain('justify-content: flex-start');
    expect(css).toContain('align-self: flex-end');
    expect(css).toContain('width: max-content');
    expect(css).toContain('.hardware-keypad-col');
    expect(css).toContain('--tec1g-display-stack-width: 320px');
    expect(css).toContain('--tec1g-keypad-content-width');
    expect(css).toContain('.hardware-display-col .lcd-canvas');
    expect(css).toContain('width: 90%');
    expect(css).toContain('height: 70px');
    expect(css).toContain('margin: 0 auto');
    expect(css).toContain('.hardware-display-col .digit svg');
    expect(css).toContain('width: 40px');
    expect(css).toContain('height: 66px');
    expect(css).toContain('.hardware-display-col .digit--data + .digit--data');
    expect(css).toContain('margin-left: 1rem');
    expect(css).toContain('grid-template-columns: repeat(6, 46px)');
    expect(css).toContain('grid-template-rows: repeat(4, 46px)');
    expect(css).toContain('--tec1g-glcd-panel-width: 346px');
    expect(css).toContain('width: var(--tec1g-glcd-panel-width)');
    expect(css).toContain('max-width: var(--tec1g-glcd-panel-width)');
    expect(css).toContain('flex-wrap: nowrap');
    expect(css).toContain('flex: 0 0 auto');
  });

  it('keeps AZM experiment controls on the project restart row', () => {
    expect(doc.querySelector('#accordion-project .azm-option-row')).not.toBeNull();
    expect(
      Array.from(doc.querySelectorAll<HTMLOptionElement>('#azmRegisterCareMode option')).map(
        (option) => option.value
      )
    ).toEqual(['enforce', 'audit', 'off']);
    expect(
      Array.from(doc.querySelectorAll<HTMLOptionElement>('#azmContractUpdateMode option')).map(
        (option) => option.value
      )
    ).toEqual(['ask', 'auto', 'never']);
    expect(doc.querySelector('#accordion-project #restartDebug')).not.toBeNull();
  });

  it('labels all eight status lamps including the Memory Expansion bank bits', () => {
    expect(doc.querySelector('.status-bank-title')?.textContent).toBe('Memory Expansion');
    expect(doc.querySelector('.status-bank-panel')?.getAttribute('aria-label')).toBe(
      'Memory Expansion'
    );
    expect(
      Array.from(doc.querySelectorAll('.status-leds .status-led-label')).map((node) =>
        node.textContent?.trim()
      )
    ).toEqual(['SHADOW', 'PROTECT', 'EXPAND', 'CAPS']);
    expect(
      Array.from(doc.querySelectorAll('.status-leds .status-led')).map((node) =>
        node.getAttribute('aria-label')
      )
    ).toEqual(['Shadow', 'Protect', 'Expand', 'Caps']);
    expect(
      Array.from(doc.querySelectorAll('.status-leds .status-led')).map(
        (node) => node.firstElementChild?.className
      )
    ).toEqual([
      'status-led-light',
      'status-led-light',
      'status-led-light',
      'status-led-light',
    ]);
    expect(
      Array.from(doc.querySelectorAll('.status-bank-leds .status-led-label')).map((node) =>
        node.textContent?.trim()
      )
    ).toEqual(['3', '2', '1', '0']);
    expect(doc.querySelector('#statusBank3')).not.toBeNull();
    expect(doc.querySelector('#statusBank2')).not.toBeNull();
    expect(doc.querySelector('#statusBank1')).not.toBeNull();
    expect(doc.querySelector('#statusBank0')).not.toBeNull();

    const css = fs.readFileSync(CSS_PATH, 'utf8');
    expect(css).toContain('height: 97px');
    expect(css).toContain('justify-content: center');
    expect(css).toContain('flex-direction: row');
  });

  it('renders all TEC-1G peripherals permanently without visibility controls or section flags', () => {
    expect(doc.querySelector('#uiControls')).toBeNull();
    expect(doc.querySelector('input[type="checkbox"][data-section]')).toBeNull();
    expect(doc.querySelector('.ui-section')).toBeNull();
    expect(doc.querySelector('[data-section]')).toBeNull();

    expect(doc.querySelector('.glcd')).not.toBeNull();
    expect(doc.querySelector('.matrix')).not.toBeNull();
    expect(doc.querySelector('.lcd')).not.toBeNull();
    expect(doc.querySelector('.display-block')).not.toBeNull();
    expect(doc.querySelector('.keypad')).not.toBeNull();
    expect(doc.querySelector('.serial')).not.toBeNull();
    expect(doc.querySelector('.matrix-keyboard')).not.toBeNull();
  });
});
