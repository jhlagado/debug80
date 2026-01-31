/**
 * @file TEC-1G platform type definitions.
 */

export type Tec1gSpeedMode = 'slow' | 'fast';

export interface Tec1gUpdatePayload {
  digits: number[];
  matrix: number[];
  glcd: number[];
  speaker: number;
  speedMode: Tec1gSpeedMode;
  lcd: number[];
  sysCtrl?: number;
  glcdDdram?: number[];
  glcdState?: {
    displayOn?: boolean;
    graphicsOn?: boolean;
    cursorOn?: boolean;
    cursorBlink?: boolean;
    blinkVisible?: boolean;
    ddramAddr?: number;
    ddramPhase?: number;
    textShift?: number;
    scroll?: number;
    reverseMask?: number;
  };
  speakerHz?: number;
}
