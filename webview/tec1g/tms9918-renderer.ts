/**
 * @file Canvas renderer for the TEC-1G TMS9918/TMS9929 video panel.
 */

import type { Tec1gUpdatePayload } from './entry-types';

const WIDTH = 256;
const HEIGHT = 192;

export function createTms9918Renderer() {
  const canvas = document.getElementById('tms9918Canvas') as HTMLCanvasElement | null;
  const standardSelect = document.getElementById('tms9918Standard') as HTMLSelectElement | null;
  const ctx = canvas?.getContext('2d') ?? null;
  const image = ctx?.createImageData(WIDTH, HEIGHT) ?? null;

  function drawBlank(): void {
    if (!ctx || !canvas) {
      return;
    }
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function applyTms9918Update(payload: Tec1gUpdatePayload): void {
    const tms = payload.tms9918;
    if (!tms) {
      return;
    }
    if (standardSelect && standardSelect.value !== tms.videoStandard) {
      standardSelect.value = tms.videoStandard;
    }
    if (!ctx || !canvas || !image || !tms.active) {
      drawBlank();
      return;
    }
    const framebuffer = tms.framebuffer;
    if (!Array.isArray(framebuffer) || framebuffer.length < WIDTH * HEIGHT) {
      drawBlank();
      return;
    }
    for (let i = 0; i < WIDTH * HEIGHT; i += 1) {
      const rgb = framebuffer[i] ?? 0;
      const offset = i * 4;
      image.data[offset] = (rgb >> 16) & 0xff;
      image.data[offset + 1] = (rgb >> 8) & 0xff;
      image.data[offset + 2] = rgb & 0xff;
      image.data[offset + 3] = 0xff;
    }
    const bitmap = document.createElement('canvas');
    bitmap.width = WIDTH;
    bitmap.height = HEIGHT;
    const bitmapCtx = bitmap.getContext('2d');
    if (!bitmapCtx) {
      return;
    }
    bitmapCtx.putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  }

  return {
    drawBlank,
    applyTms9918Update,
    standardSelect,
  };
}
