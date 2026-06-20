/**
 * @file TEC-1G webview composition root: wires feature modules and extension messages.
 */

import { createSevenSegDisplay } from '../common/seven-seg-display';
import { MemoryPanel } from '../common/memory-panel';
import { createSessionStatusController } from '../common/session-status';
import { wireStopOnEntryControl } from '../common/stop-on-entry-control';
import { wireAzmOptionsControl } from '../common/azm-options-control';
import {
  applyProjectPanelStatusControls,
  getProjectPanelElements,
  wireProjectPanelPlatformControls,
} from '../common/project-panel-elements';
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
import { createTms9918Renderer } from './tms9918-renderer';
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
const projectElements = getProjectPanelElements(document);

const DEFAULT_TAB: ProviderPanelTab =
  document.body.dataset.activeTab === 'memory' ? 'memory' : 'ui';

const azmRegisterContractsModeSelect = document.getElementById(
  'azmRegisterContractsMode'
) as HTMLSelectElement | null;
const azmContractUpdateModeSelect = document.getElementById(
  'azmContractUpdateMode'
) as HTMLSelectElement | null;
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
const accordionProject = document.getElementById('accordion-project') as HTMLElement;
const accordionMachine = document.getElementById('accordion-machine') as HTMLElement;
const accordionDisplays = document.getElementById('accordion-displays') as HTMLElement;
const accordionVideo = document.getElementById('accordion-video') as HTMLElement;
const accordionSerial = document.getElementById('accordion-serial') as HTMLElement;
const accordionMatrixKeyboard = document.getElementById('accordion-matrix-keyboard') as HTMLElement;
const accordionRegisters = document.getElementById('accordion-registers') as HTMLElement;
const accordionMemory = document.getElementById('accordion-memory') as HTMLElement;
const panelUi = document.getElementById('panel-ui') as HTMLElement;
const panelRegisters = document.getElementById('panel-registers') as HTMLElement;
const panelMemory = document.getElementById('panel-memory') as HTMLElement;
const toolbarEl = document.querySelector('.debug80-toolbar') as HTMLElement | null;
const accordionEl = document.getElementById('debug80Accordion') as HTMLElement | null;
const registerStrip = document.getElementById('registerStrip') as HTMLElement;
const memoryPanelEl = document.getElementById('memoryPanel') as HTMLElement;

const display = createSevenSegDisplay(displayEl, TEC1G_DIGITS, {
  digitClassName: (index) => (index < 2 ? 'digit--data' : 'digit--address'),
});

const sessionStatusController = createSessionStatusController(
  vscode,
  projectElements.restartButton
);
const stopOnEntryControl = wireStopOnEntryControl(vscode, projectElements.stopOnEntryInput);
const azmOptionsControl = wireAzmOptionsControl(
  vscode,
  azmRegisterContractsModeSelect,
  azmContractUpdateModeSelect
);

const glcdRenderer = createGlcdRenderer();
const lcdRenderer = createLcdRenderer();
const tms9918Renderer = createTms9918Renderer();
const matrixUi = createMatrixUiController(vscode, () => !accordionMatrixKeyboard.hidden);

function updateMatrixKeyboardCue(): void {
  applyMatrixRoutingCue(
    {
      appRoot: projectElements.initializedControls.appRoot ?? null,
      keypad: keypadEl,
      cue: keypadRoutingCue,
      header: matrixKeyboardHeader,
    },
    panelLayout.isMatrixKeyboardOpen(),
    matrixUi.isKeyboardCaptured()
  );
}

function applyMatrixKeyboardCapture(captured: boolean): void {
  matrixUi.applyKeyboardCapture(captured && panelLayout.isMatrixKeyboardOpen());
  updateMatrixKeyboardCue();
}

function applyMatrixKeyboardOpenState(open: boolean): void {
  matrixUi.applyKeyboardCapture(false);
  vscode.postMessage({ type: 'matrixMode', enabled: open });
  updateMatrixKeyboardCue();
}

function reassertMatrixKeyboardOpenState(): void {
  if (panelLayout.isMatrixKeyboardOpen()) {
    applyMatrixKeyboardOpenState(true);
  }
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
    video: accordionVideo,
    serial: accordionSerial,
    matrixKeyboard: accordionMatrixKeyboard,
    registers: accordionRegisters,
    memory: accordionMemory,
  },
  defaultPanelOrder: [
    'project',
    'machine',
    'displays',
    'video',
    'matrixKeyboard',
    'registers',
    'memory',
    'serial',
  ],
  getMemoryPanelController: () => memoryPanelController,
  onPanelOpenChange: (panel, open) => {
    if (panel === 'matrixKeyboard') {
      applyMatrixKeyboardOpenState(open);
      return;
    }
    if (panel === 'video') {
      vscode.postMessage({ type: 'tms9918Active', enabled: open });
    }
  },
});
panelLayout.wireButtons();
panelLayout.notifyInitialOpenPanels();

const projectStatusUi = createTec1gProjectStatusUi(
  vscode,
  {
    ...projectElements.projectStatus,
    getPlatform: () => projectElements.platformSelect?.value ?? undefined,
  },
  'tec1g'
);
const projectStatusRefresh = wireProjectStatusRefresh(vscode);

let projectIsInitialized = false;

projectStatusUi.applyProjectStatus({});
projectIsInitialized = applyProjectPanelStatusControls({}, projectElements, {
  tabs: toolbarEl,
  accordion: accordionEl,
  panelUi,
  panelRegisters,
  panelMemory,
});
stopOnEntryControl.applyProjectStatus({ hasProject: projectIsInitialized });
azmOptionsControl.applyProjectStatus({ hasProject: projectIsInitialized });

let speedMode: Tec1gSpeedMode = 'fast';
function applySpeed(mode: Tec1gSpeedMode): void {
  speedMode = mode;
  speedEl.textContent = mode.toUpperCase();
  speedEl.classList.toggle('slow', mode === 'slow');
  speedEl.classList.toggle('fast', mode === 'fast');
}

const keypad = createTec1gKeypad(
  vscode,
  keypadEl,
  {
    statusShadow,
    statusProtect,
    statusExpand,
    statusCaps,
    statusBank0,
    statusBank1,
    statusBank2,
    statusBank3,
  },
  {
    onReset: () => {
      matrixUi.resetTransientState();
      vscode.postMessage({
        type: 'reset',
        matrixModeAfterReset: panelLayout.isMatrixKeyboardOpen(),
      });
    },
  }
);
wireKeypadFocusPanels([accordionDisplays, accordionMachine], keypad);

const audio = createTec1gAudio({ muteEl, speakerEl, speakerLabel, vscode });
audio.wireMuteClick();

wireProjectPanelPlatformControls(vscode, projectElements, 'tec1g', () => projectIsInitialized);

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
  tms9918Renderer,
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
    const initialized = applyProjectPanelStatusControls(message, projectElements, {
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
    if (message.targetUiVisibility?.tms9918 === true) {
      panelLayout.setPanelOpen('video', true, true);
    }
    return;
  }
  if (message.type === 'sessionStatus') {
    sessionStatusController.setStatus(message.status);
    panelLayout.setRegisterRefreshActive(
      message.status === 'running' || message.status === 'paused'
    );
    if (message.status === 'running' || message.status === 'paused') {
      reassertMatrixKeyboardOpenState();
    }
    return;
  }
  if (message.type === 'selectTab') {
    panelLayout.setProviderTab(message.tab, false);
    return;
  }
  if (message.type === 'resetPanelLayout') {
    panelLayout.resetPanelLayout();
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
    if (message.matrixMode === false) {
      reassertMatrixKeyboardOpenState();
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
document.addEventListener('pointerdown', () => audio.unlockAudio(), { capture: true });
document.addEventListener('keydown', () => audio.unlockAudio(), { capture: true });
matrixUi.init();
applyMatrixKeyboardOpenState(panelLayout.isMatrixKeyboardOpen());
lcdRenderer.draw();
glcdRenderer.draw();
tms9918Renderer.drawBlank();
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

tms9918Renderer.standardSelect?.addEventListener('change', () => {
  const standard = tms9918Renderer.standardSelect?.value === 'ntsc' ? 'ntsc' : 'pal';
  vscode.postMessage({ type: 'tms9918VideoStandard', standard });
});

function isMatrixCaptureSurface(target: EventTarget | null): boolean {
  if (!(target instanceof Node)) {
    return false;
  }
  return [accordionDisplays, accordionMachine, accordionMatrixKeyboard].some((surface) =>
    surface.contains(target)
  );
}

document.addEventListener(
  'pointerdown',
  (event) => {
    if (!panelLayout.isMatrixKeyboardOpen()) {
      return;
    }
    applyMatrixKeyboardCapture(isMatrixCaptureSurface(event.target));
  },
  { capture: true }
);
window.addEventListener('blur', () => applyMatrixKeyboardCapture(false));

// Matrix keyboard owns physical typing while its accordion panel is open.
window.addEventListener(
  'keydown',
  (event) => {
    if (event.repeat) {
      return;
    }
    if (matrixUi.handleKeyEvent(event, true)) {
      updateMatrixKeyboardCue();
      return;
    }
  },
  { capture: true }
);

window.addEventListener('keydown', (event) => {
  if (panelLayout.isMatrixKeyboardOpen()) {
    return;
  }
  const shortcut = resolveTecKeypadShortcut(event.key);
  routeTecKeypadShortcut(event, shortcut, keypad, () => vscode.postMessage({ type: 'reset' }));
});
window.addEventListener(
  'keyup',
  (event) => {
    if (matrixUi.handleKeyEvent(event, false)) {
      updateMatrixKeyboardCue();
      return;
    }
    if (panelLayout.isMatrixKeyboardOpen()) {
      return;
    }
    routeTecKeypadKeyup(event, keypad);
  },
  { capture: true }
);
window.addEventListener('beforeunload', () => {
  sessionStatusController.dispose();
  stopOnEntryControl.dispose();
  azmOptionsControl.dispose();
  projectStatusUi.dispose();
  projectStatusRefresh.dispose();
});
