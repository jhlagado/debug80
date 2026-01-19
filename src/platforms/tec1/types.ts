export type Tec1SpeedMode = 'slow' | 'fast';

export interface Tec1UpdatePayload {
  digits: number[];
  speaker: number;
  speedMode: Tec1SpeedMode;
  speakerHz?: number;
}

export interface Tec1SerialDebugPayload {
  stage: 'send' | 'read' | 'poll' | 'arm' | 'start' | 'summary' | 'empty';
  firstByte: number | null;
  sendCycle?: number;
  readCycle?: number;
  startCycle?: number;
  leadCycles?: number;
  queueLen?: number;
  pending?: boolean;
}
