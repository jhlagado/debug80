/**
 * @file TEC-1G UI panel HTML tests.
 */

import { describe, it, expect } from 'vitest';
import { getTec1gHtml } from '../../../src/platforms/tec1g/ui-panel-html';

describe('tec1g ui-panel-html', () => {
  it('includes key UI sections', () => {
    const html = getTec1gHtml('ui');
    expect(html).toContain('panel-ui');
    expect(html).toContain('panel-memory');
    expect(html).toContain('LCD (HD44780 A00)');
    expect(html).toContain('GLCD (128x64)');
    expect(html).toContain('SERIAL (BIT 6)');
  });

  it('embeds the active tab', () => {
    const html = getTec1gHtml('memory');
    expect(html).toContain("const DEFAULT_TAB = 'memory'");
  });
});
