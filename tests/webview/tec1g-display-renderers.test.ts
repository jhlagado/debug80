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
  lastImageData?: { data: Uint8ClampedArray };
  putImageData: ReturnType<typeof vi.fn>;
};

function buildDom(): Document {
  const html = fs.readFileSync(HTML_PATH, 'utf8').replace(/\{\{\w+\}\}/g, '');
  document.documentElement.innerHTML = html;
  return document;
}

function createContext(): FakeContext2d {
  const ctx: FakeContext2d = {
    clearRect: vi.fn(),
    createImageData: vi.fn((width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
    })),
    drawImage: vi.fn(),
    imageSmoothingEnabled: true,
    putImageData: vi.fn(),
  };
  ctx.putImageData = vi.fn((image: { data: Uint8ClampedArray }) => {
    ctx.lastImageData = image;
  });
  return ctx;
}

function readRgb(image: { data: Uint8ClampedArray }, width: number, x: number, y: number) {
  const offset = (y * width + x) * 4;
  return [image.data[offset], image.data[offset + 1], image.data[offset + 2]];
}

function expectRgb(
  image: { data: Uint8ClampedArray },
  width: number,
  x: number,
  y: number,
  rgb: [number, number, number],
) {
  expect(readRgb(image, width, x, y)).toEqual(rgb);
}

function lastGlcdImage(canvas: HTMLCanvasElement & { __ctx: FakeContext2d }) {
  const baseCanvas = canvas.__ctx.drawImage.mock.calls.at(-1)?.[0] as
    | (HTMLCanvasElement & { __ctx?: FakeContext2d })
    | undefined;
  const image = baseCanvas?.__ctx?.lastImageData;
  expect(image).toBeDefined();
  return image!;
}

function lastLcdImage(canvas: HTMLCanvasElement & { __ctx: FakeContext2d }) {
  const image = canvas.__ctx.lastImageData;
  expect(image).toBeDefined();
  return image!;
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

  it('renders the GLCD cursor underline at the shifted display position', () => {
    const glcdRenderer = createGlcdRenderer();
    const canvas = document.getElementById('glcdCanvas') as HTMLCanvasElement & {
      __ctx: FakeContext2d;
    };

    glcdRenderer.applyGlcdUpdate({
      glcdState: {
        cursorOn: true,
        ddramAddr: 0x80,
        ddramPhase: 0,
        displayOn: true,
        graphicsOn: false,
        textShift: 0,
      },
    });
    const unshifted = lastGlcdImage(canvas);
    expectRgb(unshifted, 128, 0, 15, [32, 58, 22]);

    glcdRenderer.applyGlcdUpdate({
      glcdState: {
        cursorOn: true,
        ddramAddr: 0x80,
        ddramPhase: 0,
        displayOn: true,
        graphicsOn: false,
        textShift: 1,
      },
    });
    const shifted = lastGlcdImage(canvas);
    expectRgb(shifted, 128, 0, 15, [158, 182, 99]);
  });

  it('renders the LCD cursor underline at the shifted display position', () => {
    lcdRenderer = createLcdRenderer();
    const canvas = document.getElementById('lcdCanvas') as HTMLCanvasElement & {
      __ctx: FakeContext2d;
    };

    lcdRenderer.applyLcdUpdate({
      lcdState: {
        cursorAddr: 0x80,
        cursorOn: true,
        displayOn: true,
        displayShift: 1,
      },
    });

    const image = lastLcdImage(canvas);
    expectRgb(image, canvas.width, 1, 15, [11, 26, 16]);
    expectRgb(image, canvas.width, 229, 15, [180, 245, 180]);
  });
});
