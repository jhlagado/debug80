/**
 * @file TEC-1G webview composition root: wires feature modules and extension messages.
 */

import { createSevenSegDisplay } from '../common/seven-seg-display';
import { MemoryPanel } from '../common/memory-panel';
import { applyInitializedProjectControls } from '../common/project-controls';
import { createSessionStatusController } from '../common/session-status';
import { wireStopOnEntryControl } from '../common/stop-on-entry-control';
import { wireAzmOptionsControl } from '../common/azm-options-control';
import {
  routeTecKeypadKeyup,
  routeTecKeypadShortcut,
  wireKeypadFocusPanels,
} from '../common/keypad-focus-routing';
import { acquireVscodeApi } from '../common/vscode';
import { createAccordionLayoutController, type ProviderPanelTab } from '../common/accordion-layout';
import { createGlcdRenderer } from './glcd-renderer';
import { createLcdRenderer } from './lcd-renderer';
import { createMatrixUiController } from './matrix-ui';
import { wireSerialUi } from '../common/serial-ui';
import { requestProjectStatus, wireProjectStatusRefresh } from '../common/project-status-refresh';
import type { IncomingMessage, Tec1gSpeedMode, Tec1gUpdatePayload } from './entry-types';
import { TEC1G_DIGITS } from '../common/tec-keypad-layout';
import { resolveTecKeypadShortcut } from '../common/tec-keyboard-shortcuts';
import { createTec1gMemoryViews } from './tec1g-memory-views';
import { createTec1gAudio } from './tec1g-audio';
import { createTec1gKeypad } from './tec1g-keypad';
import { applyTec1gPlatformUpdate } from './tec1g-platform-update';
import { createTec1gProjectStatusUi } from './tec1g-project-status-ui';
import { applyMatrixRoutingCue } from './matrix-routing-cue';

const vscode = acquireVscodeApi();

const DEFAULT_TAB: ProviderPanelTab =
  document.body.dataset.activeTab === 'memory' ? 'memory' : 'ui';

const appRoot = document.getElementById('app') as HTMLElement | null;
const projectHeader = document.getElementById('projectHeader') as HTMLElement | null;
const selectProjectButton = document.getElementById('selectProject') as HTMLButtonElement | null;
const addWorkspaceFolderButton = document.getElementById(
  'addWorkspaceFolder'
) as HTMLButtonElement | null;
const setupCard = document.getElementById('setupCard') as HTMLElement | null;
const setupCardText = document.getElementById('setupCardText') as HTMLElement | null;
const setupPrimaryAction = document.getElementById(
  'setupPrimaryAction'
) as HTMLButtonElement | null;
const platformInitButton = document.getElementById(
  'platformInitButton'
) as HTMLButtonElement | null;
const restartDebugButton = document.getElementById('restartDebug') as HTMLButtonElement | null;
const testCoolTermButton = document.getElementById('testCoolTerm') as HTMLButtonElement | null;
const sendHexToBoardButton = document.getElementById('sendHexToBoard') as HTMLButtonElement | null;
const hardwareStatusLine = document.getElementById('hardwareStatusLine') as HTMLElement | null;
const sourceMapStatusLine = document.getElementById('sourceMapStatusLine') as HTMLElement | null;
const stopOnEntryInput = document.getElementById('stopOnEntry') as HTMLInputElement | null;
const azmRegisterContractsModeSelect = document.getElementById(
  'azmRegisterContractsMode'
) as HTMLSelectElement | null;
const azmContractUpdateModeSelect = document.getElementById(
  'azmContractUpdateMode'
) as HTMLSelectElement | null;
const homeTargetSelect = document.getElementById('homeTargetSelect') as HTMLSelectElement | null;
const displayEl = document.getElementById('display') as HTMLElement;
const keypadEl = document.getElementById('keypad') as HTMLElement;
const keypadRoutingCue = document.getElementById('keypadRoutingCue') as HTMLElement | null;
const speakerEl = document.getElementById('speaker') as HTMLElement;
const speakerLabel = document.getElementById('speakerLabel') as HTMLElement;
const speedEl = document.getElementById('speed') as HTMLElement;
const muteEl = document.getElementById('mute') as HTMLElement;
const statusShadow = document.getElementById('statusShadow') as HTMLElement;
const statusProtect = document.getElementById('statusProtect') as HTMLElement;
const statusExpand = document.getElementById('statusExpand') as HTMLElement;
const statusCaps = document.getElementById('statusCaps') as HTMLElement;
const statusBank0 = document.getElementById('statusBank0') as HTMLElement;
const statusBank1 = document.getElementById('statusBank1') as HTMLElement;
const statusBank2 = document.getElementById('statusBank2') as HTMLElement;
const statusBank3 = document.getElementById('statusBank3') as HTMLElement;
const accordionButtons = Array.from(
  document.querySelectorAll<HTMLElement>('[data-accordion-toggle]')
);
const matrixKeyboardHeader =
  accordionButtons.find((button) => button.dataset.accordionToggle === 'matrixKeyboard') ?? null;
const matrixConfigSwitch = document.getElementById('matrixConfigSwitch') as HTMLInputElement | null;
const accordionProject = document.getElementById('accordion-project') as HTMLElement;
const accordionMachine = document.getElementById('accordion-machine') as HTMLElement;
const accordionDisplays = document.getElementById('accordion-displays') as HTMLElement;
const accordionSerial = document.getElementById('accordion-serial') as HTMLElement;
const accordionMatrixKeyboard = document.getElementById('accordion-matrix-keyboard') as HTMLElement;
const accordionRegisters = document.getElementById('accordion-registers') as HTMLElement;
const accordionMemory = document.getElementById('accordion-memory') as HTMLElement;
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

const display = createSevenSegDisplay(displayEl, TEC1G_DIGITS, {
  digitClassName: (index) => (index < 2 ? 'digit--data' : 'digit--address'),
});

const sessionStatusController = createSessionStatusController(vscode, restartDebugButton);
const stopOnEntryControl = wireStopOnEntryControl(vscode, stopOnEntryInput);
const azmOptionsControl = wireAzmOptionsControl(
  vscode,
  azmRegisterContractsModeSelect,
  azmContractUpdateModeSelect
);

const glcdRenderer = createGlcdRenderer();
const lcdRenderer = createLcdRenderer();
const matrixUi = createMatrixUiController(vscode, () => !accordionMatrixKeyboard.hidden);

function applyMatrixKeyboardOpenState(open: boolean): void {
  matrixUi.applyKeyboardCapture(open);
  applyMatrixRoutingCue(
    { appRoot, keypad: keypadEl, cue: keypadRoutingCue, header: matrixKeyboardHeader },
    open
  );
}

let memoryPanelController: MemoryPanel | null = null;
const panelLayout = createAccordionLayoutController({
  vscode,
  buttons: accordionButtons,
  memoryPanel: memoryPanelEl,
  defaultTab: DEFAULT_TAB,
  panels: {
    project: accordionProject,
    machine: accordionMachine,
    displays: accordionDisplays,
    serial: accordionSerial,
    matrixKeyboard: accordionMatrixKeyboard,
    registers: accordionRegisters,
    memory: accordionMemory,
  },
  defaultPanelOrder: [
    'project',
    'machine',
    'displays',
    'matrixKeyboard',
    'registers',
    'memory',
    'serial',
  ],
  getMemoryPanelController: () => memoryPanelController,
  onPanelOpenChange: (panel, open) => {
    if (panel !== 'matrixKeyboard') {
      return;
    }
    applyMatrixKeyboardOpenState(open);
  },
});
panelLayout.wireButtons();

const projectStatusUi = createTec1gProjectStatusUi(
  vscode,
  {
    selectProjectButton,
    setupCard,
    setupCardText,
    setupPrimaryAction,
    platformInitButton,
    testCoolTermButton,
    sendHexToBoardButton,
    hardwareStatusLine,
    sourceMapStatusLine,
    homeTargetSelect,
    getPlatform: () => platformSelectEl?.value ?? undefined,
  },
  'tec1g'
);
const projectStatusRefresh = wireProjectStatusRefresh(vscode);

let projectIsInitialized = false;

projectStatusUi.applyProjectStatus({});
projectIsInitialized = applyInitializedProjectControls(
  {},
  {
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
  }
);
stopOnEntryControl.applyProjectStatus({ hasProject: projectIsInitialized });
azmOptionsControl.applyProjectStatus({ hasProject: projectIsInitialized });

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
  statusBank0,
  statusBank1,
  statusBank2,
  statusBank3,
});
wireKeypadFocusPanels([accordionDisplays, accordionMachine], keypad);

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

matrixConfigSwitch?.addEventListener('change', () => {
  vscode.postMessage({ type: 'matrixMode', enabled: matrixConfigSwitch.checked });
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
  isActive: () => panelLayout.isMemoryOpen(),
});
memoryPanelController.wire();

window.addEventListener('message', (event: MessageEvent<IncomingMessage | undefined>): void => {
  const message = event.data;
  if (!message) {
    return;
  }
  if (message.type === 'projectStatus') {
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
    azmOptionsControl.applyProjectStatus({
      hasProject: initialized,
      azmRegisterContractsMode: message.azmRegisterContractsMode,
      azmContractUpdateMode: message.azmContractUpdateMode,
    });
    return;
  }
  if (message.type === 'sessionStatus') {
    sessionStatusController.setStatus(message.status);
    panelLayout.setRegisterRefreshActive(
      message.status === 'running' || message.status === 'paused'
    );
    return;
  }
  if (message.type === 'selectTab') {
    panelLayout.setProviderTab(message.tab, false);
    return;
  }
  if (message.type === 'update') {
    if (typeof message.uiRevision === 'number') {
      if (message.uiRevision < uiRevision) {
        return;
      }
      uiRevision = message.uiRevision;
    }
    if (typeof message.matrixMode === 'boolean' && matrixConfigSwitch) {
      matrixConfigSwitch.checked = message.matrixMode;
    }
    applyUpdateFromPayload(message);
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
document.addEventListener('pointerdown', () => audio.unlockAudio(), { capture: true });
document.addEventListener('keydown', () => audio.unlockAudio(), { capture: true });
matrixUi.init();
applyMatrixKeyboardOpenState(panelLayout.isMatrixKeyboardOpen());
lcdRenderer.draw();
glcdRenderer.draw();
panelLayout.setProviderTab(DEFAULT_TAB, false);
vscode.postMessage({ type: 'tab', tab: panelLayout.getProviderTab() });
requestProjectStatus(vscode);
keypad.focusKeypad();
sessionStatusController.setStatus('not running');
panelLayout.setRegisterRefreshActive(false);
window.addEventListener('resize', () => {
  panelLayout.scheduleMemoryResize();
});
panelLayout.updateMemoryLayout(false);
wireSerialUi(vscode);

// Matrix keyboard owns physical typing while its accordion panel is open.
window.addEventListener('keydown', (event) => {
  if (event.repeat) {
    return;
  }
  if (matrixUi.handleKeyEvent(event, true)) {
    event.preventDefault();
  }
});

window.addEventListener('keydown', (event) => {
  if (panelLayout.isMatrixKeyboardOpen()) {
    return;
  }
  const shortcut = resolveTecKeypadShortcut(event.key);
  routeTecKeypadShortcut(event, shortcut, keypad, () => vscode.postMessage({ type: 'reset' }));
});
window.addEventListener('keyup', (event) => {
  if (matrixUi.handleKeyEvent(event, false)) {
    event.preventDefault();
    return;
  }
  if (panelLayout.isMatrixKeyboardOpen()) {
    return;
  }
  routeTecKeypadKeyup(event, keypad);
});
window.addEventListener('beforeunload', () => {
  sessionStatusController.dispose();
  stopOnEntryControl.dispose();
  azmOptionsControl.dispose();
  projectStatusUi.dispose();
  projectStatusRefresh.dispose();
});
