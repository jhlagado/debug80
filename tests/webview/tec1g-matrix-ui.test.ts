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

  it('applies matrix mode and caps lock state to the DOM', () => {
    const matrixModeToggle = document.getElementById('matrixModeToggle') as HTMLElement;
    const matrixModeStatus = document.getElementById('matrixModeStatus') as HTMLElement;
    const matrixCapsStatus = document.getElementById('matrixCapsStatus') as HTMLElement;

    controller.applyMatrixMode(true);
    controller.applyCapsLock(true);

    expect(matrixModeToggle.classList.contains('active')).toBe(true);
    expect(matrixModeStatus.textContent).toBe('ON');
    expect(matrixModeStatus.classList.contains('on')).toBe(true);
    expect(matrixCapsStatus.classList.contains('on')).toBe(true);
  });

  it('renders matrix brightness as a fading display level', () => {
    const firstDot = document.querySelector('.matrix-dot') as HTMLElement;

    controller.applyMatrixRows([0x01]);
    controller.applyMatrixBrightness([255, 0, 0, 0, 0, 0, 0, 0]);

    expect(firstDot.classList.contains('on')).toBe(true);
    expect(firstDot.style.getPropertyValue('--matrix-level')).toBe('1.000');

    controller.applyMatrixBrightness(Array.from({ length: 64 }, () => 0));

    expect(firstDot.classList.contains('on')).toBe(false);
    expect(firstDot.style.getPropertyValue('--matrix-level')).toBe('0.000');
  });

  it('falls back to latch rows before brightness data arrives', () => {
    const firstDot = document.querySelector('.matrix-dot') as HTMLElement;

    controller.applyMatrixRows([0x01]);

    expect(firstDot.classList.contains('on')).toBe(true);
    expect(firstDot.style.getPropertyValue('--matrix-level')).toBe('1.000');
  });

  it('tracks modifier state when clicking matrix keys', () => {
    controller.applyMatrixMode(true);
    const matrixShift = document.getElementById('matrixShift') as HTMLElement;
    const matrixKey = document.querySelector('[data-key="a"]') as HTMLElement;

    matrixShift.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    matrixKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    matrixKey.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    expect(matrixShift.classList.contains('active')).toBe(true);
    expect(matrixKey.classList.contains('pressed')).toBe(false);
    expect(messages).toContainEqual({
      type: 'matrixKey',
      key: 'a',
      pressed: true,
      shift: true,
      ctrl: false,
      alt: false,
    });
    expect(messages).toContainEqual({
      type: 'matrixKey',
      key: 'a',
      pressed: false,
      shift: true,
      ctrl: false,
      alt: false,
    });
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
        alt: false,
      },
      {
        type: 'matrixKey',
        key: 'a',
        pressed: false,
        shift: false,
        ctrl: false,
        alt: false,
      },
    ]);
  });
});
