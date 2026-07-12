import { describe, expect, it } from 'vitest';
import {
  appendPlatformSerial,
  buildSerialInitMessage,
  clearPlatformSerial,
  createSerialBuffer,
} from '../../src/extension/platform-view-serial-state';

describe('platform-view-serial-state', () => {
  it('appends serial text and emits when the platform is active', () => {
    const serial = createSerialHarness();

    expect(serial.append('HELLO', { platform: 'tec1', currentPlatform: 'tec1' })).toEqual({
      type: 'serial',
      text: 'HELLO',
    });
    expect(serial.text()).toBe('HELLO');
  });

  it('appends serial text without emitting when another platform is active', () => {
    const serial = createSerialHarness();

    expect(serial.append('HIDDEN', { platform: 'tec1g', currentPlatform: 'tec1' })).toBeUndefined();
    expect(serial.text()).toBe('HIDDEN');
  });

  it('ignores empty serial text', () => {
    const serial = createSerialHarness();

    expect(serial.append('', { platform: 'simple', currentPlatform: 'simple' })).toBeUndefined();
    expect(serial.text()).toBe('');
  });

  it('builds serial init only when buffered text exists', () => {
    const serial = createSerialHarness();

    expect(serial.init()).toBeUndefined();

    serial.append('READY', { platform: 'simple', currentPlatform: undefined });

    expect(serial.init()).toEqual({ type: 'serialInit', text: 'READY' });
  });

  it('clears buffered serial text', () => {
    const serial = createSerialHarness();
    serial.append('READY', { platform: 'simple', currentPlatform: undefined });

    serial.clear();

    expect(serial.text()).toBe('');
    expect(serial.init()).toBeUndefined();
  });
});

function createSerialHarness(): {
  append: (
    text: string,
    options: Parameters<typeof appendPlatformSerial>[2]
  ) => ReturnType<typeof appendPlatformSerial>;
  clear: () => void;
  init: () => ReturnType<typeof buildSerialInitMessage>;
  text: () => string;
} {
  const buffer = createSerialBuffer();

  return {
    append: (text, options) => appendPlatformSerial(buffer, text, options),
    clear: () => clearPlatformSerial(buffer),
    init: () => buildSerialInitMessage(buffer),
    text: () => buffer.text,
  };
}
