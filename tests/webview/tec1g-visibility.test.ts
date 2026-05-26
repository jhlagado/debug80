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

  it('places the status strip directly above the GLCD with the RGB matrix beside them', () => {
    const layout = doc.querySelector('.tec1g-layout');
    const glcdStack = doc.querySelector('.glcd-stack');
    const status = doc.querySelector('.status');
    const hardwareGrid = doc.querySelector('.hardware-grid');
    const displayCol = doc.querySelector('.hardware-display-col');
    const keypadCol = doc.querySelector('.hardware-keypad-col');
    const peripheralGrid = doc.querySelector('.peripheral-grid');

    expect(layout).not.toBeNull();
    expect(layout?.firstElementChild).toBe(peripheralGrid);
    expect(layout?.children[1]).toBe(hardwareGrid);
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

    const css = fs.readFileSync(CSS_PATH, 'utf8');
    expect(css).toContain('align-items: end');
    expect(css).toContain('.glcd-stack');
    expect(css).toContain('.hardware-grid');
    expect(css).toContain('display: inline-flex');
    expect(css).toContain('justify-content: flex-start');
    expect(css).toContain('align-self: flex-end');
    expect(css).toContain('width: max-content');
    expect(css).toContain('.hardware-keypad-col');
    expect(css).toContain('--tec1g-display-stack-width: 290px');
    expect(css).toContain('--tec1g-glcd-panel-width: 346px');
    expect(css).toContain('width: var(--tec1g-glcd-panel-width)');
    expect(css).toContain('max-width: var(--tec1g-glcd-panel-width)');
    expect(css).toContain('flex: 1 1 100%');
  });

  it('labels all eight status lamps including the Memory Expansion Deck bank bits', () => {
    expect(doc.querySelector('.status-bank-title')?.textContent).toBe('Memory Expansion Deck');
    expect(
      Array.from(doc.querySelectorAll('.status-leds .status-led-label')).map((node) =>
        node.textContent?.trim()
      )
    ).toEqual(['SHADOW', 'PROTECT', 'EXPAND', 'CAPS']);
    expect(
      Array.from(doc.querySelectorAll('.status-bank-leds .status-led-label')).map((node) =>
        node.textContent?.trim()
      )
    ).toEqual(['3', '2', '1', '0']);
    expect(doc.querySelector('#statusBank3')).not.toBeNull();
    expect(doc.querySelector('#statusBank2')).not.toBeNull();
    expect(doc.querySelector('#statusBank1')).not.toBeNull();
    expect(doc.querySelector('#statusBank0')).not.toBeNull();
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
