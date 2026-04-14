/**
 * @file TEC-1G LED matrix staging and commit behavior.
 */

import { millisecondsToClocks } from '../tec-common';
import { TEC1G_MASK_BYTE } from './constants';
import type { Tec1gState } from './runtime-state';

/** If no matrix port OUT for this long, commit partial staging (~25 fps). */
const TEC1G_MATRIX_IDLE_FLUSH_MS = 40;

/**
 * Matrix display: accumulate row RGB into staging; commit when all rows visited.
 */
export function handleMatrixPortWrite(
  display: Tec1gState['display'],
  timing: Tec1gState['timing'],
  kind: 'row' | 'rgb',
  queueUpdate: () => void
): void {
  accumulateMatrixStagingFromRows(display);
  display.matrixLastActivityCycle = timing.cycleClock.now();
  if (kind !== 'row') {
    return;
  }
  const rowSel = display.ledMatrixRowLatch & TEC1G_MASK_BYTE;
  if (rowSel !== 0) {
    display.matrixRowsVisitedMask |= rowSel;
  }
  if (display.matrixRowsVisitedMask === TEC1G_MASK_BYTE) {
    commitMatrixStaging(display);
    display.matrixRowsVisitedMask = 0;
    display.matrixLastActivityCycle = -1;
    queueUpdate();
  }
}

/**
 * Commits matrix staging on activity timeout to avoid partial-frame stalling.
 */
export function maybeCommitMatrixOnIdle(
  display: Tec1gState['display'],
  timing: Tec1gState['timing'],
  queueUpdate: () => void
): void {
  if (display.matrixLastActivityCycle < 0) {
    return;
  }
  const idleCycles = millisecondsToClocks(timing.clockHz, TEC1G_MATRIX_IDLE_FLUSH_MS);
  if (idleCycles <= 0) {
    return;
  }
  if (timing.cycleClock.now() - display.matrixLastActivityCycle < idleCycles) {
    return;
  }
  commitMatrixStaging(display);
  display.matrixRowsVisitedMask = 0;
  display.matrixLastActivityCycle = -1;
  queueUpdate();
}

/**
 *
 */
function accumulateMatrixStagingFromRows(display: Tec1gState['display']): void {
  const rowMask = display.ledMatrixRowLatch & TEC1G_MASK_BYTE;
  const { ledMatrixRedRows, ledMatrixGreenRows, ledMatrixBlueRows } = display;
  for (let row = 0; row < 8; row += 1) {
    if ((rowMask & (1 << row)) === 0) {
      continue;
    }
    const base = row * 8;
    const rPlane = ledMatrixRedRows[row] ?? 0;
    const gPlane = ledMatrixGreenRows[row] ?? 0;
    const bPlane = ledMatrixBlueRows[row] ?? 0;
    for (let col = 0; col < 8; col += 1) {
      const bit = 1 << col;
      const idx = base + col;
      display.matrixStagingR[idx] = (rPlane & bit) !== 0 ? 255 : 0;
      display.matrixStagingG[idx] = (gPlane & bit) !== 0 ? 255 : 0;
      display.matrixStagingB[idx] = (bPlane & bit) !== 0 ? 255 : 0;
    }
  }
}

/**
 *
 */
function commitMatrixStaging(display: Tec1gState['display']): void {
  for (let i = 0; i < 64; i += 1) {
    display.ledMatrixBrightnessR[i] = display.matrixStagingR[i] ?? 0;
    display.ledMatrixBrightnessG[i] = display.matrixStagingG[i] ?? 0;
    display.ledMatrixBrightnessB[i] = display.matrixStagingB[i] ?? 0;
  }
  display.matrixStagingR.fill(0);
  display.matrixStagingG.fill(0);
  display.matrixStagingB.fill(0);
}
