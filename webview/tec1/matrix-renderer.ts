export type Tec1MatrixPayload = {
  matrix?: number[];
};

export interface Tec1MatrixRenderer {
  applyMatrixUpdate(payload: Tec1MatrixPayload): void;
  build(): void;
  draw(): void;
}

function copyPadded(source: number[], size: number, fill: number): number[] {
  const values = source.slice(0, size);
  while (values.length < size) {
    values.push(fill);
  }
  return values;
}

export function createMatrixRenderer(): Tec1MatrixRenderer {
  const matrixGrid = document.getElementById('matrixGrid') as HTMLElement | null;
  let matrixRows = new Array(8).fill(0);

  const build = (): void => {
    if (!matrixGrid) {
      return;
    }
    matrixGrid.innerHTML = '';
    for (let row = 0; row < 8; row += 1) {
      for (let col = 0; col < 8; col += 1) {
        const dot = document.createElement('div');
        dot.className = 'matrix-dot';
        dot.dataset.row = String(row);
        dot.dataset.col = String(col);
        matrixGrid.appendChild(dot);
      }
    }
  };

  const draw = (): void => {
    if (!matrixGrid) {
      return;
    }
    const dots = matrixGrid.querySelectorAll<HTMLElement>('.matrix-dot');
    dots.forEach((dot) => {
      const row = parseInt(dot.dataset.row || '0', 10);
      const col = parseInt(dot.dataset.col || '0', 10);
      const mask = 1 << col;
      dot.classList.toggle('on', (matrixRows[row] & mask) !== 0);
    });
  };

  return {
    applyMatrixUpdate(payload: Tec1MatrixPayload): void {
      if (!Array.isArray(payload.matrix)) {
        return;
      }
      matrixRows = copyPadded(payload.matrix, 8, 0);
      draw();
    },
    build,
    draw,
  };
}
