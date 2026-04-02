import { A00 } from './hd44780-a00';

const LCD_COLS = 20;
const LCD_ROWS = 4;
const LCD_BYTES = LCD_COLS * LCD_ROWS;
const LCD_CGRAM_BYTES = 64;

type LcdPayload = {
  lcd?: number[];
  lcdCgram?: number[];
  lcdState?: { displayOn?: boolean; cursorOn?: boolean; cursorBlink?: boolean; cursorAddr?: number; displayShift?: number; };
};

export interface LcdRenderer { applyLcdUpdate(payload: LcdPayload): void; dispose(): void; draw(): void; }

const copyPadded = (source: number[], size: number, fill: number) => {
  const values = source.slice(0, size);
  while (values.length < size) values.push(fill);
  return values;
};

export function createLcdRenderer(): LcdRenderer {
  const canvas = document.getElementById('lcdCanvas') as HTMLCanvasElement | null;
  const ctx = canvas?.getContext('2d') ?? null;
  let bytes = new Array(LCD_BYTES).fill(0x20);
  let cgram = new Array(LCD_CGRAM_BYTES).fill(0x00);
  let displayOn = true;
  let cursorOn = false;
  let cursorBlink = false;
  let cursorAddr = 0x80;
  let displayShift = 0;
  let cursorBlinkVisible = true;
  let cursorBlinkTimer: number | null = null;

  const getIndex = (addr: number) => {
    const masked = addr & 0xff;
    if (masked >= 0x80 && masked <= 0x93) return masked - 0x80;
    if (masked >= 0xc0 && masked <= 0xd3) return 20 + (masked - 0xc0);
    if (masked >= 0x94 && masked <= 0xa7) return 40 + (masked - 0x94);
    if (masked >= 0xd4 && masked <= 0xe7) return 60 + (masked - 0xd4);
    return -1;
  };

  const draw = () => {
    if (!ctx || !canvas) return;
    const dot = 2;
    const cellW = 5 * dot + 2;
    const cellH = 8 * dot + 2;
    const width = LCD_COLS * cellW;
    const height = LCD_ROWS * cellH;
    canvas.width = width;
    canvas.height = height;
    canvas.style.width = '';
    canvas.style.height = '';
    const image = ctx.createImageData(width, height);
    const data = image.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 11; data[i + 1] = 26; data[i + 2] = 16; data[i + 3] = 255;
    }
    const cursorVisible = displayOn && (cursorOn || (cursorBlink && cursorBlinkVisible));
    const cursorIndex = getIndex(cursorAddr);
    for (let row = 0; row < LCD_ROWS; row += 1) {
      for (let col = 0; col < LCD_COLS; col += 1) {
        const index = row * LCD_COLS + ((col + displayShift + LCD_COLS) % LCD_COLS);
        const charCode = displayOn ? ((bytes[index] || 0x20) & 0xff) : 0x20;
        const ox = col * cellW + 1;
        const oy = row * cellH + 1;
        for (let dy = 0; dy < 8; dy += 1) {
          let bits = A00[charCode * 8 + dy] || 0;
          if (charCode < 0x08) bits = cgram[charCode * 8 + dy] || 0;
          for (let dx = 0; dx < 5; dx += 1) {
            if ((bits & (0x10 >> dx)) === 0) continue;
            for (let py = 0; py < dot; py += 1) {
              for (let px = 0; px < dot; px += 1) {
                const pixel = ((oy + dy * dot + py) * width + (ox + dx * dot + px)) * 4;
                if (pixel >= data.length - 3) continue;
                data[pixel] = 180; data[pixel + 1] = 245; data[pixel + 2] = 180;
              }
            }
          }
        }
        if (!cursorVisible || cursorIndex !== index) continue;
        for (let dx = 0; dx < 5; dx += 1) {
          for (let py = 0; py < dot; py += 1) {
            for (let px = 0; px < dot; px += 1) {
              const pixel = ((oy + 7 * dot + py) * width + (ox + dx * dot + px)) * 4;
              data[pixel] = 180; data[pixel + 1] = 245; data[pixel + 2] = 180;
            }
          }
        }
      }
    }
    ctx.putImageData(image, 0, 0);
  };

  const updateCursorBlink = () => {
    if (cursorBlinkTimer !== null) clearInterval(cursorBlinkTimer);
    cursorBlinkVisible = true;
    cursorBlinkTimer = null;
    if (!cursorBlink) return;
    cursorBlinkTimer = window.setInterval(() => {
      cursorBlinkVisible = !cursorBlinkVisible;
      draw();
    }, 500);
  };

  return {
    applyLcdUpdate(payload) {
      let shouldDraw = false;
      if (Array.isArray(payload.lcd)) { bytes = copyPadded(payload.lcd, LCD_BYTES, 0x20); shouldDraw = true; }
      if (Array.isArray(payload.lcdCgram)) { cgram = copyPadded(payload.lcdCgram, LCD_CGRAM_BYTES, 0x00); shouldDraw = true; }
      if (payload.lcdState && typeof payload.lcdState === 'object') {
        if (typeof payload.lcdState.displayOn === 'boolean') displayOn = payload.lcdState.displayOn;
        if (typeof payload.lcdState.cursorOn === 'boolean') cursorOn = payload.lcdState.cursorOn;
        if (typeof payload.lcdState.cursorBlink === 'boolean') cursorBlink = payload.lcdState.cursorBlink;
        if (typeof payload.lcdState.cursorAddr === 'number') cursorAddr = payload.lcdState.cursorAddr & 0xff;
        if (typeof payload.lcdState.displayShift === 'number') {
          const shift = Math.trunc(payload.lcdState.displayShift || 0);
          displayShift = ((shift % LCD_COLS) + LCD_COLS) % LCD_COLS;
        }
        updateCursorBlink();
        shouldDraw = true;
      }
      if (shouldDraw) draw();
    },
    dispose() { if (cursorBlinkTimer !== null) clearInterval(cursorBlinkTimer); },
    draw,
  };
}
