import type { Tec1Message } from '../platforms/tec1/ui-panel-messages';
import type { Tec1gMessage } from '../platforms/tec1g/ui-panel-messages';

export type PlatformId = 'simple' | 'tec1' | 'tec1g';

export type ProjectStatusPayload = {
  rootName?: string;
  rootPath?: string;
  projectState?: 'noWorkspace' | 'uninitialized' | 'initialized';
  hasProject?: boolean;
  targetName?: string;
  entrySource?: string;
  platform?: string;
  /** Panel stop-on-entry toggle for this window session (not read from or written to debug80.json). */
  stopOnEntry?: boolean;
  roots: Array<{
    name: string;
    path: string;
    hasProject: boolean;
  }>;
  targets: Array<{
    name: string;
    description?: string;
    detail?: string;
  }>;
};

export type PlatformViewControlMessage =
  | { type: 'startDebug'; rootPath?: string }
  | { type: 'restartDebug' }
  | { type: 'createProject'; rootPath?: string; platform?: string }
  | { type: 'openWorkspaceFolder' }
  | { type: 'selectProject'; rootPath?: string }
  | { type: 'configureProject' }
  | { type: 'saveProjectConfig'; platform: string }
  | { type: 'setStopOnEntry'; stopOnEntry: boolean }
  | { type: 'selectTarget'; rootPath?: string; targetName?: string }
  | { type: 'setEntrySource' }
  | { type: 'serialSendFile' }
  | { type: 'serialSave'; text: string }
  | { type: 'serialClear' }
  | { type: 'saveTec1gPanelVisibility'; targetName?: string; visibility: Record<string, boolean> };

export type PlatformViewInboundMessage =
  | PlatformViewControlMessage
  | Tec1Message
  | Tec1gMessage
  | { type?: string; [key: string]: unknown };
