import { createMatrixRenderer } from '../common/matrix-renderer';
import { createTecKeypad } from '../common/tec-keypad';
import { resolveTecKeypadShortcut } from '../common/tec-keyboard-shortcuts';
import { TEC1G_DIGITS } from '../common/tec-keypad-layout';
import { wireSerialUi } from '../common/serial-ui';
import { createSevenSegDisplay } from '../common/seven-seg-display';
import { applyInitializedProjectControls } from '../common/project-controls';
import { MemoryPanel, type MemoryViewEntry } from '../common/memory-panel';
import { createSessionStatusController } from '../common/session-status';
import { wireStopOnEntryControl } from '../common/stop-on-entry-control';
import { createProjectStatusUi } from '../common/project-status-ui';
import { acquireVscodeApi } from '../common/vscode';
import { createAccordionLayoutController, type ProviderPanelTab } from '../common/accordion-layout';
import type { ProjectStatusPayload } from '../../src/contracts/platform-view';
import { createAudioController } from './audio';
import { createLcdRenderer } from './lcd-renderer';

const vscode = acquireVscodeApi();
const DEFAULT_TAB: ProviderPanelTab =
  document.body.dataset.activeTab === 'memory'
    ? 'memory'
    : 'ui';
const selectProjectButton = document.getElementById('selectProject') as HTMLButtonElement | null;
const addWorkspaceFolderButton = document.getElementById('addWorkspaceFolder') as HTMLButtonElement | null;
const appRoot = document.getElementById('app') as HTMLElement | null;
const projectHeader = document.getElementById('projectHeader') as HTMLElement | null;
const setupCard = document.getElementById('setupCard') as HTMLElement | null;
const setupCardText = document.getElementById('setupCardText') as HTMLElement | null;
const setupPrimaryAction = document.getElementById('setupPrimaryAction') as HTMLButtonElement | null;
const platformInitButton = document.getElementById('platformInitButton') as HTMLButtonElement | null;
const restartDebugButton = document.getElementById('restartDebug') as HTMLButtonElement | null;
const stopOnEntryInput = document.getElementById('stopOnEntry') as HTMLInputElement | null;
const homeTargetSelect = document.getElementById('homeTargetSelect') as HTMLSelectElement | null;
const targetControl = homeTargetSelect?.closest('.project-control') as HTMLElement | null;
const displayEl = document.getElementById('display') as HTMLElement;
const keypadEl = document.getElementById('keypad') as HTMLElement;
const speakerEl = document.getElementById('speaker') as HTMLElement;
const speakerHzEl = document.getElementById('speakerHz') as HTMLElement;
const speedEl = document.getElementById('speed') as HTMLElement;
const muteEl = document.getElementById('mute') as HTMLElement;
const accordionButtons = Array.from(document.querySelectorAll<HTMLElement>('[data-accordion-toggle]'));
const accordionMachine = document.getElementById('accordion-machine') as HTMLElement;
const accordionRegisters = document.getElementById('accordion-registers') as HTMLElement;
const accordionMemory = document.getElementById('accordion-memory') as HTMLElement;
const panelUi = document.getElementById('panel-ui') as HTMLElement;
const panelRegisters = document.getElementById('panel-registers') as HTMLElement;
const panelMemory = document.getElementById('panel-memory') as HTMLElement;
const platformSelectEl = document.getElementById('platformSelect') as HTMLSelectElement | null;
const platformControl = platformSelectEl?.closest('.project-control') as HTMLElement | null;
const platformInfoControl = document.getElementById('platformInfoControl') as HTMLElement | null;
const platformValueEl = document.getElementById('platformValue') as HTMLElement | null;
const registerStrip = document.getElementById('registerStrip') as HTMLElement;
const memoryPanel = document.getElementById('memoryPanel') as HTMLElement;
const toolbarEl = document.querySelector('.debug80-toolbar') as HTMLElement | null;
const accordionEl = document.getElementById('debug80Accordion') as HTMLElement | null;
const stopOnEntryLabel = stopOnEntryInput?.closest('.stop-on-entry-label') as HTMLElement | null;
const display = createSevenSegDisplay(displayEl, TEC1G_DIGITS);
const keypad = createTecKeypad(vscode, keypadEl);

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

// Clicking anywhere in the UI panel that isn't a native control focuses the keypad.
panelUi.addEventListener('mousedown', (event) => {
  const target = event.target as HTMLElement;
  if (target.closest('input, select, textarea, button')) return;
  event.preventDefault();
  keypad.focusKeypad();
});

let speedMode = 'fast';
let uiRevision = 0;
let projectIsInitialized = false;

const audio = createAudioController(muteEl, vscode);

addWorkspaceFolderButton?.addEventListener('click', () => {
  vscode.postMessage({ type: 'openWorkspaceFolder' });
});

platformSelectEl?.addEventListener('change', () => {
  if (projectIsInitialized) {
    vscode.postMessage({ type: 'saveProjectConfig', platform: platformSelectEl.value });
  }
});
const lcdRenderer = createLcdRenderer();
const matrixRenderer = createMatrixRenderer();
const sessionStatusController = createSessionStatusController(vscode, restartDebugButton);
const stopOnEntryControl = wireStopOnEntryControl(vscode, stopOnEntryInput);
const projectStatusUi = createProjectStatusUi(vscode, {
  selectProjectButton,
  setupCard,
  setupCardText,
  setupPrimaryAction,
  platformInitButton,
  homeTargetSelect,
}, 'tec1');

function applyProjectStatus(payload: {
  rootPath?: ProjectStatusPayload['rootPath'];
  roots?: ProjectStatusPayload['roots'];
  targets?: ProjectStatusPayload['targets'];
  targetName?: ProjectStatusPayload['targetName'];
  projectState?: ProjectStatusPayload['projectState'];
  platform?: ProjectStatusPayload['platform'];
  hasProject?: ProjectStatusPayload['hasProject'];
  stopOnEntry?: ProjectStatusPayload['stopOnEntry'];
}): void {
  projectStatusUi.applyProjectStatus(payload);
  if (platformSelectEl && payload.platform !== undefined) {
    platformSelectEl.value = payload.platform;
  }
  const initialized = applyInitializedProjectControls(payload, {
    appRoot,
    projectHeader,
    targetControl,
    targetSelect: homeTargetSelect,
    platformControl,
    platformSelect: platformSelectEl,
    platformInfoControl,
    platformValue: platformValueEl,
    stopOnEntryLabel,
    restartButton: restartDebugButton,
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
  matrix?: number[];
  speaker?: boolean;
  speedMode?: string;
  lcd?: number[];
  speakerHz?: number;
}): void {
  display.applyDigits(payload.digits || []);
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
const views: MemoryViewEntry[] = [
  {
    id: 'a',
    view: document.getElementById('view-a') as HTMLSelectElement | null,
    address: document.getElementById('address-a') as HTMLInputElement | null,
    addr: document.getElementById('addr-a'),
    symbol: document.getElementById('sym-a'),
    dump: document.getElementById('dump-a'),
  },
  {
    id: 'b',
    view: document.getElementById('view-b') as HTMLSelectElement | null,
    address: document.getElementById('address-b') as HTMLInputElement | null,
    addr: document.getElementById('addr-b'),
    symbol: document.getElementById('sym-b'),
    dump: document.getElementById('dump-b'),
  },
  {
    id: 'c',
    view: document.getElementById('view-c') as HTMLSelectElement | null,
    address: document.getElementById('address-c') as HTMLInputElement | null,
    addr: document.getElementById('addr-c'),
    symbol: document.getElementById('sym-c'),
    dump: document.getElementById('dump-c'),
  },
  {
    id: 'd',
    view: document.getElementById('view-d') as HTMLSelectElement | null,
    address: document.getElementById('address-d') as HTMLInputElement | null,
    addr: document.getElementById('addr-d'),
    symbol: document.getElementById('sym-d'),
    dump: document.getElementById('dump-d'),
  },
];

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

window.addEventListener('message', event => {
  if (!event.data) return;
  if (event.data.type === 'projectStatus') {
    applyProjectStatus(event.data);
    return;
  }
  if (event.data.type === 'sessionStatus') {
    sessionStatusController.setStatus(event.data.status);
    panelLayout.setRegisterRefreshActive(event.data.status === 'running' || event.data.status === 'paused');
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
keypad.focusKeypad();
sessionStatusController.setStatus('not running');
panelLayout.setRegisterRefreshActive(false);
window.addEventListener('resize', () => panelLayout.scheduleMemoryResize());
panelLayout.updateMemoryLayout(false);

keypadEl.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  const shortcut = resolveTecKeypadShortcut(event.key);
  if (shortcut.kind === 'key') {
    keypad.sendKey(shortcut.code);
    event.preventDefault();
  } else if (shortcut.kind === 'reset') {
    keypad.setShiftLatched(false);
    vscode.postMessage({ type: 'reset' });
    event.preventDefault();
  } else if (shortcut.kind === 'shift') {
    keypad.setShiftLatched(shortcut.latched);
    event.preventDefault();
  }
});
keypadEl.addEventListener('keyup', (event) => {
  if (event.key === 'Shift' && keypad.getShiftLatched()) {
    keypad.setShiftLatched(false);
  }
});

window.addEventListener('beforeunload', () => {
  serialUi.dispose();
  sessionStatusController.dispose();
  stopOnEntryControl.dispose();
  projectStatusUi.dispose();
});
  
