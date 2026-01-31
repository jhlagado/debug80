/**
 * @file TEC-1 UI panel HTML tests.
 */

import { describe, it, expect } from 'vitest';
import { getTec1Html } from '../../../src/platforms/tec1/ui-panel-html';

describe('tec1 ui-panel-html', () => {
  it('includes key UI sections', () => {
    const html = getTec1Html('ui');
    expect(html).toContain('panel-ui');
    expect(html).toContain('panel-memory');
    expect(html).toContain('LCD (HD44780 A00)');
    expect(html).toContain('8x8 LED MATRIX');
    expect(html).toContain('SERIAL (BIT 6)');
  });

  it('embeds the active tab', () => {
    const html = getTec1Html('memory');
    expect(html).toContain("const DEFAULT_TAB = 'memory'");
  });
});
