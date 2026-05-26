/**
 * @file Shared seven-segment display renderer tests.
 */

import { describe, expect, it } from 'vitest';
import { createSevenSegDisplay } from '../../webview/common/seven-seg-display';

describe('seven-seg display', () => {
  it('applies optional per-digit class names', () => {
    const container = document.createElement('div');

    const display = createSevenSegDisplay(container, 6, {
      digitClassName: (index) => (index < 2 ? 'digit--data' : 'digit--address'),
    });

    expect(display.digitEls).toHaveLength(6);
    expect(display.digitEls[0]?.classList.contains('digit--data')).toBe(true);
    expect(display.digitEls[1]?.classList.contains('digit--data')).toBe(true);
    expect(display.digitEls[2]?.classList.contains('digit--address')).toBe(true);
    expect(container.querySelectorAll('.digit')).toHaveLength(6);
  });

  it('renders per-segment intensity as opacity', () => {
    const container = document.createElement('div');
    const display = createSevenSegDisplay(container, 1);

    display.applySegmentIntensities([0.25, 0, 1, 0, 0, 0, 0, 0]);

    const segA = container.querySelector<HTMLElement>('[data-mask="1"]');
    const segG = container.querySelector<HTMLElement>('[data-mask="4"]');
    const segB = container.querySelector<HTMLElement>('[data-mask="8"]');
    expect(segA?.classList.contains('on')).toBe(true);
    expect(segA?.style.opacity).toBe('0.250');
    expect(segG?.classList.contains('on')).toBe(true);
    expect(segG?.style.opacity).toBe('1.000');
    expect(segB?.classList.contains('on')).toBe(false);
    expect(segB?.style.opacity).toBe('0');
  });
});
