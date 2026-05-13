/**
 * @file TEC-1G runtime lifecycle helpers (speaker silence and reset orchestration).
 */

import { decodeSysCtrl } from './sysctrl';
import { TEC1G_MASK_BYTE } from './constants';
import type { Tec1gState } from './runtime-state';

type ResetControllers = {
  lcd: { reset: () => void };
  glcd: { reset: () => void };
  serial: { reset: () => void };
};

/**
 * Clears speaker state and cancels pending silence timer.
 */
export function silenceTec1gSpeaker(state: Tec1gState, queueUpdate: () => void): void {
  const { audio, timing } = state;
  if (audio.speakerHz === 0 && !audio.speaker) {
    return;
  }
  audio.speakerHz = 0;
  audio.speaker = false;
  audio.lastEdgeCycle = null;
  if (audio.silenceEventId !== null) {
    timing.cycleClock.cancel(audio.silenceEventId);
    audio.silenceEventId = null;
  }
  queueUpdate();
}

/**
 * Resets display/input/system state while preserving configured defaults.
 */
export function resetTec1gRuntimeState(
  state: Tec1gState,
  defaults: {
    matrixMode: boolean;
    sysCtrl: number;
    gimpSignal: boolean;
    cartridgePresent: boolean;
  },
  controllers: ResetControllers,
  queueUpdate: () => void
): void {
  const { display, input, audio, timing, system } = state;
  audio.speaker = false;
  audio.speakerHz = 0;
  audio.lastEdgeCycle = null;
  controllers.lcd.reset();
  display.ledMatrixRedRows.fill(0);
  display.ledMatrixGreenRows.fill(0);
  display.ledMatrixBlueRows.fill(0);
  display.ledMatrixBrightnessR.fill(0);
  display.ledMatrixBrightnessG.fill(0);
  display.ledMatrixBrightnessB.fill(0);
  display.matrixStagingR.fill(0);
  display.matrixStagingG.fill(0);
  display.matrixStagingB.fill(0);
  display.matrixRowsVisitedMask = 0;
  display.matrixLastActivityCycle = -1;
  display.ledMatrixRowLatch = 0;
  display.ledMatrixRedLatch = 0;
  display.ledMatrixGreenLatch = 0;
  display.ledMatrixBlueLatch = 0;
  input.matrixKeyStates.fill(TEC1G_MASK_BYTE);
  input.matrixModeEnabled = defaults.matrixMode;
  controllers.glcd.reset();
  system.sysCtrl = defaults.sysCtrl;
  const decoded = decodeSysCtrl(system.sysCtrl);
  system.shadowEnabled = decoded.shadowEnabled;
  system.protectEnabled = decoded.protectEnabled;
  system.expandEnabled = decoded.expandEnabled;
  system.bankA14 = decoded.bankA14;
  system.capsLock = decoded.capsLock;
  input.shiftKeyActive = false;
  input.rawKeyActive = false;
  system.gimpSignal = defaults.gimpSignal;
  system.cartridgePresent = defaults.cartridgePresent;
  if (audio.silenceEventId !== null) {
    timing.cycleClock.cancel(audio.silenceEventId);
    audio.silenceEventId = null;
  }
  controllers.serial.reset();
  queueUpdate();
}
