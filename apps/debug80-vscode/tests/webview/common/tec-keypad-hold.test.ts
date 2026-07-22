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
});

function isReleaseMessage(message: unknown): boolean {
  return (
    message !== null &&
    typeof message === 'object' &&
    (message as { type?: unknown }).type === 'key' &&
    (message as { pressed?: unknown }).pressed === false
  );
}
