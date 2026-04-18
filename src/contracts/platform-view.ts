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
  /** Effective stop-on-entry for the current target (merged from target + project root). */
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
  | { type: 'serialClear' };

export type PlatformViewInboundMessage =
  | PlatformViewControlMessage
  | Tec1Message
  | Tec1gMessage
  | { type?: string; [key: string]: unknown };
