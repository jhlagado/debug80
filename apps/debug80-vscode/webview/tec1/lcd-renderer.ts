const LCD_COLS = 16;
const LCD_ROWS = 2;
const LCD_CELL_W = 14;
const LCD_CELL_H = 20;
const LCD_BYTES = LCD_COLS * LCD_ROWS;

export type Tec1LcdPayload = {
  lcd?: number[];
};

export interface Tec1LcdRenderer {
  applyLcdUpdate(payload: Tec1LcdPayload): void;
  draw(): void;
}

function lcdByteToChar(value: number): string {
  const code = value & 0xff;
  if (code === 0x5c) {
    return '¥';
  }
  if (code === 0x7e) {
    return '▶';
  }
  if (code === 0x7f) {
    return '◀';
  }
  if (code >= 0x20 && code <= 0x7e) {
    return String.fromCharCode(code);
  }
  return ' ';
}

function copyPadded(source: number[], size: number, fill: number): number[] {
  const values = source.slice(0, size);
  while (values.length < size) {
    values.push(fill);
  }
  return values;
}

export function createLcdRenderer(): Tec1LcdRenderer {
  const canvas = document.getElementById('lcdCanvas') as HTMLCanvasElement | null;
  const ctx = canvas?.getContext('2d') ?? null;
  let lcdBytes = new Array(LCD_BYTES).fill(0x20);

  const draw = (): void => {
    if (!ctx || !canvas) {
      return;
    }
    canvas.width = LCD_COLS * LCD_CELL_W;
    canvas.height = LCD_ROWS * LCD_CELL_H;
    ctx.fillStyle = '#0b1a10';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = '16px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#b4f5b4';
    for (let row = 0; row < LCD_ROWS; row += 1) {
      for (let col = 0; col < LCD_COLS; col += 1) {
        const idx = row * LCD_COLS + col;
        const char = lcdByteToChar(lcdBytes[idx] || 0x20);
        ctx.fillText(char, col * LCD_CELL_W + 2, row * LCD_CELL_H + 2);
      }
    }
  };

  return {
    applyLcdUpdate(payload: Tec1LcdPayload): void {
      if (!Array.isArray(payload.lcd)) {
        return;
      }
      lcdBytes = copyPadded(payload.lcd, LCD_BYTES, 0x20);
      draw();
    },
    draw,
  };
}
