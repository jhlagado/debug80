import ST7920_FONT from './st7920-font.bin';

const GLCD_WIDTH = 128;
const GLCD_HEIGHT = 64;
const GLCD_BYTES = 1024;
const GLCD_DDRAM_SIZE = 64;
const GLCD_TEXT_COLS = 16;
const GLCD_TEXT_ROWS = 4;

type GlcdPayload = {
  glcd?: number[];
  glcdDdram?: number[];
  glcdState?: {
    displayOn?: boolean; graphicsOn?: boolean; cursorOn?: boolean; cursorBlink?: boolean;
    blinkVisible?: boolean; ddramAddr?: number; ddramPhase?: number; textShift?: number;
    scroll?: number; reverseMask?: number;
  };
};

export interface GlcdRenderer { applyGlcdUpdate(payload: GlcdPayload): void; draw(): void; }

const copyPadded = (source: number[], size: number, fill: number) => {
  const values = source.slice(0, size);
  while (values.length < size) values.push(fill);
  return values;
};

export function createGlcdRenderer(): GlcdRenderer {
  const canvas = document.getElementById('glcdCanvas') as HTMLCanvasElement | null;
  const ctx = canvas?.getContext('2d') ?? null;
  const baseCanvas = ctx ? document.createElement('canvas') : null;
  const baseCtx = baseCanvas?.getContext('2d') ?? null;
  if (baseCanvas) { baseCanvas.width = GLCD_WIDTH; baseCanvas.height = GLCD_HEIGHT; }
  const image = baseCtx && baseCanvas ? baseCtx.createImageData(GLCD_WIDTH, GLCD_HEIGHT) : null;
  let ddram = new Array(GLCD_DDRAM_SIZE).fill(0x20);
  let displayOn = true;
  let graphicsOn = true;
  let cursorOn = false;
  let cursorBlink = false;
  let cursorAddr = 0x80;
  let cursorPhase = 0;
  let textShift = 0;
  let scroll = 0;
  let reverseMask = 0;
  let blinkVisible = true;
  let bytes = new Array(GLCD_BYTES).fill(0x00);

  const draw = () => {
    if (!ctx || !canvas || !baseCtx || !baseCanvas || !image) return;
    const data = image.data;
    const shift = Math.max(-15, Math.min(15, Math.trunc(textShift || 0)));
    const scrollOffset = scroll & 0x3f;
    let ptr = 0;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 158; data[i + 1] = 182; data[i + 2] = 99; data[i + 3] = 255;
    }
    if (displayOn && graphicsOn) {
      for (let row = 0; row < GLCD_HEIGHT; row += 1) {
        const srcRow = (row + scrollOffset) & 0x3f;
        for (let colByte = 0; colByte < 16; colByte += 1) {
          const value = bytes[srcRow * 16 + colByte] || 0;
          for (let bit = 0; bit < 8; bit += 1) {
            const on = (value & (0x80 >> bit)) !== 0;
            data[ptr++] = on ? 32 : 158;
            data[ptr++] = on ? 58 : 182;
            data[ptr++] = on ? 22 : 99;
            data[ptr++] = 255;
          }
        }
      }
    }
    if (!displayOn) {
      baseCtx.putImageData(image, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(baseCanvas, 0, 0, canvas.width, canvas.height);
      return;
    }
    for (let textRow = 0; textRow < GLCD_TEXT_ROWS; textRow += 1) {
      for (let textCol = 0; textCol < GLCD_TEXT_COLS; textCol += 1) {
        const memoryCol = textCol + shift;
        if (memoryCol < 0 || memoryCol >= GLCD_TEXT_COLS) continue;
        const charCode = ddram[textRow * GLCD_TEXT_COLS + memoryCol] || 0x20;
        if (charCode === 0x20 || charCode === 0x00) continue;
        for (let dy = 0; dy < 16; dy += 1) {
          const bits = ST7920_FONT[(charCode & 0x7f) * 16 + dy] || 0;
          if (bits === 0) continue;
          for (let dx = 0; dx < 8; dx += 1) {
            if ((bits & (0x80 >> dx)) === 0) continue;
            const pixel = (((textRow * 16 + dy - scrollOffset + GLCD_HEIGHT) & 0x3f) * GLCD_WIDTH + textCol * 8 + dx) * 4;
            const lit = data[pixel] === 32 && data[pixel + 1] === 58 && data[pixel + 2] === 22;
            data[pixel] = graphicsOn && lit ? 158 : 32;
            data[pixel + 1] = graphicsOn && lit ? 182 : 58;
            data[pixel + 2] = graphicsOn && lit ? 99 : 22;
          }
        }
      }
    }
    for (let textRow = 0; textRow < GLCD_TEXT_ROWS; textRow += 1) {
      if ((reverseMask & (1 << textRow)) === 0) continue;
      for (let dy = 0; dy < 16; dy += 1) {
        const py = (textRow * 16 + dy - scrollOffset + GLCD_HEIGHT) & 0x3f;
        for (let px = 0; px < GLCD_WIDTH; px += 1) {
          const pixel = (py * GLCD_WIDTH + px) * 4;
          const lit = data[pixel] === 32 && data[pixel + 1] === 58 && data[pixel + 2] === 22;
          data[pixel] = lit ? 158 : 32;
          data[pixel + 1] = lit ? 182 : 58;
          data[pixel + 2] = lit ? 99 : 22;
        }
      }
    }
    if (cursorOn || (cursorBlink && blinkVisible)) {
      const addr = cursorAddr & 0x7f;
      const row = ((addr & 0x10) >> 4) | ((addr & 0x08) >> 2);
      const col = addr & 0x07;
      const dispCol = col * 2 + (cursorPhase ? 1 : 0) - shift;
      if (dispCol >= 0 && dispCol < GLCD_TEXT_COLS) {
        const underlineY = (row * 16 + 15 - scrollOffset + GLCD_HEIGHT) & 0x3f;
        for (let dx = 0; dx < 8; dx += 1) {
          const pixel = (underlineY * GLCD_WIDTH + dispCol * 8 + dx) * 4;
          data[pixel] = 32; data[pixel + 1] = 58; data[pixel + 2] = 22;
        }
      }
    }
    baseCtx.putImageData(image, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(baseCanvas, 0, 0, canvas.width, canvas.height);
  };

  return {
    applyGlcdUpdate(payload) {
      let shouldDraw = false;
      if (Array.isArray(payload.glcdDdram)) { ddram = copyPadded(payload.glcdDdram, GLCD_DDRAM_SIZE, 0x20); shouldDraw = true; }
      if (payload.glcdState && typeof payload.glcdState === 'object') {
        if (typeof payload.glcdState.displayOn === 'boolean') displayOn = payload.glcdState.displayOn;
        if (typeof payload.glcdState.graphicsOn === 'boolean') graphicsOn = payload.glcdState.graphicsOn;
        if (typeof payload.glcdState.cursorOn === 'boolean') cursorOn = payload.glcdState.cursorOn;
        if (typeof payload.glcdState.cursorBlink === 'boolean') cursorBlink = payload.glcdState.cursorBlink;
        if (typeof payload.glcdState.blinkVisible === 'boolean') blinkVisible = payload.glcdState.blinkVisible;
        if (typeof payload.glcdState.ddramAddr === 'number') cursorAddr = payload.glcdState.ddramAddr & 0xff;
        if (typeof payload.glcdState.ddramPhase === 'number') cursorPhase = payload.glcdState.ddramPhase ? 1 : 0;
        if (typeof payload.glcdState.textShift === 'number') textShift = payload.glcdState.textShift;
        if (typeof payload.glcdState.scroll === 'number') scroll = payload.glcdState.scroll & 0x3f;
        if (typeof payload.glcdState.reverseMask === 'number') reverseMask = payload.glcdState.reverseMask & 0x0f;
        shouldDraw = true;
      }
      if (Array.isArray(payload.glcd)) { bytes = copyPadded(payload.glcd, GLCD_BYTES, 0x00); shouldDraw = true; }
      if (shouldDraw) draw();
    },
    draw,
  };
}
