/**
 * @file TEC-1G LED matrix staging and commit behavior.
 */

import { millisecondsToClocks } from '../tec-common';
import { TEC1G_MASK_BYTE } from './constants';
import type { Tec1gState } from './runtime-state';

/** If no matrix port OUT for this long, commit partial staging (~25 fps). */
const TEC1G_MATRIX_IDLE_FLUSH_MS = 40;

/** Maps hardware column bits into left-to-right visible matrix pixels. */
function matrixDisplayIndex(row: number, hardwareColumn: number): number {
  return row * 8 + (7 - hardwareColumn);
}

/**
 * Matrix display: integrate RGB row drive over emulated cycles, then publish
 * duty-cycle brightness when a full scan or idle flush gives the UI a frame.
 */
export function handleMatrixPortWrite(
  display: Tec1gState['display'],
  timing: Tec1gState['timing'],
  kind: 'row' | 'rgb',
  queueUpdate: () => void
): void {
  const cycle = timing.cycleClock.now();
  display.matrixLastActivityCycle = cycle;
  if (kind !== 'row') {
    return;
  }
  const rowSel = display.ledMatrixRowLatch & TEC1G_MASK_BYTE;
  if (rowSel !== 0) {
    if ((display.matrixRowsVisitedMask & rowSel) !== 0 && display.matrixRowsVisitedMask === TEC1G_MASK_BYTE) {
      collectMatrixDutyBrightness(display, cycle);
      display.matrixRowsVisitedMask = 0;
      display.matrixLastActivityCycle = -1;
      queueUpdate();
    }
    display.matrixRowsVisitedMask |= rowSel;
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
  collectMatrixDutyBrightness(display, timing.cycleClock.now());
  display.matrixRowsVisitedMask = 0;
  display.matrixLastActivityCycle = -1;
  queueUpdate();
}

/**
 * Collects any currently accumulated matrix duty into display brightness.
 */
export function collectMatrixDutyBrightness(
  display: Tec1gState['display'],
  cycle: number
): void {
  accumulateMatrixDuty(display, cycle);
  const elapsedCycles = Math.max(1, cycle - display.matrixDutyWindowStartCycle);
  for (let i = 0; i < 64; i += 1) {
    display.ledMatrixBrightnessR[i] = dutyToByte(display.matrixDutyR[i] ?? 0, elapsedCycles);
    display.ledMatrixBrightnessG[i] = dutyToByte(display.matrixDutyG[i] ?? 0, elapsedCycles);
    display.ledMatrixBrightnessB[i] = dutyToByte(display.matrixDutyB[i] ?? 0, elapsedCycles);
  }
  display.matrixDutyR.fill(0);
  display.matrixDutyG.fill(0);
  display.matrixDutyB.fill(0);
  display.matrixDutyWindowStartCycle = cycle;
  display.matrixDutyLastCycle = cycle;
}

/**
 * Adds the elapsed active row/column drive time into the RGB duty buckets.
 */
export function accumulateMatrixDuty(display: Tec1gState['display'], cycle: number): void {
  const duration = Math.max(0, cycle - display.matrixDutyLastCycle);
  if (duration === 0) {
    return;
  }
  const rowMask = display.ledMatrixRowLatch & TEC1G_MASK_BYTE;
  const rPlane = display.ledMatrixRedLatch & TEC1G_MASK_BYTE;
  const gPlane = display.ledMatrixGreenLatch & TEC1G_MASK_BYTE;
  const bPlane = display.ledMatrixBlueLatch & TEC1G_MASK_BYTE;
  for (let row = 0; row < 8; row += 1) {
    if ((rowMask & (1 << row)) === 0) {
      continue;
    }
    for (let col = 0; col < 8; col += 1) {
      const bit = 1 << col;
      const idx = matrixDisplayIndex(row, col);
      if ((rPlane & bit) !== 0) {
        display.matrixDutyR[idx] += duration;
      }
      if ((gPlane & bit) !== 0) {
        display.matrixDutyG[idx] += duration;
      }
      if ((bPlane & bit) !== 0) {
        display.matrixDutyB[idx] += duration;
      }
    }
  }
  display.matrixDutyLastCycle = cycle;
}

/**
 * Converts an accumulated active-cycle count into an 8-bit brightness level.
 */
function dutyToByte(onCycles: number, elapsedCycles: number): number {
  return Math.max(0, Math.min(255, Math.round((onCycles / elapsedCycles) * 255)));
}
