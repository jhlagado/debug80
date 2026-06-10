import { createMatrixRenderer } from '../common/matrix-renderer';
import { createTecKeypad } from '../common/tec-keypad';
import { resolveTecKeypadShortcut } from '../common/tec-keyboard-shortcuts';
import {
  routeTecKeypadKeyup,
  routeTecKeypadShortcut,
  wireKeypadFocusPanels,
} from '../common/keypad-focus-routing';
import { TEC1G_DIGITS } from '../common/tec-keypad-layout';
import { wireSerialUi } from '../common/serial-ui';
import { createSevenSegDisplay } from '../common/seven-seg-display';
import { MemoryPanel } from '../common/memory-panel';
import { createMemoryViewEntries } from '../common/memory-view-elements';
import { createSessionStatusController } from '../common/session-status';
import { wireStopOnEntryControl } from '../common/stop-on-entry-control';
import { createProjectStatusUi } from '../common/project-status-ui';
import { requestProjectStatus, wireProjectStatusRefresh } from '../common/project-status-refresh';
import { acquireVscodeApi } from '../common/vscode';
import {
  applyProjectPanelStatusControls,
  getProjectPanelElements,
  wireProjectPanelPlatformControls,
} from '../common/project-panel-elements';
import { createAccordionLayoutController, type ProviderPanelTab } from '../common/accordion-layout';
import type { ProjectStatusPayload } from '../../src/contracts/platform-view';
import { createAudioController } from './audio';
import { createLcdRenderer } from './lcd-renderer';

const vscode = acquireVscodeApi();
const projectElements = getProjectPanelElements(document);
const DEFAULT_TAB: ProviderPanelTab =
  document.body.dataset.activeTab === 'memory' ? 'memory' : 'ui';
const displayEl = document.getElementById('display') as HTMLElement;
const keypadEl = document.getElementById('keypad') as HTMLElement;
const speakerEl = document.getElementById('speaker') as HTMLElement;
const speakerHzEl = document.getElementById('speakerHz') as HTMLElement;
const speedEl = document.getElementById('speed') as HTMLElement;
const muteEl = document.getElementById('mute') as HTMLElement;
const accordionButtons = Array.from(
  document.querySelectorAll<HTMLElement>('[data-accordion-toggle]')
);
const accordionMachine = document.getElementById('accordion-machine') as HTMLElement;
const accordionRegisters = document.getElementById('accordion-registers') as HTMLElement;
const accordionMemory = document.getElementById('accordion-memory') as HTMLElement;
const panelUi = document.getElementById('panel-ui') as HTMLElement;
const panelRegisters = document.getElementById('panel-registers') as HTMLElement;
const panelMemory = document.getElementById('panel-memory') as HTMLElement;
const registerStrip = document.getElementById('registerStrip') as HTMLElement;
const memoryPanel = document.getElementById('memoryPanel') as HTMLElement;
const toolbarEl = document.querySelector('.debug80-toolbar') as HTMLElement | null;
const accordionEl = document.getElementById('debug80Accordion') as HTMLElement | null;
const display = createSevenSegDisplay(displayEl, TEC1G_DIGITS);
const keypad = createTecKeypad(vscode, keypadEl);
wireKeypadFocusPanels([accordionMachine], keypad);

let memoryPanelController: MemoryPanel | null = null;
const panelLayout = createAccordionLayoutController({
  vscode,
  buttons: accordionButtons,
  defaultTab: DEFAULT_TAB,
  memoryPanel,
  panels: {
    machine: accordionMachine,
    registers: accordionRegisters,
    memory: accordionMemory,
  },
  getMemoryPanelController: () => memoryPanelController,
});
panelLayout.wireButtons();

let speedMode = 'fast';
let uiRevision = 0;
let projectIsInitialized = false;

const audio = createAudioController(muteEl, vscode);

wireProjectPanelPlatformControls(vscode, projectElements, 'tec1', () => projectIsInitialized);
const lcdRenderer = createLcdRenderer();
const matrixRenderer = createMatrixRenderer();
const sessionStatusController = createSessionStatusController(
  vscode,
  projectElements.restartButton
);
const stopOnEntryControl = wireStopOnEntryControl(vscode, projectElements.stopOnEntryInput);
const projectStatusUi = createProjectStatusUi(
  vscode,
  projectElements.projectStatus,
  'tec1'
);
const projectStatusRefresh = wireProjectStatusRefresh(vscode);

function applyProjectStatus(payload: {
  rootPath?: ProjectStatusPayload['rootPath'];
  roots?: ProjectStatusPayload['roots'];
  targets?: ProjectStatusPayload['targets'];
  targetName?: ProjectStatusPayload['targetName'];
  projectState?: ProjectStatusPayload['projectState'];
  platform?: ProjectStatusPayload['platform'];
  hasProject?: ProjectStatusPayload['hasProject'];
  stopOnEntry?: ProjectStatusPayload['stopOnEntry'];
  coolTermAvailable?: ProjectStatusPayload['coolTermAvailable'];
  coolTermHexPath?: ProjectStatusPayload['coolTermHexPath'];
  hardwareStatusText?: ProjectStatusPayload['hardwareStatusText'];
  sourceMapStatusText?: ProjectStatusPayload['sourceMapStatusText'];
  sourceMapStatusState?: ProjectStatusPayload['sourceMapStatusState'];
}): void {
  projectStatusUi.applyProjectStatus(payload);
  const initialized = applyProjectPanelStatusControls(payload, projectElements, {
    tabs: toolbarEl,
    accordion: accordionEl,
    panelUi,
    panelRegisters,
    panelMemory,
  });
  projectIsInitialized = initialized;
  stopOnEntryControl.applyProjectStatus({
    hasProject: initialized,
    stopOnEntry: payload.stopOnEntry,
  });
}

applyProjectStatus({});

function applySpeed(mode: string): void {
  speedMode = mode;
  speedEl.textContent = mode.toUpperCase();
  speedEl.classList.toggle('slow', mode === 'slow');
  speedEl.classList.toggle('fast', mode === 'fast');
}

speedEl.addEventListener('click', () => {
  const next = speedMode === 'fast' ? 'slow' : 'fast';
  applySpeed(next);
  vscode.postMessage({ type: 'speed', mode: next });
});
muteEl.addEventListener('click', () => {
  audio.toggleMute();
});

function applyUpdate(payload: {
  digits?: number[];
  segmentIntensities?: number[];
  matrix?: number[];
  speaker?: boolean;
  speedMode?: string;
  lcd?: number[];
  speakerHz?: number;
}): void {
  if (Array.isArray(payload.segmentIntensities)) {
    display.applySegmentIntensities(payload.segmentIntensities);
  } else {
    display.applyDigits(payload.digits || []);
  }
  if (payload.speaker) {
    speakerEl.classList.add('on');
  } else {
    speakerEl.classList.remove('on');
  }
  if (speakerHzEl && typeof payload.speakerHz === 'number') {
    if (payload.speakerHz > 0) {
      speakerHzEl.textContent = payload.speakerHz + ' Hz';
      audio.setSpeakerHz(payload.speakerHz);
    } else {
      speakerHzEl.textContent = '';
      audio.setSpeakerHz(0);
    }
  }
  audio.updateAudio();
  if (payload.speedMode === 'slow' || payload.speedMode === 'fast') {
    applySpeed(payload.speedMode);
  }
  lcdRenderer.applyLcdUpdate(payload);
  matrixRenderer.applyMatrixUpdate(payload);
}

const statusEl = document.getElementById('status');
const views = createMemoryViewEntries(document);

memoryPanelController = new MemoryPanel({
  vscode,
  registerStrip,
  statusEl,
  views,
  getRowSize: () => panelLayout.getMemoryRowSize(),
  isActive: () => panelLayout.isMemoryOpen(),
});
memoryPanelController.wire();
const serialUi = wireSerialUi(vscode);

window.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'projectStatus') {
    applyProjectStatus(event.data);
    return;
  }
  if (event.data.type === 'sessionStatus') {
    sessionStatusController.setStatus(event.data.status);
    panelLayout.setRegisterRefreshActive(
      event.data.status === 'running' || event.data.status === 'paused'
    );
    return;
  }
  if (event.data.type === 'selectTab') {
    panelLayout.setProviderTab(event.data.tab, false);
    return;
  }
  if (event.data.type === 'update') {
    if (typeof event.data.uiRevision === 'number') {
      if (event.data.uiRevision < uiRevision) {
        return;
      }
      uiRevision = event.data.uiRevision;
    }
    applyUpdate(event.data);
    return;
  }
  if (event.data.type === 'snapshot') {
    memoryPanelController?.handleSnapshot(event.data);
    return;
  }
  if (event.data.type === 'snapshotError') {
    memoryPanelController?.handleSnapshotError(event.data.message);
  }
});

applySpeed(speedMode);
audio.applyMuteState();
document.addEventListener('pointerdown', () => audio.unlockAudio(), { capture: true });
document.addEventListener('keydown', () => audio.unlockAudio(), { capture: true });
lcdRenderer.draw();
matrixRenderer.build();
matrixRenderer.draw();
panelLayout.setProviderTab(DEFAULT_TAB, false);
vscode.postMessage({ type: 'tab', tab: panelLayout.getProviderTab() });
requestProjectStatus(vscode);
keypad.focusKeypad();
sessionStatusController.setStatus('not running');
panelLayout.setRegisterRefreshActive(false);
window.addEventListener('resize', () => panelLayout.scheduleMemoryResize());
panelLayout.updateMemoryLayout(false);

window.addEventListener('keydown', (event) => {
  const shortcut = resolveTecKeypadShortcut(event.key);
  routeTecKeypadShortcut(event, shortcut, keypad, () => vscode.postMessage({ type: 'reset' }));
});
window.addEventListener('keyup', (event) => {
  routeTecKeypadKeyup(event, keypad);
});

window.addEventListener('beforeunload', () => {
  serialUi.dispose();
  sessionStatusController.dispose();
  stopOnEntryControl.dispose();
  projectStatusUi.dispose();
  projectStatusRefresh.dispose();
});
