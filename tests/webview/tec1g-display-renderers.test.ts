/**
 * @file Regression tests: TEC-1G LCD/GLCD renderer contracts.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createGlcdRenderer } from '../../webview/tec1g/glcd-renderer';
import { createLcdRenderer, type LcdRenderer } from '../../webview/tec1g/lcd-renderer';

const HTML_PATH = path.resolve(__dirname, '../../webview/tec1g/index.html');

type FakeContext2d = {
  clearRect: ReturnType<typeof vi.fn>;
  createImageData: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
  imageSmoothingEnabled: boolean;
  putImageData: ReturnType<typeof vi.fn>;
};

function buildDom(): Document {
  const html = fs.readFileSync(HTML_PATH, 'utf8').replace(/\{\{\w+\}\}/g, '');
  document.documentElement.innerHTML = html;
  return document;
}

function createContext(): FakeContext2d {
  return {
    clearRect: vi.fn(),
    createImageData: vi.fn((width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
    })),
    drawImage: vi.fn(),
    imageSmoothingEnabled: true,
    putImageData: vi.fn(),
  };
}

describe('tec1g display renderers', () => {
  const originalGetContextDescriptor = Object.getOwnPropertyDescriptor(
    HTMLCanvasElement.prototype,
    'getContext'
  );
  let lcdRenderer: LcdRenderer | null = null;

  beforeEach(() => {
    buildDom();
    vi.useFakeTimers();
    HTMLCanvasElement.prototype.getContext = function getContext() {
      const canvas = this as HTMLCanvasElement & { __ctx?: FakeContext2d };
      canvas.__ctx ??= createContext();
      return canvas.__ctx as never;
    };
  });

  afterEach(() => {
    lcdRenderer?.dispose();
    lcdRenderer = null;
    if (originalGetContextDescriptor) {
      Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', originalGetContextDescriptor);
    }
    vi.useRealTimers();
  });

  it('renders LCD updates and redraws for cursor blink changes', () => {
    lcdRenderer = createLcdRenderer();
    const canvas = document.getElementById('lcdCanvas') as HTMLCanvasElement & {
      __ctx: FakeContext2d;
    };

    lcdRenderer.applyLcdUpdate({
      lcd: [0x41],
      lcdCgram: [0x1f],
      lcdState: { cursorAddr: 0x80, cursorBlink: true, displayOn: true },
    });
    vi.advanceTimersByTime(500);

    expect(canvas.width).toBeGreaterThan(0);
    expect(canvas.height).toBeGreaterThan(0);
    expect(canvas.__ctx.putImageData).toHaveBeenCalledTimes(2);
  });

  it('renders GLCD updates through the visible canvas context', () => {
    const glcdRenderer = createGlcdRenderer();
    const canvas = document.getElementById('glcdCanvas') as HTMLCanvasElement & {
      __ctx: FakeContext2d;
    };

    glcdRenderer.applyGlcdUpdate({
      glcd: [0xff],
      glcdDdram: [0x41],
      glcdState: {
        cursorOn: true,
        ddramAddr: 0x80,
        ddramPhase: 1,
        displayOn: true,
        graphicsOn: true,
        reverseMask: 1,
        scroll: 2,
        textShift: 1,
      },
    });

    expect(canvas.__ctx.clearRect).toHaveBeenCalledTimes(1);
    expect(canvas.__ctx.drawImage).toHaveBeenCalledTimes(1);
  });
});
