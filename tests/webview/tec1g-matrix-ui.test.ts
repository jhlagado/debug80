/**
 * @file Regression tests: TEC-1G matrix UI contract.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createMatrixUiController } from '../../webview/tec1g/matrix-ui';

const HTML_PATH = path.resolve(__dirname, '../../webview/tec1g/index.html');

type PostedMessage = Record<string, unknown>;

function buildDom(): Document {
  const html = fs.readFileSync(HTML_PATH, 'utf8').replace(/\{\{\w+\}\}/g, '');
  document.documentElement.innerHTML = html;
  return document;
}

function createVscodeMock(messages: PostedMessage[]) {
  return {
    postMessage: (message: PostedMessage) => {
      messages.push(message);
    },
  };
}

function createController(messages: PostedMessage[]) {
  const controller = createMatrixUiController(createVscodeMock(messages), () => true);
  controller.init();
  return controller;
}

function makeKeyEvent(
  type: 'keydown' | 'keyup',
  key: string,
  options?: { repeat?: boolean }
): KeyboardEvent {
  return new KeyboardEvent(type, {
    bubbles: true,
    cancelable: true,
    key,
    repeat: options?.repeat ?? false,
  });
}

function setEventTarget<T extends Event>(event: T, target: EventTarget): T {
  Object.defineProperty(event, 'target', {
    configurable: true,
    value: target,
  });
  return event;
}

describe('tec1g matrix ui', () => {
  let messages: PostedMessage[];
  let controller: ReturnType<typeof createMatrixUiController>;

  beforeEach(() => {
    buildDom();
    messages = [];
    controller = createController(messages);
  });

  afterEach(() => {
    document.documentElement.innerHTML = '';
  });

  it('applies caps lock state to the DOM', () => {
    const capsKey = document.querySelector('[data-key="CapsLock"]') as HTMLElement;
    const shiftKeys = Array.from(document.querySelectorAll<HTMLElement>('[data-key="Shift"]'));

    controller.applyMatrixMode(true);
    controller.applyCapsLock(true);

    expect(capsKey.classList.contains('active')).toBe(true);
    expect(shiftKeys.every((key) => key.classList.contains('active'))).toBe(true);
  });

  it('renders matrix brightness as a fading display level', () => {
    const firstDot = document.querySelector('.matrix-dot') as HTMLElement;

    controller.applyMatrixRows([0x01]);
    controller.applyMatrixBrightness([255, 0, 0, 0, 0, 0, 0, 0]);

    expect(firstDot.classList.contains('on')).toBe(true);
    expect(firstDot.style.getPropertyValue('--matrix-level')).toBe('1.000');
    expect(firstDot.style.getPropertyValue('--matrix-r')).toBe('1.000');
    expect(firstDot.style.getPropertyValue('--matrix-g')).toBe('0.000');
    expect(firstDot.style.getPropertyValue('--matrix-b')).toBe('0.000');

    controller.applyMatrixBrightness(Array.from({ length: 64 }, () => 0));

    expect(firstDot.classList.contains('on')).toBe(false);
    expect(firstDot.style.getPropertyValue('--matrix-level')).toBe('0.000');
  });

  it('boosts scanned duty brightness for visible LED intensity', () => {
    const firstDot = document.querySelector('.matrix-dot') as HTMLElement;

    controller.applyMatrixBrightness([32]);

    expect(firstDot.classList.contains('on')).toBe(true);
    expect(firstDot.style.getPropertyValue('--matrix-level')).toBe('0.788');
    expect(firstDot.style.getPropertyValue('--matrix-r')).toBe('0.788');
  });

  it('falls back to latch rows before brightness data arrives', () => {
    const dots = document.querySelectorAll('.matrix-dot');
    const firstDot = dots[0] as HTMLElement;
    const lastDotInFirstRow = dots[7] as HTMLElement;

    controller.applyMatrixRows([0x01]);

    expect(firstDot.classList.contains('on')).toBe(false);
    expect(firstDot.style.getPropertyValue('--matrix-level')).toBe('0.000');
    expect(lastDotInFirstRow.classList.contains('on')).toBe(true);
    expect(lastDotInFirstRow.style.getPropertyValue('--matrix-level')).toBe('1.000');
    expect(lastDotInFirstRow.style.getPropertyValue('--matrix-r')).toBe('1.000');
  });

  it('preserves omitted brightness planes on partial RGB updates', () => {
    const firstDot = document.querySelector('.matrix-dot') as HTMLElement;

    controller.applyMatrixBrightness([0], [255], [0]);
    expect(firstDot.style.getPropertyValue('--matrix-g')).toBe('1.000');

    controller.applyMatrixBrightness([255]);

    expect(firstDot.style.getPropertyValue('--matrix-r')).toBe('1.000');
    expect(firstDot.style.getPropertyValue('--matrix-g')).toBe('1.000');
    expect(firstDot.style.getPropertyValue('--matrix-b')).toBe('0.000');
  });

  it('tracks modifier state when clicking matrix keys', () => {
    controller.applyMatrixMode(true);
    const shiftKeys = Array.from(document.querySelectorAll<HTMLElement>('[data-key="Shift"]'));
    const matrixShift = shiftKeys[0];
    const matrixKey = document.querySelector('[data-key="a"]') as HTMLElement;

    matrixShift.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    matrixKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    matrixKey.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    expect(shiftKeys.some((key) => key.classList.contains('active'))).toBe(false);
    expect(matrixKey.classList.contains('pressed')).toBe(false);
    expect(messages).toContainEqual({
      type: 'matrixKey',
      key: 'a',
      pressed: true,
      shift: true,
      ctrl: false,
      fn: false,
      alt: false,
    });
    expect(messages).toContainEqual({
      type: 'matrixKey',
      key: 'a',
      pressed: false,
      shift: true,
      ctrl: false,
      fn: false,
      alt: false,
    });
  });

  it('treats the right-side S key as a compact shift key', () => {
    controller.applyMatrixMode(true);
    const shiftKeys = Array.from(document.querySelectorAll<HTMLElement>('[data-key="Shift"]'));
    const rightShift = shiftKeys[shiftKeys.length - 1];
    const matrixKey = document.querySelector('[data-key="a"]') as HTMLElement;

    expect(rightShift.textContent).toBe('SHIFT');
    expect(rightShift.querySelector('.matrix-key-sub-label')?.textContent).toBe('SHIFT');

    rightShift.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    matrixKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    matrixKey.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    expect(messages).toContainEqual({
      type: 'matrixKey',
      key: 'a',
      pressed: true,
      shift: true,
      ctrl: false,
      fn: false,
      alt: false,
    });
  });

  it('keeps fn and alt click modifiers distinct', () => {
    controller.applyMatrixMode(true);
    const fnKey = document.querySelector('[data-key="Fn"]') as HTMLElement;
    const altKeys = Array.from(document.querySelectorAll<HTMLElement>('[data-key="Alt"]'));
    const matrixKey = document.querySelector('[data-key="a"]') as HTMLElement;

    fnKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    matrixKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    matrixKey.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    altKeys[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(altKeys.every((key) => key.classList.contains('active'))).toBe(true);
    matrixKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    matrixKey.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    expect(altKeys.some((key) => key.classList.contains('active'))).toBe(false);

    expect(messages).toContainEqual({
      type: 'matrixKey',
      key: 'a',
      pressed: true,
      shift: false,
      ctrl: false,
      fn: true,
      alt: false,
    });
    expect(messages).toContainEqual({
      type: 'matrixKey',
      key: 'a',
      pressed: true,
      shift: false,
      ctrl: false,
      fn: false,
      alt: true,
    });
  });

  it('uses caps lock as a persistent letter shift and lights the shift keys', () => {
    controller.applyMatrixMode(true);
    const capsKey = document.querySelector('[data-key="CapsLock"]') as HTMLElement;
    const matrixKey = document.querySelector('[data-key="a"]') as HTMLElement;
    const shiftKeys = Array.from(document.querySelectorAll<HTMLElement>('[data-key="Shift"]'));

    capsKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    capsKey.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    matrixKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    matrixKey.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    expect(messages).toContainEqual({
      type: 'matrixKey',
      key: 'CapsLock',
      pressed: true,
      shift: false,
      ctrl: false,
      fn: false,
      alt: false,
    });
    expect(messages).toContainEqual({
      type: 'matrixKey',
      key: 'CapsLock',
      pressed: false,
      shift: false,
      ctrl: false,
      fn: false,
      alt: false,
    });
    expect(messages).toContainEqual({
      type: 'matrixKey',
      key: 'a',
      pressed: true,
      shift: true,
      ctrl: false,
      fn: false,
      alt: false,
    });
    expect(shiftKeys.every((key) => key.classList.contains('active'))).toBe(true);
    expect(capsKey.classList.contains('active')).toBe(true);
  });

  it('applies caps lock to physical letter keys while matrix mode is active', () => {
    controller.applyMatrixMode(true);

    controller.handleKeyEvent(makeKeyEvent('keydown', 'CapsLock'), true);
    controller.handleKeyEvent(makeKeyEvent('keyup', 'CapsLock'), false);
    controller.handleKeyEvent(makeKeyEvent('keydown', 'a'), true);

    expect(messages).toContainEqual({
      type: 'matrixKey',
      key: 'a',
      pressed: true,
      shift: true,
      ctrl: false,
      fn: false,
      alt: false,
    });
  });

  it('lights duplicate modifier keys together and clears one-shot modifiers after a key', () => {
    controller.applyMatrixMode(true);
    const leftShift = document.querySelector<HTMLElement>('[data-key="Shift"]') as HTMLElement;
    const shiftKeys = Array.from(document.querySelectorAll<HTMLElement>('[data-key="Shift"]'));
    const altKeys = Array.from(document.querySelectorAll<HTMLElement>('[data-key="Alt"]'));
    const matrixKey = document.querySelector('[data-key="a"]') as HTMLElement;

    leftShift.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(shiftKeys.every((key) => key.classList.contains('active'))).toBe(true);

    matrixKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    matrixKey.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    expect(shiftKeys.some((key) => key.classList.contains('active'))).toBe(false);

    altKeys[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(altKeys.every((key) => key.classList.contains('active'))).toBe(true);
  });

  it('ignores key events from inputs, repeated presses, and inactive matrix mode', () => {
    controller.applyMatrixMode(true);
    const input = document.getElementById('serialInput') as HTMLInputElement;
    const inputEvent = setEventTarget(makeKeyEvent('keydown', 'a'), input);
    const repeatEvent = makeKeyEvent('keydown', 'a', { repeat: true });
    const inactiveController = createMatrixUiController(createVscodeMock([]), () => true);
    const inactiveEvent = makeKeyEvent('keydown', 'a');

    expect(controller.handleKeyEvent(inputEvent, true)).toBe(false);
    expect(controller.handleKeyEvent(repeatEvent, true)).toBe(true);
    expect(inactiveController.handleKeyEvent(inactiveEvent, true)).toBe(false);
    expect(messages).toHaveLength(0);
  });

  it('sends key press and release messages once per event', () => {
    controller.applyMatrixMode(true);
    const keydown = makeKeyEvent('keydown', 'a');
    const keyup = makeKeyEvent('keyup', 'a');

    expect(controller.handleKeyEvent(keydown, true)).toBe(true);
    expect(controller.handleKeyEvent(keyup, false)).toBe(true);
    expect(messages).toEqual([
      {
        type: 'matrixKey',
        key: 'a',
        pressed: true,
        shift: false,
        ctrl: false,
        fn: false,
        alt: false,
      },
      {
        type: 'matrixKey',
        key: 'a',
        pressed: false,
        shift: false,
        ctrl: false,
        fn: false,
        alt: false,
      },
    ]);
  });

  it('only routes physical keys while the matrix keyboard panel is active', () => {
    let panelActive = false;
    const gatedController = createMatrixUiController(createVscodeMock(messages), () => panelActive);
    gatedController.init();
    gatedController.applyMatrixMode(true);

    expect(gatedController.handleKeyEvent(makeKeyEvent('keydown', 'b'), true)).toBe(false);

    panelActive = true;
    expect(gatedController.handleKeyEvent(makeKeyEvent('keydown', 'b'), true)).toBe(true);

    expect(messages).toContainEqual({
      type: 'matrixKey',
      key: 'b',
      pressed: true,
      shift: false,
      ctrl: false,
      fn: false,
      alt: false,
    });
  });
});
