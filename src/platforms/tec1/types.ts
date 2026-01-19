export type Tec1SpeedMode = 'slow' | 'fast';

export interface Tec1UpdatePayload {
  digits: number[];
  speaker: number;
  speedMode: Tec1SpeedMode;
  speakerHz?: number;
}

export interface Tec1SerialDebugPayload {
  firstByte: number;
  sendCycle: number;
  readCycle: number | null;
  startCycle: number | null;
  leadCycles: number;
  queueLen: number;
}
