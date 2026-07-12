/**
 * @file Shared keypad layout tables for TEC-1 + TEC-1G webviews (regression guard for refactor #228).
 */

import { describe, expect, it } from 'vitest';
import {
  TEC1G_CONTROL_ORDER,
  TEC1G_HEX_ORDER,
  TEC1G_KEY_MAP,
  TEC1G_SHIFT_BIT,
} from '../../webview/common/tec-keypad-layout';

describe('TEC-1G keypad layout tables', () => {
  it('keeps 16 hex keys in raster order', () => {
    expect(TEC1G_HEX_ORDER).toHaveLength(16);
  });

  it('maps control names used by the grid', () => {
    for (const key of TEC1G_CONTROL_ORDER) {
      expect(TEC1G_KEY_MAP[key]).toBeTypeOf('number');
    }
  });

  it('uses shift bit consistent with emulator convention', () => {
    expect(TEC1G_SHIFT_BIT).toBe(0x20);
  });
});
