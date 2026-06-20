import type { Tec1Message } from '../platforms/tec1/ui-panel-messages';
import type { Tec1gMessage } from '../platforms/tec1g/ui-panel-messages';

export type PlatformId = 'simple' | 'tec1' | 'tec1g';
export type AzmPanelRegisterContractsMode = 'enforce' | 'audit' | 'off';
export type AzmPanelContractUpdateMode = 'ask' | 'auto' | 'never';

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
  /** Panel AZM register contracts mode for this window session. */
  azmRegisterContractsMode?: AzmPanelRegisterContractsMode;
  /** Panel AZM contract-update mode for this window session. */
  azmContractUpdateMode?: AzmPanelContractUpdateMode;
  /** True when CoolTerm's localhost remote control socket responds to Debug80. */
  coolTermAvailable?: boolean;
  /** Inferred HEX artifact for the selected project/target, when known. */
  coolTermHexPath?: string;
  /** Current hardware transfer/setup status for the project area. */
  hardwareStatusText?: string;
  /** Current source-map status for editor navigation and debugger symbol views. */
  sourceMapStatusText?: string;
  sourceMapStatusState?: 'current' | 'stale' | 'missing' | 'invalid' | 'unknown';
  /** Selected target's preferred TEC-1G panel/card visibility, when configured. */
  targetUiVisibility?: {
    tms9918?: boolean;
    glcd?: boolean;
    serial?: boolean;
    matrix?: boolean;
  };
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
  | { type: 'requestProjectStatus' }
  | { type: 'startDebug'; rootPath?: string }
  | { type: 'restartDebug' }
  | { type: 'createProject'; rootPath?: string; platform?: string }
  | { type: 'openWorkspaceFolder' }
  | { type: 'selectProject'; rootPath?: string }
  | { type: 'configureProject' }
  | { type: 'saveProjectConfig'; platform: string }
  | { type: 'setStopOnEntry'; stopOnEntry: boolean }
  | {
      type: 'setAzmOptions';
      registerContractsMode: AzmPanelRegisterContractsMode;
      contractUpdateMode: AzmPanelContractUpdateMode;
    }
  | { type: 'selectTarget'; rootPath?: string; targetName?: string }
  | { type: 'testCoolTermConnection' }
  | { type: 'sendHexViaCoolTerm'; rootPath?: string; targetName?: string }
  | { type: 'setEntrySource' }
  | { type: 'serialSendFile' }
  | { type: 'serialSave'; text: string }
  | { type: 'serialClear' };

export type PlatformViewInboundMessage =
  | PlatformViewControlMessage
  | Tec1Message
  | Tec1gMessage
  | { type?: string; [key: string]: unknown };
