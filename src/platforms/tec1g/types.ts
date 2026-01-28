export type Tec1gSpeedMode = 'slow' | 'fast';

export interface Tec1gUpdatePayload {
  digits: number[];
  matrix: number[];
  glcd: number[];
  speaker: number;
  speedMode: Tec1gSpeedMode;
  lcd: number[];
  speakerHz?: number;
}
