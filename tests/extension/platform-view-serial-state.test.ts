import { describe, expect, it } from 'vitest';
import {
  appendPlatformSerial,
  buildSerialInitMessage,
  clearPlatformSerial,
  createSerialBuffer,
} from '../../src/extension/platform-view-serial-state';

describe('platform-view-serial-state', () => {
  it('appends serial text and emits when the platform is active', () => {
    const buffer = createSerialBuffer();

    expect(
      appendPlatformSerial(buffer, 'HELLO', { platform: 'tec1', currentPlatform: 'tec1' })
    ).toEqual({ type: 'serial', text: 'HELLO' });
    expect(buffer.text).toBe('HELLO');
  });

  it('appends serial text without emitting when another platform is active', () => {
    const buffer = createSerialBuffer();

    expect(
      appendPlatformSerial(buffer, 'HIDDEN', { platform: 'tec1g', currentPlatform: 'tec1' })
    ).toBeUndefined();
    expect(buffer.text).toBe('HIDDEN');
  });

  it('ignores empty serial text', () => {
    const buffer = createSerialBuffer();

    expect(
      appendPlatformSerial(buffer, '', { platform: 'simple', currentPlatform: 'simple' })
    ).toBeUndefined();
    expect(buffer.text).toBe('');
  });

  it('builds serial init only when buffered text exists', () => {
    const buffer = createSerialBuffer();

    expect(buildSerialInitMessage(buffer)).toBeUndefined();

    appendPlatformSerial(buffer, 'READY', { platform: 'simple', currentPlatform: undefined });

    expect(buildSerialInitMessage(buffer)).toEqual({ type: 'serialInit', text: 'READY' });
  });

  it('clears buffered serial text', () => {
    const buffer = createSerialBuffer();
    appendPlatformSerial(buffer, 'READY', { platform: 'simple', currentPlatform: undefined });

    clearPlatformSerial(buffer);

    expect(buffer.text).toBe('');
    expect(buildSerialInitMessage(buffer)).toBeUndefined();
  });
});
