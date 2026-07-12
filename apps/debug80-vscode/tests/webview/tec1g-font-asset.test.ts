/**
 * @file Regression test: TEC-1G ST7920 font asset contract.
 */

import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const FONT_PATH = path.resolve(__dirname, '../../webview/tec1g/st7920-font.bin');

describe('tec1g ST7920 font asset', () => {
  it('stores the 128 glyph x 16 row font payload as a 2048-byte binary asset', () => {
    const bytes = fs.readFileSync(FONT_PATH);

    expect(bytes).toHaveLength(128 * 16);
  });
});
