import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTecKeypad } from '../../../webview/common/tec-keypad';

describe('on-screen TEC keypad holds', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    document.body.innerHTML = '<div id="keypad"></div>';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('moves keyboard focus to the keypad when an on-screen key is pressed', () => {
    document.body.innerHTML = '<input id="editor"><div id="keypad"></div>';
    const keypadElement = document.getElementById('keypad')!;
    createTecKeypad({ postMessage: () => undefined }, keypadElement);
    const goKey = Array.from(keypadElement.querySelectorAll<HTMLElement>('.keycap')).find(
      (element) => element.textContent === 'GO'
    );
    const editor = document.getElementById('editor') as HTMLInputElement;
    editor.focus();

    goKey?.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));

    expect(document.activeElement).toBe(keypadElement);
  });

  it('does not let an earlier delayed release cancel a newer press', () => {
    const messages: unknown[] = [];
    const keypadElement = document.getElementById('keypad')!;
    createTecKeypad({ postMessage: (message) => messages.push(message) }, keypadElement);
    const goKey = Array.from(keypadElement.querySelectorAll<HTMLElement>('.keycap')).find(
      (element) => element.textContent === 'GO'
    );
    expect(goKey).toBeDefined();

    goKey?.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
    goKey?.dispatchEvent(new Event('pointerup', { bubbles: true }));
    vi.advanceTimersByTime(40);

    goKey?.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
    vi.advanceTimersByTime(100);

    expect(messages.filter(isReleaseMessage)).toEqual([]);

    goKey?.dispatchEvent(new Event('pointerup', { bubbles: true }));
    vi.advanceTimersByTime(80);

    expect(messages.filter(isReleaseMessage)).toHaveLength(1);
  });

  it('does not let a delayed pointer release cancel a physical press', () => {
    const messages: unknown[] = [];
    const keypadElement = document.getElementById('keypad')!;
    const keypad = createTecKeypad(
      { postMessage: (message) => messages.push(message) },
      keypadElement
    );
    const goKey = Array.from(keypadElement.querySelectorAll<HTMLElement>('.keycap')).find(
      (element) => element.textContent === 'GO'
    );
    expect(goKey).toBeDefined();

    goKey?.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
    goKey?.dispatchEvent(new Event('pointerup', { bubbles: true }));
    vi.advanceTimersByTime(40);

    const physicalPress = keypad.pressKey(0x12);
    vi.advanceTimersByTime(40);

    expect(messages.filter(isPressMessage)).toHaveLength(1);
    expect(messages.filter(isReleaseMessage)).toEqual([]);

    keypad.releaseKey(physicalPress);
    expect(messages.filter(isReleaseMessage)).toHaveLength(1);
  });

  it('keeps a pointer press active after an overlapping physical release', () => {
    const messages: unknown[] = [];
    const keypadElement = document.getElementById('keypad')!;
    const keypad = createTecKeypad(
      { postMessage: (message) => messages.push(message) },
      keypadElement
    );
    const goKey = Array.from(keypadElement.querySelectorAll<HTMLElement>('.keycap')).find(
      (element) => element.textContent === 'GO'
    );

    goKey?.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
    const physicalPress = keypad.pressKey(0x12);
    keypad.releaseKey(physicalPress);

    expect(messages.filter(isPressMessage)).toHaveLength(1);
    expect(messages.filter(isReleaseMessage)).toHaveLength(0);

    vi.advanceTimersByTime(80);
    goKey?.dispatchEvent(new Event('pointerup', { bubbles: true }));
    expect(messages.filter(isReleaseMessage)).toHaveLength(1);
  });

  it('releases an on-screen hold when the keypad lifecycle is cleared', () => {
    const messages: unknown[] = [];
    const keypadElement = document.getElementById('keypad')!;
    const keypad = createTecKeypad(
      { postMessage: (message) => messages.push(message) },
      keypadElement
    );
    const goKey = Array.from(keypadElement.querySelectorAll<HTMLElement>('.keycap')).find(
      (element) => element.textContent === 'GO'
    );

    goKey?.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
    keypad.releaseAllKeys();
    goKey?.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
    goKey?.dispatchEvent(new Event('pointerup', { bubbles: true }));
    vi.advanceTimersByTime(80);

    expect(messages.filter(isPressMessage)).toHaveLength(2);
    expect(messages.filter(isReleaseMessage)).toHaveLength(2);
  });

  it('keeps the first pointer as the owner of a held button', () => {
    const messages: unknown[] = [];
    const keypadElement = document.getElementById('keypad')!;
    createTecKeypad({ postMessage: (message) => messages.push(message) }, keypadElement);
    const goKey = Array.from(keypadElement.querySelectorAll<HTMLElement>('.keycap')).find(
      (element) => element.textContent === 'GO'
    );

    goKey?.dispatchEvent(pointerEvent('pointerdown', 1));
    goKey?.dispatchEvent(pointerEvent('pointerdown', 2));
    goKey?.dispatchEvent(pointerEvent('pointerup', 2));
    vi.advanceTimersByTime(80);

    expect(messages.filter(isPressMessage)).toHaveLength(1);
    expect(messages.filter(isReleaseMessage)).toHaveLength(0);

    goKey?.dispatchEvent(pointerEvent('pointerup', 1));
    vi.advanceTimersByTime(80);
    expect(messages.filter(isReleaseMessage)).toHaveLength(1);
  });
});

function pointerEvent(type: string, pointerId: number): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  return event;
}

function isPressMessage(message: unknown): boolean {
  return (
    message !== null &&
    typeof message === 'object' &&
    (message as { type?: unknown }).type === 'key' &&
    (message as { pressed?: unknown }).pressed === true
  );
}

function isReleaseMessage(message: unknown): boolean {
  return (
    message !== null &&
    typeof message === 'object' &&
    (message as { type?: unknown }).type === 'key' &&
    (message as { pressed?: unknown }).pressed === false
  );
}
