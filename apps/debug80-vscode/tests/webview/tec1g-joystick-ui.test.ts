import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJoystickUiController } from '../../webview/tec1g/joystick-ui';

type PostedMessage = { type: string; mask: number };

function makeKeyEvent(type: 'keydown' | 'keyup', code: string): KeyboardEvent {
  return new KeyboardEvent(type, {
    bubbles: true,
    cancelable: true,
    code,
  });
}

function pointerEvent(type: string, pointerId = 1): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  return event;
}

describe('TEC-1G joystick UI', () => {
  let messages: PostedMessage[];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    document.body.innerHTML = `
      <section id="accordion-joystick">
        <button type="button" data-joystick-arrow-mode="move">Move</button>
        <button type="button" data-joystick-arrow-mode="fire">Fire</button>
        <button type="button" data-joystick-bit="1">Up</button>
        <button type="button" data-joystick-bit="64">Fire 1</button>
      </section>
    `;
    messages = [];
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('maps the right-hand inverted T keys and Space to joystick action bits', () => {
    const controller = createJoystickUiController(
      {
        postMessage: (message: unknown) => messages.push(message as PostedMessage),
      },
      () => true
    );
    controller.init();
    messages.length = 0;

    expect(controller.handleKeyEvent(makeKeyEvent('keydown', 'KeyJ'), true)).toBe(true);
    expect(messages.at(-1)).toEqual({ type: 'joystick', mask: 0x40 });

    expect(controller.handleKeyEvent(makeKeyEvent('keyup', 'KeyJ'), false)).toBe(true);
    expect(messages.at(-1)).toEqual({ type: 'joystick', mask: 0x00 });

    expect(controller.handleKeyEvent(makeKeyEvent('keydown', 'KeyI'), true)).toBe(true);
    expect(messages.at(-1)).toEqual({ type: 'joystick', mask: 0x10 });

    expect(controller.handleKeyEvent(makeKeyEvent('keyup', 'KeyI'), false)).toBe(true);
    expect(messages.at(-1)).toEqual({ type: 'joystick', mask: 0x00 });

    expect(controller.handleKeyEvent(makeKeyEvent('keydown', 'KeyK'), true)).toBe(true);
    expect(messages.at(-1)).toEqual({ type: 'joystick', mask: 0x20 });

    expect(controller.handleKeyEvent(makeKeyEvent('keyup', 'KeyK'), false)).toBe(true);
    expect(messages.at(-1)).toEqual({ type: 'joystick', mask: 0x00 });

    expect(controller.handleKeyEvent(makeKeyEvent('keydown', 'KeyL'), true)).toBe(true);
    expect(messages.at(-1)).toEqual({ type: 'joystick', mask: 0x80 });

    expect(controller.handleKeyEvent(makeKeyEvent('keyup', 'KeyL'), false)).toBe(true);
    expect(messages.at(-1)).toEqual({ type: 'joystick', mask: 0x00 });

    expect(controller.handleKeyEvent(makeKeyEvent('keydown', 'Space'), true)).toBe(true);
    expect(messages.at(-1)).toEqual({ type: 'joystick', mask: 0x40 });

    expect(controller.handleKeyEvent(makeKeyEvent('keydown', 'KeyM'), true)).toBe(false);
  });

  it('uses arrow keys for movement by default and can switch arrows to actions', () => {
    const controller = createJoystickUiController(
      {
        postMessage: (message: unknown) => messages.push(message as PostedMessage),
      },
      () => true
    );
    controller.init();
    messages.length = 0;

    expect(controller.handleKeyEvent(makeKeyEvent('keydown', 'ArrowUp'), true)).toBe(true);
    expect(messages.at(-1)).toEqual({ type: 'joystick', mask: 0x01 });
    expect(controller.handleKeyEvent(makeKeyEvent('keyup', 'ArrowUp'), false)).toBe(true);
    expect(messages.at(-1)).toEqual({ type: 'joystick', mask: 0x00 });

    document.querySelector<HTMLButtonElement>('[data-joystick-arrow-mode="fire"]')?.click();

    expect(controller.handleKeyEvent(makeKeyEvent('keydown', 'ArrowUp'), true)).toBe(true);
    expect(messages.at(-1)).toEqual({ type: 'joystick', mask: 0x10 });
    expect(controller.handleKeyEvent(makeKeyEvent('keyup', 'ArrowUp'), false)).toBe(true);
    expect(messages.at(-1)).toEqual({ type: 'joystick', mask: 0x00 });

    expect(controller.handleKeyEvent(makeKeyEvent('keydown', 'ArrowLeft'), true)).toBe(true);
    expect(messages.at(-1)).toEqual({ type: 'joystick', mask: 0x40 });
    expect(controller.handleKeyEvent(makeKeyEvent('keyup', 'ArrowLeft'), false)).toBe(true);
    expect(messages.at(-1)).toEqual({ type: 'joystick', mask: 0x00 });

    expect(controller.handleKeyEvent(makeKeyEvent('keydown', 'ArrowRight'), true)).toBe(true);
    expect(messages.at(-1)).toEqual({ type: 'joystick', mask: 0x80 });
    expect(controller.handleKeyEvent(makeKeyEvent('keyup', 'ArrowRight'), false)).toBe(true);
    expect(messages.at(-1)).toEqual({ type: 'joystick', mask: 0x00 });

    expect(controller.handleKeyEvent(makeKeyEvent('keydown', 'ArrowDown'), true)).toBe(true);
    expect(messages.at(-1)).toEqual({ type: 'joystick', mask: 0x20 });
    expect(controller.handleKeyEvent(makeKeyEvent('keyup', 'ArrowDown'), false)).toBe(true);
    expect(messages.at(-1)).toEqual({ type: 'joystick', mask: 0x00 });

    expect(controller.handleKeyEvent(makeKeyEvent('keydown', 'KeyW'), true)).toBe(true);
    expect(messages.at(-1)).toEqual({ type: 'joystick', mask: 0x01 });
  });

  it('marks the selected arrow key mode', () => {
    const controller = createJoystickUiController(
      {
        postMessage: (message: unknown) => messages.push(message as PostedMessage),
      },
      () => true
    );
    controller.init();
    const move = document.querySelector<HTMLButtonElement>('[data-joystick-arrow-mode="move"]')!;
    const fire = document.querySelector<HTMLButtonElement>('[data-joystick-arrow-mode="fire"]')!;

    expect(move.classList.contains('active')).toBe(true);
    expect(move.getAttribute('aria-pressed')).toBe('true');
    expect(fire.classList.contains('active')).toBe(false);
    expect(fire.getAttribute('aria-pressed')).toBe('false');

    fire.click();

    expect(move.classList.contains('active')).toBe(false);
    expect(move.getAttribute('aria-pressed')).toBe('false');
    expect(fire.classList.contains('active')).toBe(true);
    expect(fire.getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps a joystick bit active while any aliased key for that bit is held', () => {
    const controller = createJoystickUiController(
      {
        postMessage: (message: unknown) => messages.push(message as PostedMessage),
      },
      () => true
    );
    controller.init();
    messages.length = 0;

    expect(controller.handleKeyEvent(makeKeyEvent('keydown', 'KeyJ'), true)).toBe(true);
    expect(messages.at(-1)).toEqual({ type: 'joystick', mask: 0x40 });

    expect(controller.handleKeyEvent(makeKeyEvent('keydown', 'Space'), true)).toBe(true);
    expect(messages.at(-1)).toEqual({ type: 'joystick', mask: 0x40 });

    expect(controller.handleKeyEvent(makeKeyEvent('keyup', 'KeyJ'), false)).toBe(true);
    expect(messages.at(-1)).toEqual({ type: 'joystick', mask: 0x40 });

    expect(controller.handleKeyEvent(makeKeyEvent('keyup', 'Space'), false)).toBe(true);
    expect(messages.at(-1)).toEqual({ type: 'joystick', mask: 0x00 });
  });

  it('keeps held base keys when switching the arrow key mode', () => {
    const controller = createJoystickUiController(
      {
        postMessage: (message: unknown) => messages.push(message as PostedMessage),
      },
      () => true
    );
    controller.init();
    messages.length = 0;

    expect(controller.handleKeyEvent(makeKeyEvent('keydown', 'KeyW'), true)).toBe(true);
    expect(messages.at(-1)).toEqual({ type: 'joystick', mask: 0x01 });

    document.querySelector<HTMLButtonElement>('[data-joystick-arrow-mode="fire"]')?.click();

    expect(messages.at(-1)).toEqual({ type: 'joystick', mask: 0x01 });
    expect(controller.handleKeyEvent(makeKeyEvent('keyup', 'KeyW'), false)).toBe(true);
    expect(messages.at(-1)).toEqual({ type: 'joystick', mask: 0x00 });
  });

  it('does not route joystick keys while inactive', () => {
    const controller = createJoystickUiController(
      {
        postMessage: (message: unknown) => messages.push(message as PostedMessage),
      },
      () => false
    );
    controller.init();
    messages.length = 0;

    expect(controller.handleKeyEvent(makeKeyEvent('keydown', 'KeyJ'), true)).toBe(false);
    expect(messages).toEqual([]);
  });

  it('keeps an on-screen joystick control pressed until its pointer is released', () => {
    const controller = createJoystickUiController(
      {
        postMessage: (message: unknown) => messages.push(message as PostedMessage),
      },
      () => true
    );
    controller.init();
    messages.length = 0;
    const up = document.querySelector<HTMLElement>('[data-joystick-bit="1"]')!;

    up.dispatchEvent(pointerEvent('pointerdown'));
    vi.advanceTimersByTime(500);

    expect(up.getAttribute('aria-pressed')).toBe('true');
    expect(messages).toEqual([{ type: 'joystick', mask: 0x01 }]);

    up.dispatchEvent(pointerEvent('pointerup'));

    expect(up.getAttribute('aria-pressed')).toBe('false');
    expect(messages.at(-1)).toEqual({ type: 'joystick', mask: 0x00 });
  });

  it('does not let a second pointer release an on-screen joystick hold', () => {
    const controller = createJoystickUiController(
      {
        postMessage: (message: unknown) => messages.push(message as PostedMessage),
      },
      () => true
    );
    controller.init();
    messages.length = 0;
    const fire = document.querySelector<HTMLElement>('[data-joystick-bit="64"]')!;

    fire.dispatchEvent(pointerEvent('pointerdown', 1));
    fire.dispatchEvent(pointerEvent('pointerdown', 2));
    fire.dispatchEvent(pointerEvent('pointerup', 2));
    vi.advanceTimersByTime(100);

    expect(messages).toEqual([{ type: 'joystick', mask: 0x40 }]);

    fire.dispatchEvent(pointerEvent('pointerup', 1));

    expect(messages.at(-1)).toEqual({ type: 'joystick', mask: 0x00 });
  });

  it('keeps a quick joystick tap active for the minimum input pulse', () => {
    const controller = createJoystickUiController(
      {
        postMessage: (message: unknown) => messages.push(message as PostedMessage),
      },
      () => true
    );
    controller.init();
    messages.length = 0;
    const up = document.querySelector<HTMLElement>('[data-joystick-bit="1"]')!;

    up.dispatchEvent(pointerEvent('pointerdown'));
    up.dispatchEvent(pointerEvent('pointerup'));
    vi.advanceTimersByTime(79);

    expect(messages).toEqual([{ type: 'joystick', mask: 0x01 }]);

    vi.advanceTimersByTime(1);

    expect(messages.at(-1)).toEqual({ type: 'joystick', mask: 0x00 });
  });

  it('keeps a joystick bit active when its physical key outlives the pointer hold', () => {
    const controller = createJoystickUiController(
      {
        postMessage: (message: unknown) => messages.push(message as PostedMessage),
      },
      () => true
    );
    controller.init();
    messages.length = 0;
    const fire = document.querySelector<HTMLElement>('[data-joystick-bit="64"]')!;

    fire.dispatchEvent(pointerEvent('pointerdown'));
    controller.handleKeyEvent(makeKeyEvent('keydown', 'KeyJ'), true);
    vi.advanceTimersByTime(100);
    fire.dispatchEvent(pointerEvent('pointerup'));

    expect(messages).toEqual([{ type: 'joystick', mask: 0x40 }]);

    controller.handleKeyEvent(makeKeyEvent('keyup', 'KeyJ'), false);

    expect(messages.at(-1)).toEqual({ type: 'joystick', mask: 0x00 });
  });
});
