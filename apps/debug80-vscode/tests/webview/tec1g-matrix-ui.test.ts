/**
 * @file Regression tests: TEC-1G matrix UI contract.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createMatrixUiController } from '../../webview/tec1g/matrix-ui';

const HTML_PATH = path.resolve(__dirname, '../../webview/tec1g/index.html');

type PostedMessage = Record<string, unknown>;
type FakeGradient = { stops: string[]; addColorStop: (offset: number, color: string) => void };
type FakeCanvasContext = {
  fillStyle: string | FakeGradient;
  globalAlpha: number;
  shadowColor: string;
  shadowBlur: number;
  fills: Array<{ stops: string[]; alpha: number; x: number; y: number }>;
  clearRect: ReturnType<typeof vi.fn>;
  beginPath: ReturnType<typeof vi.fn>;
  arc: ReturnType<typeof vi.fn>;
  fill: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  createRadialGradient: ReturnType<typeof vi.fn>;
};

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
  options?: {
    repeat?: boolean;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
    metaKey?: boolean;
    code?: string;
  }
): KeyboardEvent {
  return new KeyboardEvent(type, {
    bubbles: true,
    cancelable: true,
    key,
    repeat: options?.repeat ?? false,
    ctrlKey: options?.ctrlKey ?? false,
    shiftKey: options?.shiftKey ?? false,
    altKey: options?.altKey ?? false,
    metaKey: options?.metaKey ?? false,
    code: options?.code ?? '',
  });
}

function setEventTarget<T extends Event>(event: T, target: EventTarget): T {
  Object.defineProperty(event, 'target', {
    configurable: true,
    value: target,
  });
  return event;
}

function flushMatrixClickHold(): void {
  vi.advanceTimersByTime(90);
}

describe('tec1g matrix ui', () => {
  let messages: PostedMessage[];
  let controller: ReturnType<typeof createMatrixUiController>;
  let canvasContext: FakeCanvasContext;

  beforeEach(() => {
    vi.useFakeTimers();
    buildDom();
    canvasContext = {
      fillStyle: '',
      globalAlpha: 1,
      shadowColor: '',
      shadowBlur: 0,
      fills: [],
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(function arc(_x: number, _y: number) {
        return undefined;
      }),
      fill: vi.fn(function fill(this: FakeCanvasContext) {
        const lastArc = canvasContext.arc.mock.calls.at(-1);
        const style = canvasContext.fillStyle;
        canvasContext.fills.push({
          stops: typeof style === 'string' ? [style] : style.stops,
          alpha: canvasContext.globalAlpha,
          x: Number(lastArc?.[0] ?? 0),
          y: Number(lastArc?.[1] ?? 0),
        });
      }),
      save: vi.fn(),
      restore: vi.fn(function restore() {
        canvasContext.globalAlpha = 1;
        canvasContext.shadowBlur = 0;
      }),
      createRadialGradient: vi.fn((): FakeGradient => {
        const gradient: FakeGradient = {
          stops: [],
          addColorStop: (_offset: number, color: string) => {
            gradient.stops.push(color);
          },
        };
        return gradient;
      }),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      canvasContext as unknown as CanvasRenderingContext2D
    );
    messages = [];
    controller = createController(messages);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.documentElement.innerHTML = '';
  });

  it('applies caps lock state to the DOM', () => {
    const capsKey = document.querySelector('[data-key="CapsLock"]') as HTMLElement;
    const shiftKeys = Array.from(document.querySelectorAll<HTMLElement>('[data-key="Shift"]'));

    controller.applyKeyboardCapture(true);
    controller.applyCapsLock(true);

    expect(capsKey.classList.contains('active')).toBe(true);
    expect(shiftKeys.every((key) => key.classList.contains('active'))).toBe(true);
  });

  it('renders latch rows directly', () => {
    controller.applyMatrixRows([0x01]);

    expect(canvasContext.fills).toContainEqual(
      expect.objectContaining({
        stops: expect.arrayContaining(['rgb(255, 70, 70)']),
        x: 240,
        y: 16,
      })
    );
  });

  it('renders the matrix-smoke single latched LED from row planes', () => {
    controller.applyMatrixRows([0x80, 0, 0, 0, 0, 0, 0, 0]);

    expect(canvasContext.fills).toContainEqual(
      expect.objectContaining({
        stops: expect.arrayContaining(['rgb(255, 70, 70)']),
        x: 16,
        y: 16,
      })
    );
  });

  it('tracks modifier state when clicking matrix keys', () => {
    controller.applyKeyboardCapture(true);
    const shiftKeys = Array.from(document.querySelectorAll<HTMLElement>('[data-key="Shift"]'));
    const matrixShift = shiftKeys[0];
    const matrixKey = document.querySelector('[data-key="a"]') as HTMLElement;

    matrixShift.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    matrixKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    matrixKey.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    flushMatrixClickHold();

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
    controller.applyKeyboardCapture(true);
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

  it('holds clicked matrix arrow keys long enough for the monitor scan to sample them', () => {
    controller.applyKeyboardCapture(true);
    const rightArrow = document.querySelector('[data-key="ArrowRight"]') as HTMLElement;

    rightArrow.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    rightArrow.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    expect(rightArrow.classList.contains('pressed')).toBe(true);
    expect(messages).toEqual([
      {
        type: 'matrixKey',
        key: 'ArrowRight',
        pressed: true,
        shift: false,
        ctrl: false,
        fn: false,
        alt: false,
      },
    ]);

    flushMatrixClickHold();

    expect(rightArrow.classList.contains('pressed')).toBe(false);
    expect(messages).toContainEqual({
      type: 'matrixKey',
      key: 'ArrowRight',
      pressed: false,
      shift: false,
      ctrl: false,
      fn: false,
      alt: false,
    });
  });

  it('keeps fn and alt click modifiers distinct', () => {
    controller.applyKeyboardCapture(true);
    const fnKey = document.querySelector('[data-key="Fn"]') as HTMLElement;
    const altKeys = Array.from(document.querySelectorAll<HTMLElement>('[data-key="Alt"]'));
    const matrixKey = document.querySelector('[data-key="a"]') as HTMLElement;

    fnKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    matrixKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    matrixKey.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    flushMatrixClickHold();

    altKeys[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(altKeys.every((key) => key.classList.contains('active'))).toBe(true);
    matrixKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    matrixKey.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    flushMatrixClickHold();
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

  it.each([
    ['Control', { shift: false, ctrl: true, fn: false, alt: false }],
    ['Fn', { shift: false, ctrl: false, fn: true, alt: false }],
    ['Alt', { shift: false, ctrl: false, fn: false, alt: true }],
  ] as const)(
    'uses clicked %s as a one-shot modifier for exactly one matrix key',
    (modifier, mods) => {
      controller.applyKeyboardCapture(true);
      const modifierKey = document.querySelector(`[data-key="${modifier}"]`) as HTMLElement;
      const sKey = document.querySelector('[data-key="s"]') as HTMLElement;
      const aKey = document.querySelector('[data-key="a"]') as HTMLElement;

      modifierKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      sKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      sKey.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      flushMatrixClickHold();
      aKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

      expect(messages.filter((message) => message.pressed === true)).toEqual([
        {
          type: 'matrixKey',
          key: 's',
          pressed: true,
          ...mods,
        },
        {
          type: 'matrixKey',
          key: 'a',
          pressed: true,
          shift: false,
          ctrl: false,
          fn: false,
          alt: false,
        },
      ]);
    }
  );

  it('sends clicked Alt-letter chords as stable one-shot press and release pairs', () => {
    controller.applyKeyboardCapture(true);
    const altKey = document.querySelector('[data-key="Alt"]') as HTMLElement;
    const matrixKey = document.querySelector('[data-key="s"]') as HTMLElement;

    altKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    matrixKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    matrixKey.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    expect(messages).toEqual([
      {
        type: 'matrixKey',
        key: 's',
        pressed: true,
        shift: false,
        ctrl: false,
        fn: false,
        alt: true,
      },
    ]);

    flushMatrixClickHold();

    expect(messages).toEqual([
      {
        type: 'matrixKey',
        key: 's',
        pressed: true,
        shift: false,
        ctrl: false,
        fn: false,
        alt: true,
      },
      {
        type: 'matrixKey',
        key: 's',
        pressed: false,
        shift: false,
        ctrl: false,
        fn: false,
        alt: true,
      },
    ]);
  });

  it('consumes clicked Alt as a one-shot modifier on the next matrix key', () => {
    controller.applyKeyboardCapture(true);
    const altKey = document.querySelector('[data-key="Alt"]') as HTMLElement;
    const rightArrow = document.querySelector('[data-key="ArrowRight"]') as HTMLElement;
    const matrixKey = document.querySelector('[data-key="s"]') as HTMLElement;

    altKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    rightArrow.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    rightArrow.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    flushMatrixClickHold();
    matrixKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

    expect(messages).toContainEqual({
      type: 'matrixKey',
      key: 'ArrowRight',
      pressed: true,
      shift: false,
      ctrl: false,
      fn: false,
      alt: true,
    });
    expect(messages).toContainEqual({
      type: 'matrixKey',
      key: 's',
      pressed: true,
      shift: false,
      ctrl: false,
      fn: false,
      alt: false,
    });
  });

  it('keeps clicked Ctrl armed across repeated modifier clicks before the chord key', () => {
    controller.applyKeyboardCapture(true);
    const ctrlKey = document.querySelector('[data-key="Control"]') as HTMLElement;
    const matrixKey = document.querySelector('[data-key="s"]') as HTMLElement;

    ctrlKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    ctrlKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    matrixKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    matrixKey.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    expect(messages).toEqual([
      {
        type: 'matrixKey',
        key: 's',
        pressed: true,
        shift: false,
        ctrl: true,
        fn: false,
        alt: false,
      },
    ]);
  });

  it('emits clicked Ctrl-letter chords with the letter key payload', () => {
    controller.applyKeyboardCapture(true);
    const ctrlKey = document.querySelector('[data-key="Control"]') as HTMLElement;
    const matrixKey = document.querySelector('[data-key="e"]') as HTMLElement;

    ctrlKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    matrixKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

    expect(messages).toContainEqual({
      type: 'matrixKey',
      key: 'e',
      pressed: true,
      shift: false,
      ctrl: true,
      fn: false,
      alt: false,
    });
  });

  it('clears one-shot click modifiers immediately after the modified key press', () => {
    controller.applyKeyboardCapture(true);
    const altKey = document.querySelector('[data-key="Alt"]') as HTMLElement;
    const sKey = document.querySelector('[data-key="s"]') as HTMLElement;
    const aKey = document.querySelector('[data-key="a"]') as HTMLElement;

    altKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    sKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    sKey.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    aKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

    expect(messages).toEqual([
      {
        type: 'matrixKey',
        key: 's',
        pressed: true,
        shift: false,
        ctrl: false,
        fn: false,
        alt: true,
      },
      {
        type: 'matrixKey',
        key: 'a',
        pressed: true,
        shift: false,
        ctrl: false,
        fn: false,
        alt: false,
      },
    ]);
  });

  it('uses caps lock as a persistent letter shift and lights the shift keys', () => {
    controller.applyKeyboardCapture(true);
    const capsKey = document.querySelector('[data-key="CapsLock"]') as HTMLElement;
    const matrixKey = document.querySelector('[data-key="a"]') as HTMLElement;
    const shiftKeys = Array.from(document.querySelectorAll<HTMLElement>('[data-key="Shift"]'));

    capsKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    capsKey.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    flushMatrixClickHold();
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
    flushMatrixClickHold();

    messages.length = 0;
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
    expect(shiftKeys.every((key) => key.classList.contains('active'))).toBe(true);
    expect(capsKey.classList.contains('active')).toBe(true);
  });

  it('toggles caps lock off without leaving shift active for later letter clicks', () => {
    controller.applyKeyboardCapture(true);
    const capsKey = document.querySelector('[data-key="CapsLock"]') as HTMLElement;
    const matrixKey = document.querySelector('[data-key="a"]') as HTMLElement;
    const shiftKeys = Array.from(document.querySelectorAll<HTMLElement>('[data-key="Shift"]'));

    capsKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    capsKey.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    flushMatrixClickHold();
    capsKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    capsKey.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    flushMatrixClickHold();
    messages.length = 0;

    matrixKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

    expect(shiftKeys.some((key) => key.classList.contains('active'))).toBe(false);
    expect(capsKey.classList.contains('active')).toBe(false);
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
    ]);
  });

  it('resets transient matrix keyboard modifier UI state without disabling capture', () => {
    controller.applyKeyboardCapture(true);
    const capsKey = document.querySelector('[data-key="CapsLock"]') as HTMLElement;
    const shiftKeys = Array.from(document.querySelectorAll<HTMLElement>('[data-key="Shift"]'));
    const matrixShift = shiftKeys[0];
    const matrixKey = document.querySelector('[data-key="a"]') as HTMLElement;

    matrixShift.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    capsKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    capsKey.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    flushMatrixClickHold();

    expect(shiftKeys.every((key) => key.classList.contains('active'))).toBe(true);
    expect(capsKey.classList.contains('active')).toBe(true);

    controller.resetTransientState();

    expect(shiftKeys.some((key) => key.classList.contains('active'))).toBe(false);
    expect(capsKey.classList.contains('active')).toBe(false);

    messages.length = 0;
    matrixKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    matrixKey.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

    expect(messages).toContainEqual({
      type: 'matrixKey',
      key: 'a',
      pressed: true,
      shift: false,
      ctrl: false,
      fn: false,
      alt: false,
    });
  });

  it('applies caps lock to physical letter keys while keyboard capture is active', () => {
    controller.applyKeyboardCapture(true);

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

  it('keeps matrix hardware attached but ignores physical keys until capture is enabled', () => {
    controller.applyKeyboardCapture(false);

    expect(controller.handleKeyEvent(makeKeyEvent('keydown', 'a'), true)).toBe(false);

    controller.applyKeyboardCapture(true);

    expect(controller.handleKeyEvent(makeKeyEvent('keydown', 'a'), true)).toBe(true);
    expect(messages).toContainEqual({
      type: 'matrixKey',
      key: 'a',
      pressed: true,
      shift: false,
      ctrl: false,
      fn: false,
      alt: false,
    });
  });

  it('ignores clicked matrix keys until keyboard capture is enabled', () => {
    const matrixKey = document.querySelector('[data-key="a"]') as HTMLElement;

    matrixKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    matrixKey.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    flushMatrixClickHold();

    expect(messages).toEqual([]);
    expect(matrixKey.classList.contains('pressed')).toBe(false);

    controller.applyKeyboardCapture(true);
    matrixKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

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
    ]);
  });

  it('releases held physical keys when keyboard capture is released', () => {
    controller.applyKeyboardCapture(true);

    controller.handleKeyEvent(makeKeyEvent('keydown', 's', { altKey: true, code: 'KeyS' }), true);
    controller.releaseKeyboardCapture();

    expect(messages).toEqual([
      {
        type: 'matrixKey',
        key: 's',
        pressed: true,
        shift: false,
        ctrl: false,
        fn: false,
        alt: true,
      },
      {
        type: 'matrixKey',
        key: 's',
        pressed: false,
        shift: false,
        ctrl: false,
        fn: false,
        alt: true,
      },
    ]);
    expect(controller.isKeyboardCaptured()).toBe(false);
  });

  it('routes plain Escape to the matrix keyboard while capture is active', () => {
    controller.applyKeyboardCapture(true);

    expect(controller.handleKeyEvent(makeKeyEvent('keydown', 'Escape'), true)).toBe(true);
    expect(controller.handleKeyEvent(makeKeyEvent('keyup', 'Escape'), false)).toBe(true);

    expect(controller.isKeyboardCaptured()).toBe(true);
    expect(messages).toEqual([
      {
        type: 'matrixKey',
        key: 'Escape',
        pressed: true,
        shift: false,
        ctrl: false,
        fn: false,
        alt: false,
      },
      {
        type: 'matrixKey',
        key: 'Escape',
        pressed: false,
        shift: false,
        ctrl: false,
        fn: false,
        alt: false,
      },
    ]);
  });

  it('uses Ctrl-Escape as a host-only keyboard capture release chord', () => {
    controller.applyKeyboardCapture(true);

    expect(
      controller.handleKeyEvent(makeKeyEvent('keydown', 'Escape', { ctrlKey: true }), true)
    ).toBe(true);

    expect(controller.isKeyboardCaptured()).toBe(false);
    expect(messages).toEqual([]);
  });

  it('lights duplicate modifier keys together and clears one-shot modifiers after a key', () => {
    controller.applyKeyboardCapture(true);
    const leftShift = document.querySelector<HTMLElement>('[data-key="Shift"]') as HTMLElement;
    const shiftKeys = Array.from(document.querySelectorAll<HTMLElement>('[data-key="Shift"]'));
    const altKeys = Array.from(document.querySelectorAll<HTMLElement>('[data-key="Alt"]'));
    const matrixKey = document.querySelector('[data-key="a"]') as HTMLElement;

    leftShift.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(shiftKeys.every((key) => key.classList.contains('active'))).toBe(true);

    matrixKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    matrixKey.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    flushMatrixClickHold();

    expect(shiftKeys.some((key) => key.classList.contains('active'))).toBe(false);

    altKeys[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(altKeys.every((key) => key.classList.contains('active'))).toBe(true);
  });

  it('clears one-shot and held-key state when keyboard capture is disabled', () => {
    controller.applyKeyboardCapture(true);
    const shiftKeys = Array.from(document.querySelectorAll<HTMLElement>('[data-key="Shift"]'));
    const matrixKey = document.querySelector('[data-key="a"]') as HTMLElement;

    shiftKeys[0].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    matrixKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

    controller.applyKeyboardCapture(false);
    expect(shiftKeys.some((key) => key.classList.contains('active'))).toBe(false);
    expect(matrixKey.classList.contains('pressed')).toBe(false);

    controller.applyKeyboardCapture(true);
    matrixKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

    expect(shiftKeys.some((key) => key.classList.contains('active'))).toBe(false);
    expect(messages.filter((message) => message.key === 'a')).toEqual([
      {
        type: 'matrixKey',
        key: 'a',
        pressed: true,
        shift: true,
        ctrl: false,
        fn: false,
        alt: false,
      },
      {
        type: 'matrixKey',
        key: 'a',
        pressed: false,
        shift: true,
        ctrl: false,
        fn: false,
        alt: false,
      },
      {
        type: 'matrixKey',
        key: 'a',
        pressed: true,
        shift: false,
        ctrl: false,
        fn: false,
        alt: false,
      },
    ]);
  });

  it('ignores key events from inputs, repeated presses, and inactive keyboard capture', () => {
    controller.applyKeyboardCapture(true);
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
    controller.applyKeyboardCapture(true);
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

  it('preserves physical Ctrl-letter chords as native matrix key plus ctrl modifier', () => {
    controller.applyKeyboardCapture(true);
    const keydown = makeKeyEvent('keydown', 's', { ctrlKey: true });
    const keyup = makeKeyEvent('keyup', 's', { ctrlKey: true });

    expect(controller.handleKeyEvent(keydown, true)).toBe(true);
    expect(controller.handleKeyEvent(keyup, false)).toBe(true);

    expect(messages).toEqual([
      {
        type: 'matrixKey',
        key: 's',
        pressed: true,
        shift: false,
        ctrl: true,
        fn: false,
        alt: false,
      },
      {
        type: 'matrixKey',
        key: 's',
        pressed: false,
        shift: false,
        ctrl: true,
        fn: false,
        alt: false,
      },
    ]);
  });

  it('ignores physical Meta key chords instead of routing them into matrix input', () => {
    controller.applyKeyboardCapture(true);
    const keydown = makeKeyEvent('keydown', 'ArrowUp', { metaKey: true });
    const keyup = makeKeyEvent('keyup', 'ArrowUp', { metaKey: true });

    expect(controller.handleKeyEvent(keydown, true)).toBe(false);
    expect(controller.handleKeyEvent(keyup, false)).toBe(false);
    expect(messages).toEqual([]);
  });

  it('leaves Meta key chords unhandled so host shortcuts keep working', () => {
    controller.applyKeyboardCapture(true);
    const keydown = makeKeyEvent('keydown', 's', { metaKey: true });
    const keyup = makeKeyEvent('keyup', 's', { metaKey: true });
    const downPreventDefault = vi.spyOn(keydown, 'preventDefault');
    const downStopImmediatePropagation = vi.spyOn(keydown, 'stopImmediatePropagation');
    const upPreventDefault = vi.spyOn(keyup, 'preventDefault');
    const upStopImmediatePropagation = vi.spyOn(keyup, 'stopImmediatePropagation');

    expect(controller.handleKeyEvent(keydown, true)).toBe(false);
    expect(controller.handleKeyEvent(keyup, false)).toBe(false);

    expect(downPreventDefault).not.toHaveBeenCalled();
    expect(downStopImmediatePropagation).not.toHaveBeenCalled();
    expect(upPreventDefault).not.toHaveBeenCalled();
    expect(upStopImmediatePropagation).not.toHaveBeenCalled();
    expect(messages).toEqual([]);
  });

  it('releases an already-held matrix key even if Meta is held before keyup', () => {
    controller.applyKeyboardCapture(true);
    const keydown = makeKeyEvent('keydown', 'a');
    const keyup = makeKeyEvent('keyup', 'a', { metaKey: true });

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

  it('does not route Meta-modified letter keys into matrix input', () => {
    controller.applyKeyboardCapture(true);
    const keydown = makeKeyEvent('keydown', 's', { metaKey: true, code: 'KeyS' });
    const keyup = makeKeyEvent('keyup', 's', { metaKey: true, code: 'KeyS' });

    expect(controller.handleKeyEvent(keydown, true)).toBe(false);
    expect(controller.handleKeyEvent(keyup, false)).toBe(false);
    expect(messages).toEqual([]);
  });

  it('uses physical key code for Alt chords when macOS changes event.key', () => {
    controller.applyKeyboardCapture(true);
    const keydown = makeKeyEvent('keydown', 'ß', { altKey: true, code: 'KeyS' });
    const keyup = makeKeyEvent('keyup', 'ß', { altKey: true, code: 'KeyS' });

    expect(controller.handleKeyEvent(keydown, true)).toBe(true);
    expect(controller.handleKeyEvent(keyup, false)).toBe(true);

    expect(messages).toEqual([
      {
        type: 'matrixKey',
        key: 's',
        pressed: true,
        shift: false,
        ctrl: false,
        fn: false,
        alt: true,
      },
      {
        type: 'matrixKey',
        key: 's',
        pressed: false,
        shift: false,
        ctrl: false,
        fn: false,
        alt: true,
      },
    ]);
  });

  it('uses physical key code for shifted punctuation and preserves press-time shift on release', () => {
    controller.applyKeyboardCapture(true);
    const keydown = makeKeyEvent('keydown', '!', { shiftKey: true, code: 'Digit1' });
    const keyup = makeKeyEvent('keyup', '1', { code: 'Digit1' });

    expect(controller.handleKeyEvent(keydown, true)).toBe(true);
    expect(controller.handleKeyEvent(keyup, false)).toBe(true);

    expect(messages).toEqual([
      {
        type: 'matrixKey',
        key: '1',
        pressed: true,
        shift: true,
        ctrl: false,
        fn: false,
        alt: false,
      },
      {
        type: 'matrixKey',
        key: '1',
        pressed: false,
        shift: true,
        ctrl: false,
        fn: false,
        alt: false,
      },
    ]);
  });

  it('replaces a pending click-release timer when the same matrix key is pressed again', () => {
    controller.applyKeyboardCapture(true);
    const matrixKey = document.querySelector('[data-key="a"]') as HTMLElement;

    matrixKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    matrixKey.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    vi.advanceTimersByTime(40);
    matrixKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    vi.advanceTimersByTime(50);

    expect(matrixKey.classList.contains('pressed')).toBe(true);
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
    ]);

    matrixKey.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    flushMatrixClickHold();

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

  it('does not emit a duplicate click release when capture is disabled before mouseup', () => {
    controller.applyKeyboardCapture(true);
    const matrixKey = document.querySelector('[data-key="a"]') as HTMLElement;

    matrixKey.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    controller.applyKeyboardCapture(false);
    matrixKey.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    flushMatrixClickHold();

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
    expect(matrixKey.classList.contains('pressed')).toBe(false);
  });

  it('releases physical modifier chords using the press-time modifiers', () => {
    controller.applyKeyboardCapture(true);
    const keydown = makeKeyEvent('keydown', 's', { altKey: true, code: 'KeyS' });
    const keyup = makeKeyEvent('keyup', 's', { code: 'KeyS' });

    expect(controller.handleKeyEvent(keydown, true)).toBe(true);
    expect(controller.handleKeyEvent(keyup, false)).toBe(true);

    expect(messages).toEqual([
      {
        type: 'matrixKey',
        key: 's',
        pressed: true,
        shift: false,
        ctrl: false,
        fn: false,
        alt: true,
      },
      {
        type: 'matrixKey',
        key: 's',
        pressed: false,
        shift: false,
        ctrl: false,
        fn: false,
        alt: true,
      },
    ]);
  });

  it('only routes physical keys while the matrix keyboard panel is active', () => {
    let panelActive = false;
    const gatedController = createMatrixUiController(createVscodeMock(messages), () => panelActive);
    gatedController.init();
    gatedController.applyKeyboardCapture(true);

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
