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
const SOURCE_PATH = path.resolve(__dirname, '../../webview/tec1g/index.ts');
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

function cssBlock(source: string, marker: string, occurrence = 0): string {
  let markerIndex = -1;
  for (let index = 0; index <= occurrence; index += 1) {
    markerIndex = source.indexOf(marker, markerIndex + 1);
  }
  const openBrace = source.indexOf('{', markerIndex);
  expect(markerIndex).toBeGreaterThanOrEqual(0);
  expect(openBrace).toBeGreaterThan(markerIndex);
  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    if (source[index] === '{') {
      depth += 1;
    } else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openBrace + 1, index);
      }
    }
  }
  throw new Error(`Unclosed CSS block: ${marker}`);
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

  it('stacks machine and peripheral displays only at a genuinely narrow width', () => {
    const css = fs.readFileSync(CSS_PATH, 'utf8');
    const stackedLayout = cssBlock(css, '@container (max-width: 520px)');
    const narrowLayout = cssBlock(css, '@container (max-width: 410px)');
    const stackedHardwareGrid = cssBlock(stackedLayout, '.panel-ui .hardware-grid', 1);
    const stackedKeypadColumn = cssBlock(stackedLayout, '.panel-ui .hardware-keypad-col');
    const stackedPeripheralGrid = cssBlock(stackedLayout, '.panel-displays .peripheral-grid', 1);
    const stackedGlcd = cssBlock(stackedLayout, '.panel-displays .glcd-stack');
    const stackedMatrix = cssBlock(stackedLayout, '.panel-displays .matrix');
    const narrowKeypadColumn = cssBlock(narrowLayout, '.panel-ui .hardware-keypad-col');
    const narrowKeypad = cssBlock(narrowLayout, '.panel-ui .hardware-keypad-col .keypad');
    const narrowKeycap = cssBlock(narrowLayout, '.panel-ui .hardware-keypad-col .keycap');
    const narrowSysCtrlSegment = cssBlock(
      narrowLayout,
      '.panel-ui .hardware-keypad-col .sysctrl-seg'
    );

    expect(stackedHardwareGrid).toContain('flex-direction: column');
    expect(stackedHardwareGrid).toContain('align-self: stretch');
    expect(stackedKeypadColumn).toContain('max-width: 100%');
    expect(stackedPeripheralGrid).toContain('flex-direction: column');
    expect(stackedPeripheralGrid).toContain('align-items: center');
    expect(stackedGlcd).toContain('width: min(var(--tec1g-glcd-panel-width), 100%)');
    expect(stackedMatrix).toContain('width: min(var(--tec1g-matrix-panel-width), 100%)');
    expect(narrowKeypadColumn).toContain('width: min(302px, 100%)');
    expect(narrowKeypad).toContain('grid-template-columns: repeat(6, minmax(0, 42px))');
    expect(narrowKeypad).toContain('box-sizing: border-box');
    expect(narrowKeycap).toContain('aspect-ratio: 1');
    expect(narrowSysCtrlSegment).toContain('height: clamp(3px, 1.5cqw, 8px)');
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
    const keypadRoutingCue = doc.querySelector('#keypadRoutingCue');
    const peripheralGrid = doc.querySelector('.peripheral-grid');

    expect(projectContent?.querySelector('#projectHeader')).toBe(
      doc.querySelector('#projectHeader')
    );
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
    expect(keypadCol?.querySelector('#keypadRoutingCue')).toBe(keypadRoutingCue);
    expect(keypadRoutingCue?.textContent).toContain('PC keys: Matrix Keyboard');
    expect(keypadRoutingCue?.textContent).toContain('Hex keypad disabled; RESET active');
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
    expect(matrixKeyboardContent?.querySelector('#matrixConfigSwitch')).toBeNull();
    expect(matrixKeyboardContent?.textContent).not.toContain('MON-3 Matrix');
    expect(
      doc
        .querySelector<HTMLButtonElement>('[data-accordion-toggle="displays"]')
        ?.textContent?.trim()
    ).toBe('Displays');
    expect(
      doc.querySelector<HTMLButtonElement>('[data-accordion-toggle="serial"]')?.textContent?.trim()
    ).toBe('Serial');
    expect(
      doc
        .querySelector<HTMLButtonElement>('[data-accordion-toggle="matrixKeyboard"]')
        ?.textContent?.trim()
    ).toBe('Matrix Keyboard');
    expect(
      Array.from(doc.querySelectorAll<HTMLButtonElement>('[data-accordion-toggle]')).map(
        (button) => button.dataset.accordionToggle
      )
    ).toEqual([
      'project',
      'machine',
      'displays',
      'video',
      'joystick',
      'matrixKeyboard',
      'registers',
      'memory',
      'serial',
    ]);

    const css = fs.readFileSync(CSS_PATH, 'utf8');
    expect(css).toContain('.tec1g-ui-frame');
    expect(css).toContain('--tec1g-panel-width');
    expect(css).toContain('width: var(--tec1g-panel-width)');
    expect(css).toContain('.panel-displays');
    expect(css).toContain('.panel-video');
    expect(css).toContain('.panel-joystick');
    expect(css).toContain('.panel-serial');
    expect(css).toContain('.panel-matrix-keyboard');
    expect(css).toContain('justify-content: center');
    expect(css).toContain('gap: 96px');
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
    expect(css).toContain('.keypad-routing-cue');
    expect(css).toContain('.keypad--matrix-attached-disabled');
    expect(css).toContain('.keycap-reset');
    expect(css).toContain('.keycap:not(.keycap-reset)');
    expect(css).toContain('.matrix-keyboard-active');
    expect(css).toContain('.matrix-keyboard-captured');
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
    expect(css).toContain('--tec1g-glcd-panel-width: 410px');
    expect(css).toContain('width: var(--tec1g-glcd-panel-width)');
    expect(css).toContain('max-width: var(--tec1g-glcd-panel-width)');
    expect(doc.querySelector('#glcdCanvas')?.getAttribute('width')).toBe('384');
    expect(doc.querySelector('#glcdCanvas')?.getAttribute('height')).toBe('192');
    expect(css).toContain('width: 384px');
    expect(css).toContain('height: 192px');
    expect(css).toContain('flex-wrap: nowrap');
    expect(css).toContain('flex: 0 0 auto');
  });

  it('keeps AZM experiment controls on the project restart row', () => {
    expect(doc.querySelector('#accordion-project .azm-option-row')).not.toBeNull();
    expect(
      Array.from(doc.querySelectorAll<HTMLOptionElement>('#azmRegisterContractsMode option')).map(
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

  it('uses Matrix Keyboard accordion visibility as the matrix attachment switch', () => {
    const source = fs.readFileSync(SOURCE_PATH, 'utf8');

    expect(doc.querySelector('#matrixConfigSwitch')).toBeNull();
    expect(source).not.toContain('matrixConfigSwitch');
    expect(source).toContain("vscode.postMessage({ type: 'matrixMode', enabled: open })");
    expect(source).toContain('function reassertMatrixKeyboardOpenState()');
    expect(source).toContain('function applyMatrixKeyboardCapture(captured: boolean)');
    expect(source).toContain('function releaseAllHardwareInputs(): void');
    expect(source).toContain("window.addEventListener('blur', releaseAllHardwareInputs)");
    expect(source).toContain("window.addEventListener('beforeunload', () => {");
    expect(source).toContain('releaseAllHardwareInputs()');
    expect(source).toContain('applyMatrixKeyboardCapture(false)');
    expect(source).toContain("message.status === 'running' || message.status === 'paused'");
    expect(source).toContain('if (message.matrixMode === false)');
  });

  it('routes physical keys through the explicit keyboard owner', () => {
    const source = fs.readFileSync(SOURCE_PATH, 'utf8');

    expect(source).toContain('createKeyboardOwnerController');
    expect(source).toContain('function syncKeyboardOwnerVisibility()');
    expect(source).toContain('function selectKeyboardOwner');
    expect(source).toContain("keyboardOwner.getOwner() === 'matrixKeyboard'");
    expect(source).toContain("keyboardOwner.getOwner() === 'joystick'");
    expect(source).toContain("keyboardOwner.getOwner() === 'keypad'");
    expect(source).toContain('releaseDepartedKeyboardOwner(previousOwner, owner');
    expect(source).toContain('shouldBypassEmulatorKeyboardTarget(event.target)');
    expect(source).toContain('shouldBypassEmulatorKeyboardTarget(target)');
    expect(source).toContain(
      'keypad: !accordionMachine.hidden && !panelLayout.isMatrixKeyboardOpen()'
    );
  });

  it('uses typed DOM boundary helpers in the TEC-1G composition root', () => {
    const source = fs.readFileSync(SOURCE_PATH, 'utf8');

    expect(source).toContain('getRequiredElementById');
    expect(source).toContain('getOptionalElementById');
    expect(source).toContain('getOptionalElementBySelector');
    expect(source).not.toContain("document.getElementById('display') as HTMLElement");
    expect(source).not.toContain("document.getElementById('accordion-machine') as HTMLElement");
    expect(source).not.toContain(
      "document.querySelector('.debug80-toolbar') as HTMLElement | null"
    );
  });

  it('keeps project-status message application behind a typed helper', () => {
    const source = fs.readFileSync(SOURCE_PATH, 'utf8');

    expect(source).toContain('type Tec1gProjectStatusMessage');
    expect(source).toContain(
      'function applyProjectStatusMessage(message: Tec1gProjectStatusMessage)'
    );
    expect(source).toContain('applyProjectStatusMessage(message);');
  });

  it('labels joystick auxiliary action as Aux instead of Comm2', () => {
    const joystick = doc.querySelector('#accordion-joystick');

    expect(joystick?.textContent).toContain('Aux');
    expect(joystick?.textContent).not.toContain('Comm2');
    expect(joystick?.querySelector('.joystick-aux')?.getAttribute('title')).toContain('Pin 9');
  });

  it('uses an arrow key mode switch instead of joystick latching', () => {
    const joystick = doc.querySelector('#accordion-joystick');

    expect(joystick?.textContent).toContain('Arrow Keys');
    expect(joystick?.textContent).toContain('Move');
    expect(joystick?.textContent).toContain('Fire');
    expect(joystick?.textContent).not.toContain('Latch');
    expect(joystick?.querySelector('#joystickLatch')).toBeNull();
    expect(joystick?.querySelector('[data-joystick-arrow-mode="move"]')).not.toBeNull();
    expect(joystick?.querySelector('[data-joystick-arrow-mode="fire"]')).not.toBeNull();
  });

  it('labels joystick action keys as a right-hand inverted T', () => {
    const joystick = doc.querySelector('#accordion-joystick');

    expect(joystick?.textContent).toContain('J or Space Fire 1');
    expect(joystick?.textContent).toContain('I Fire 2');
    expect(joystick?.textContent).toContain('K Aux');
    expect(joystick?.textContent).toContain('L Fire 3');
    expect(joystick?.textContent).not.toContain('M Aux');
    expect(joystick?.querySelector('.joystick-fire3')?.getAttribute('title')).toContain('L');
    expect(joystick?.querySelector('.joystick-aux')?.getAttribute('title')).toContain('K');
  });

  it('opens the TMS9918 panel when the selected target asks for it', () => {
    const source = fs.readFileSync(SOURCE_PATH, 'utf8');

    expect(source).toContain('message.targetUiVisibility?.tms9918 === true');
    expect(source).toContain("panelLayout.setPanelOpen('video', true, true)");
  });

  it('labels all eight status lamps including the memory bank bits', () => {
    expect(doc.querySelector('.status-bank-title')).toBeNull();
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
    ).toEqual(['status-led-light', 'status-led-light', 'status-led-light', 'status-led-light']);
    expect(
      Array.from(doc.querySelectorAll('.status-bank-leds .status-led-label')).map((node) =>
        node.textContent?.trim()
      )
    ).toEqual(['MEM 3', 'MEM 2', 'MEM 1', 'MEM 0']);
    expect(
      Array.from(doc.querySelectorAll('.status-bank-leds .status-led')).map((node) =>
        node.getAttribute('aria-label')
      )
    ).toEqual(['Memory bank bit 3', 'Memory bank bit 2', 'Memory bank bit 1', 'Memory bank bit 0']);
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
