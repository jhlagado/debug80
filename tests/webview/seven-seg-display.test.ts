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
});
