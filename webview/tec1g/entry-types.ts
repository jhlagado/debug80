/**
 * @file Message and payload types for the TEC-1G webview entry bundle.
 */

import type { ProjectStatusPayload } from '../../src/contracts/platform-view';
import type { SessionStatus } from '../common/session-status';

export type Tec1gPanelTab = 'ui' | 'memory';
export type Tec1gSpeedMode = 'slow' | 'fast';

export type Tec1gUpdatePayload = {
  digits?: number[];
  matrix?: number[];
  matrixGreen?: number[];
  matrixBlue?: number[];
  matrixBrightness?: number[];
  matrixBrightnessG?: number[];
  matrixBrightnessB?: number[];
  matrixMode?: boolean;
  glcd?: number[];
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
  speaker?: boolean | number;
  speakerHz?: number;
  speedMode?: Tec1gSpeedMode;
  sysCtrl?: number;
  bankA14?: boolean;
  capsLock?: boolean;
  lcdState?: {
    displayOn?: boolean;
    cursorOn?: boolean;
    cursorBlink?: boolean;
    cursorAddr?: number;
    displayShift?: number;
  };
  lcdCgram?: number[];
  lcd?: number[];
};

export type MemorySnapshotPayload = {
  symbols?: Array<{ name: string; address: number }>;
  registers?: Record<string, number | string | undefined>;
  running?: boolean;
  views?: Array<{
    id: string;
    address?: number;
    start: number;
    bytes: number[];
    focus?: number;
    symbol?: string;
    symbolOffset?: number;
  }>;
};

export type IncomingMessage =
  | { type: 'selectTab'; tab: string }
  | { type: 'sessionStatus'; status: SessionStatus }
  | {
      type: 'projectStatus';
      rootName?: string;
      rootPath?: string;
      hasProject?: boolean;
      targetName?: string;
      entrySource?: string;
      roots: ProjectStatusPayload['roots'];
      targets: ProjectStatusPayload['targets'];
    }
  | { type: 'uiVisibility'; visibility: Record<string, boolean>; persist?: boolean }
  | ({ type: 'update'; uiRevision?: number } & Tec1gUpdatePayload)
  | ({ type: 'snapshot' } & MemorySnapshotPayload)
  | { type: 'snapshotError'; message?: string };
