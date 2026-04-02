/**
 * @file Regression tests: TEC-1 LCD/matrix renderer contracts.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createLcdRenderer } from '../../webview/tec1/lcd-renderer';
import { createMatrixRenderer } from '../../webview/tec1/matrix-renderer';

const HTML_PATH = path.resolve(__dirname, '../../webview/tec1/index.html');

type FakeContext2d = {
  fillRect: ReturnType<typeof vi.fn>;
  fillText: ReturnType<typeof vi.fn>;
  fillStyle: string;
  font: string;
  textBaseline: CanvasTextBaseline;
};

function buildDom(): Document {
  const html = fs.readFileSync(HTML_PATH, 'utf8').replace(/\{\{\w+\}\}/g, '');
  document.documentElement.innerHTML = html;
  return document;
}

function createContext(): FakeContext2d {
  return {
    fillRect: vi.fn(),
    fillText: vi.fn(),
    fillStyle: '',
    font: '',
    textBaseline: 'top',
  };
}

describe('tec1 display renderers', () => {
  beforeEach(() => {
    buildDom();
    HTMLCanvasElement.prototype.getContext = function getContext() {
      const canvas = this as HTMLCanvasElement & { __ctx?: FakeContext2d };
      canvas.__ctx ??= createContext();
      return canvas.__ctx as never;
    };
  });

  it('renders LCD updates to the visible canvas', () => {
    const renderer = createLcdRenderer();
    const canvas = document.getElementById('lcdCanvas') as HTMLCanvasElement & {
      __ctx: FakeContext2d;
    };

    renderer.applyLcdUpdate({ lcd: [0x41] });

    expect(canvas.width).toBeGreaterThan(0);
    expect(canvas.height).toBeGreaterThan(0);
    expect(canvas.__ctx.fillRect).toHaveBeenCalledTimes(1);
    expect(canvas.__ctx.fillText).toHaveBeenCalled();
  });

  it('builds the matrix grid and lights updated cells', () => {
    const renderer = createMatrixRenderer();
    const grid = document.getElementById('matrixGrid') as HTMLElement;

    renderer.build();
    renderer.applyMatrixUpdate({ matrix: [0x01] });

    expect(grid.querySelectorAll('.matrix-dot')).toHaveLength(64);
    expect(grid.querySelector('[data-row="0"][data-col="0"]')?.classList.contains('on')).toBe(true);
    expect(grid.querySelector('[data-row="0"][data-col="1"]')?.classList.contains('on')).toBe(false);
  });
});
