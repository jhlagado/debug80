import type { ProviderPanelTab } from '../common/accordion-layout';
import type { SessionStatus } from '../common/session-status';
import type { ProjectStatusPayload } from '../../src/contracts/platform-view';

type Tec1UpdatePayload = {
  type: 'update';
  uiRevision?: number;
  digits?: number[];
  segmentIntensities?: number[];
  segmentScanCycles?: import('@jhlagado/debug80-runtime/platforms/tec-common').SevenSegmentScanCycle[];
  segmentDroppedScanCycles?: number;
  segmentClockHz?: number;
  matrix?: number[];
  speaker?: boolean;
  speedMode?: string;
  lcd?: number[];
  speakerHz?: number;
};

type Tec1Message =
  | ({ type: 'projectStatus' } & Partial<ProjectStatusPayload>)
  | { type: 'sessionStatus'; status: SessionStatus }
  | { type: 'selectTab'; tab: ProviderPanelTab }
  | { type: 'resetPanelLayout' }
  | Tec1UpdatePayload
  | { type: 'snapshot'; [key: string]: unknown }
  | { type: 'snapshotError'; message?: unknown };

type Tec1MessageHandlerOptions = {
  applyProjectStatus: (payload: Partial<ProjectStatusPayload>) => void;
  setSessionStatus: (status: SessionStatus) => void;
  setRegisterRefreshActive: (active: boolean) => void;
  setProviderTab: (tab: ProviderPanelTab, pushState: boolean) => void;
  resetPanelLayout: () => void;
  applyUpdate: (payload: Tec1UpdatePayload) => void;
  handleSnapshot: (payload: unknown) => void;
  handleSnapshotError: (message: unknown) => void;
};

type Tec1MessageBranch = (data: Tec1Message) => boolean;

function isMessage(data: unknown): data is Tec1Message {
  return typeof data === 'object' && data !== null && 'type' in data;
}

export function createTec1MessageHandler(
  options: Tec1MessageHandlerOptions
): (data: unknown) => void {
  let uiRevision = 0;

  const handleProjectStatus = (data: Tec1Message): boolean => {
    if (data.type === 'projectStatus') {
      options.applyProjectStatus(data);
      return true;
    }
    return false;
  };

  const handleSessionStatus = (data: Tec1Message): boolean => {
    if (data.type === 'sessionStatus') {
      options.setSessionStatus(data.status);
      options.setRegisterRefreshActive(data.status === 'running' || data.status === 'paused');
      return true;
    }
    return false;
  };

  const handleSelectedTab = (data: Tec1Message): boolean => {
    if (data.type === 'selectTab') {
      options.setProviderTab(data.tab, false);
      return true;
    }
    return false;
  };

  const handleResetPanelLayout = (data: Tec1Message): boolean => {
    if (data.type === 'resetPanelLayout') {
      options.resetPanelLayout();
      return true;
    }
    return false;
  };

  const handleUpdate = (data: Tec1Message): boolean => {
    if (data.type === 'update') {
      if (typeof data.uiRevision === 'number') {
        if (data.uiRevision < uiRevision) {
          return true;
        }
        uiRevision = data.uiRevision;
      }
      options.applyUpdate(data);
      return true;
    }
    return false;
  };

  const handleSnapshot = (data: Tec1Message): boolean => {
    if (data.type === 'snapshot') {
      options.handleSnapshot(data);
      return true;
    }
    return false;
  };

  const handleSnapshotError = (data: Tec1Message): boolean => {
    if (data.type === 'snapshotError') {
      options.handleSnapshotError(data.message);
      return true;
    }
    return false;
  };

  const branches: Tec1MessageBranch[] = [
    handleProjectStatus,
    handleSessionStatus,
    handleSelectedTab,
    handleResetPanelLayout,
    handleUpdate,
    handleSnapshot,
    handleSnapshotError,
  ];

  return (data: unknown): void => {
    if (!isMessage(data)) {
      return;
    }
    branches.some((branch) => branch(data));
  };
}
