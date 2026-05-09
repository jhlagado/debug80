/**
 * @file TEC-1G webview composition root: wires feature modules and extension messages.
 */

import { createSevenSegDisplay } from '../common/seven-seg-display';
import { MemoryPanel } from '../common/memory-panel';
import { applyInitializedProjectControls } from '../common/project-controls';
import { createSessionStatusController } from '../common/session-status';
import { wireStopOnEntryControl } from '../common/stop-on-entry-control';
import { acquireVscodeApi } from '../common/vscode';
import { createAccordionLayoutController, type ProviderPanelTab } from '../common/accordion-layout';
import { createGlcdRenderer } from './glcd-renderer';
import { createLcdRenderer } from './lcd-renderer';
import { createMatrixUiController } from './matrix-ui';
import { wireSerialUi } from '../common/serial-ui';
import { createVisibilityController } from './visibility-controller';
import type { IncomingMessage, Tec1gSpeedMode, Tec1gUpdatePayload } from './entry-types';
import { TEC1G_DIGITS } from '../common/tec-keypad-layout';
import { createTec1gMemoryViews } from './tec1g-memory-views';
import { createTec1gAudio } from './tec1g-audio';
import { createTec1gKeypad, TEC1G_KEY_MAP } from './tec1g-keypad';
import { applyTec1gPlatformUpdate } from './tec1g-platform-update';
import { createTec1gProjectStatusUi } from './tec1g-project-status-ui';

const vscode = acquireVscodeApi();

const DEFAULT_TAB: ProviderPanelTab =
  document.body.dataset.activeTab === 'memory'
    ? 'memory'
    : 'ui';

const appRoot = document.getElementById('app') as HTMLElement | null;
const projectHeader = document.getElementById('projectHeader') as HTMLElement | null;
const selectProjectButton = document.getElementById('selectProject') as HTMLButtonElement | null;
const addWorkspaceFolderButton = document.getElementById('addWorkspaceFolder') as HTMLButtonElement | null;
const setupCard = document.getElementById('setupCard') as HTMLElement | null;
const setupCardText = document.getElementById('setupCardText') as HTMLElement | null;
const setupPrimaryAction = document.getElementById('setupPrimaryAction') as HTMLButtonElement | null;
const platformInitButton = document.getElementById('platformInitButton') as HTMLButtonElement | null;
const restartDebugButton = document.getElementById('restartDebug') as HTMLButtonElement | null;
const stopOnEntryInput = document.getElementById('stopOnEntry') as HTMLInputElement | null;
const homeTargetSelect = document.getElementById('homeTargetSelect') as HTMLSelectElement | null;
const displayEl = document.getElementById('display') as HTMLElement;
const keypadEl = document.getElementById('keypad') as HTMLElement;
const speakerEl = document.getElementById('speaker') as HTMLElement;
const speakerLabel = document.getElementById('speakerLabel') as HTMLElement;
const speedEl = document.getElementById('speed') as HTMLElement;
const muteEl = document.getElementById('mute') as HTMLElement;
const statusShadow = document.getElementById('statusShadow') as HTMLElement;
const statusProtect = document.getElementById('statusProtect') as HTMLElement;
const statusExpand = document.getElementById('statusExpand') as HTMLElement;
const statusCaps = document.getElementById('statusCaps') as HTMLElement;
const accordionButtons = Array.from(document.querySelectorAll<HTMLElement>('[data-accordion-toggle]'));
const panelUi = document.getElementById('panel-ui') as HTMLElement;
const panelRegisters = document.getElementById('panel-registers') as HTMLElement;
const panelMemory = document.getElementById('panel-memory') as HTMLElement;
const platformSelectEl = document.getElementById('platformSelect') as HTMLSelectElement | null;
const targetControl = homeTargetSelect?.closest('.project-control') as HTMLElement | null;
const platformControl = platformSelectEl?.closest('.project-control') as HTMLElement | null;
const platformInfoControl = document.getElementById('platformInfoControl') as HTMLElement | null;
const platformValueEl = document.getElementById('platformValue') as HTMLElement | null;
const toolbarEl = document.querySelector('.debug80-toolbar') as HTMLElement | null;
const accordionEl = document.getElementById('debug80Accordion') as HTMLElement | null;
const stopOnEntryLabel = stopOnEntryInput?.closest('.stop-on-entry-label') as HTMLElement | null;
const registerStrip = document.getElementById('registerStrip') as HTMLElement;
const memoryPanelEl = document.getElementById('memoryPanel') as HTMLElement;

const display = createSevenSegDisplay(displayEl, TEC1G_DIGITS);

const sessionStatusController = createSessionStatusController(vscode, restartDebugButton);
const stopOnEntryControl = wireStopOnEntryControl(vscode, stopOnEntryInput);

const glcdRenderer = createGlcdRenderer();
const lcdRenderer = createLcdRenderer();

let memoryPanelController: MemoryPanel | null = null;
const panelLayout = createAccordionLayoutController({
  vscode,
  buttons: accordionButtons,
  memoryPanel: memoryPanelEl,
  defaultTab: DEFAULT_TAB,
  panels: {
    machine: panelUi,
    registers: panelRegisters,
    memory: panelMemory,
  },
  getMemoryPanelController: () => memoryPanelController,
});
panelLayout.wireButtons();

const matrixUi = createMatrixUiController(vscode, () => panelLayout.isMachineOpen());
const visibilityController = createVisibilityController(vscode);

const projectStatusUi = createTec1gProjectStatusUi(vscode, {
  selectProjectButton,
  setupCard,
  setupCardText,
  setupPrimaryAction,
  platformInitButton,
  homeTargetSelect,
  getPlatform: () => platformSelectEl?.value ?? undefined,
}, 'tec1g');

let projectIsInitialized = false;

projectStatusUi.applyProjectStatus({});
projectIsInitialized = applyInitializedProjectControls({}, {
  appRoot,
  projectHeader,
  targetControl,
  targetSelect: homeTargetSelect,
  platformControl,
  platformInfoControl,
  platformValue: platformValueEl,
  platformSelect: platformSelectEl,
  stopOnEntryLabel,
  restartButton: restartDebugButton,
  tabs: toolbarEl,
  accordion: accordionEl,
  panelUi,
  panelRegisters,
  panelMemory,
});

// Clicking anywhere in the UI panel that isn't a native control focuses the keypad.
panelUi.addEventListener('mousedown', (event) => {
  const target = event.target as HTMLElement;
  if (target.closest('input, select, textarea, button')) return;
  event.preventDefault();
  keypadEl.focus();
});

let speedMode: Tec1gSpeedMode = 'fast';
function applySpeed(mode: Tec1gSpeedMode): void {
  speedMode = mode;
  speedEl.textContent = mode.toUpperCase();
  speedEl.classList.toggle('slow', mode === 'slow');
  speedEl.classList.toggle('fast', mode === 'fast');
}

const keypad = createTec1gKeypad(vscode, keypadEl, {
  statusShadow,
  statusProtect,
  statusExpand,
  statusCaps,
});

const audio = createTec1gAudio({ muteEl, speakerEl, speakerLabel, vscode });
audio.wireMuteClick();

addWorkspaceFolderButton?.addEventListener('click', () => {
  vscode.postMessage({ type: 'openWorkspaceFolder' });
});

platformSelectEl?.addEventListener('change', () => {
  if (projectIsInitialized) {
    vscode.postMessage({ type: 'saveProjectConfig', platform: platformSelectEl.value });
  }
});

speedEl.addEventListener('click', () => {
  const next = speedMode === 'fast' ? 'slow' : 'fast';
  applySpeed(next);
  vscode.postMessage({ type: 'speed', mode: next });
});

let uiRevision = 0;

const platformUpdateDeps = {
  display,
  audio,
  applySpeed,
  lcdRenderer,
  matrixUi,
  glcdRenderer,
  keypad,
};

function applyUpdateFromPayload(payload: Tec1gUpdatePayload | null | undefined): void {
  applyTec1gPlatformUpdate(platformUpdateDeps, payload);
}

const statusEl = document.getElementById('status');
const views = createTec1gMemoryViews();

memoryPanelController = new MemoryPanel({
  vscode,
  registerStrip,
  statusEl,
  views,
  getRowSize: () => panelLayout.getMemoryRowSize(),
  isActive: () => panelLayout.isCpuOpen(),
});
memoryPanelController.wire();

window.addEventListener('message', (event: MessageEvent<IncomingMessage | undefined>): void => {
  const message = event.data;
  if (!message) {
    return;
  }
  if (message.type === 'projectStatus') {
    visibilityController.setProjectTargetName(message.targetName);
    projectStatusUi.applyProjectStatus(message);
    if (platformSelectEl && message.platform !== undefined) {
      platformSelectEl.value = message.platform;
    }
    const initialized = applyInitializedProjectControls(message, {
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
      stopOnEntry: message.stopOnEntry,
    });
    return;
  }
  if (message.type === 'sessionStatus') {
    sessionStatusController.setStatus(message.status);
    return;
  }
  if (message.type === 'selectTab') {
    panelLayout.setProviderTab(message.tab, false);
    return;
  }
  if (message.type === 'uiVisibility') {
    visibilityController.applyOverride(message.visibility, message.persist === true);
    return;
  }
  if (message.type === 'update') {
    if (typeof message.uiRevision === 'number') {
      if (message.uiRevision < uiRevision) {
        return;
      }
      uiRevision = message.uiRevision;
    }
    applyUpdateFromPayload(message);
    if (panelLayout.isCpuOpen()) {
      memoryPanelController?.requestSnapshot();
    }
    return;
  }
  if (message.type === 'snapshot') {
    memoryPanelController?.handleSnapshot(message);
    return;
  }
  if (message.type === 'snapshotError') {
    memoryPanelController?.handleSnapshotError(message.message);
  }
});

applySpeed(speedMode);
audio.applyMuteState();
matrixUi.init();
visibilityController.wire();
lcdRenderer.draw();
glcdRenderer.draw();
panelLayout.setProviderTab(DEFAULT_TAB, false);
vscode.postMessage({ type: 'tab', tab: panelLayout.getProviderTab() });
keypad.focusKeypad();
sessionStatusController.setStatus('not running');
window.addEventListener('resize', () => {
  panelLayout.scheduleMemoryResize();
});
panelLayout.updateMemoryLayout(false);
wireSerialUi(vscode);

// Matrix keyboard stays at window level — it has its own mode system
window.addEventListener('keydown', (event) => {
  if (event.repeat) {
    return;
  }
  if (matrixUi.handleKeyEvent(event, true)) {
    event.preventDefault();
  }
});

// Keypad key routing is gated on keypad focus.
// stopPropagation() prevents the window-level matrix handler from also seeing
// a consumed key — the two key sets may overlap.
keypadEl.addEventListener('keydown', (event) => {
  if (event.repeat) {
    return;
  }
  if (event.key === ' ') {
    keypad.sendKey(TEC1G_KEY_MAP['0']);
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (event.key === 'Escape') {
    keypad.setShiftLatched(false);
    vscode.postMessage({ type: 'reset' });
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (event.key === 'Shift') {
    keypad.setShiftLatched(true);
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  const key = event.key.toUpperCase();
  if (TEC1G_KEY_MAP[key] !== undefined) {
    keypad.sendKey(TEC1G_KEY_MAP[key]);
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  if (event.key === 'Enter') {
    keypad.sendKey(0x12);
    event.preventDefault();
    event.stopPropagation();
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
    keypad.sendKey(0x11);
    event.preventDefault();
    event.stopPropagation();
  } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
    keypad.sendKey(0x10);
    event.preventDefault();
    event.stopPropagation();
  } else if (event.key === 'Tab') {
    keypad.sendKey(0x13);
    event.preventDefault();
    event.stopPropagation();
  }
});
keypadEl.addEventListener('keyup', (event) => {
  if (event.key === 'Shift' && keypad.getShiftLatched()) {
    keypad.setShiftLatched(false);
  }
});
window.addEventListener('keyup', (event) => {
  if (matrixUi.handleKeyEvent(event, false)) {
    event.preventDefault();
  }
});
window.addEventListener('beforeunload', () => {
  sessionStatusController.dispose();
  stopOnEntryControl.dispose();
  projectStatusUi.dispose();
});
