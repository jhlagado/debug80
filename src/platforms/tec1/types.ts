export type Tec1SpeedMode = 'slow' | 'fast';

export interface Tec1UpdatePayload {
  digits: number[];
  speaker: number;
  speedMode: Tec1SpeedMode;
  speakerHz?: number;
}
