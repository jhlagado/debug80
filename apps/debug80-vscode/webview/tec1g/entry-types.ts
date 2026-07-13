/**
 * @file Message and payload types for the TEC-1G webview entry bundle.
 */

import type { ProjectStatusPayload } from '../../src/contracts/platform-view';
import type { Tec1gUpdatePayload as Tec1gUpdatePayloadBase } from '@jhlagado/debug80-runtime/platforms/tec1g/types';
import type { SessionStatus } from '../common/session-status';

export type Tec1gPanelTab = 'ui' | 'memory';

export type { Tec1gSpeedMode } from '@jhlagado/debug80-runtime/platforms/tec1g/types';

/**
 * `update` message body: all fields optional for partial snapshots; `speaker` may be boolean or
 * numeric 0/1 depending on the post path. Shape is derived from {@link Tec1gUpdatePayloadBase}.
 */
export type Tec1gUpdatePayload = Omit<Partial<Tec1gUpdatePayloadBase>, 'speaker'> & {
  speaker?: boolean | number;
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
    writable?: boolean[];
    focus?: number;
    symbol?: string;
    symbolOffset?: number;
  }>;
};

export type IncomingMessage =
  | { type: 'selectTab'; tab: string }
  | { type: 'resetPanelLayout' }
  | { type: 'sessionStatus'; status: SessionStatus }
  | {
      type: 'projectStatus';
      rootName?: string;
      rootPath?: string;
      hasProject?: boolean;
      targetName?: string;
      entrySource?: string;
      platform?: string;
      stopOnEntry?: boolean;
      azmRegisterContractsMode?: 'enforce' | 'audit' | 'off';
      azmContractUpdateMode?: 'ask' | 'auto' | 'never';
      azmSymbolCase?: ProjectStatusPayload['azmSymbolCase'];
      coolTermAvailable?: boolean;
      coolTermHexPath?: string;
      hardwareStatusText?: string;
      hardwareStatusState?: ProjectStatusPayload['hardwareStatusState'];
      buildStatusText?: ProjectStatusPayload['buildStatusText'];
      buildStatusState?: ProjectStatusPayload['buildStatusState'];
      targetUiVisibility?: ProjectStatusPayload['targetUiVisibility'];
      roots: ProjectStatusPayload['roots'];
      targets: ProjectStatusPayload['targets'];
    }
  | ({ type: 'update'; uiRevision?: number } & Tec1gUpdatePayload)
  | ({ type: 'snapshot' } & MemorySnapshotPayload)
  | { type: 'snapshotError'; message?: string };
