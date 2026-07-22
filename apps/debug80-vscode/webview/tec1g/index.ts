/**
 * @file TEC-1G webview composition root: wires feature modules and extension messages.
 */

import { createSevenSegDisplay } from '../common/seven-seg-display';
import { createSevenSegmentScanPlayer } from '../common/seven-seg-scan-player';
import { MemoryPanel } from '../common/memory-panel';
import { createSessionStatusController } from '../common/session-status';
import { wireStopOnEntryControl } from '../common/stop-on-entry-control';
import { wireSymbolCaseControl } from '../common/symbol-case-control';
import { wireAzmOptionsControl } from '../common/azm-options-control';
import {
  getOptionalElementById,
  getOptionalElementBySelector,
  getRequiredElementById,
} from '../common/dom-elements';
import {
  applyProjectPanelStatusControls,
  getProjectPanelElements,
  wireProjectPanelPlatformControls,
} from '../common/project-panel-elements';
import {
  releaseAllTecKeypadKeys,
  routeTecKeypadKeyup,
  routeTecKeypadShortcut,
  wireKeypadFocusPanels,
} from '../common/keypad-focus-routing';
import { acquireVscodeApi } from '../common/vscode';
import { createAccordionLayoutController, type ProviderPanelTab } from '../common/accordion-layout';
import { createGlcdRenderer } from './glcd-renderer';
import { createLcdRenderer } from './lcd-renderer';
import { createJoystickUiController } from './joystick-ui';
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
import {
  createKeyboardOwnerController,
  shouldBypassEmulatorKeyboardTarget,
  type KeyboardOwner,
} from './keyboard-owner';

type Tec1gProjectStatusMessage = Extract<IncomingMessage, { type: 'projectStatus' }>;

const vscode = acquireVscodeApi();
const projectElements = getProjectPanelElements(document);

const DEFAULT_TAB: ProviderPanelTab =
  document.body.dataset.activeTab === 'memory' ? 'memory' : 'ui';

const azmRegisterContractsModeSelect = getOptionalElementById(
  document,
  'azmRegisterContractsMode',
  HTMLSelectElement
);
const azmContractUpdateModeSelect = getOptionalElementById(
  document,
  'azmContractUpdateMode',
  HTMLSelectElement
);
const azmSymbolCaseInput = getOptionalElementById(document, 'azmSymbolCase', HTMLInputElement);
const displayEl = getRequiredElementById(document, 'display', HTMLElement);
const keypadEl = getRequiredElementById(document, 'keypad', HTMLElement);
const keypadRoutingCue = getOptionalElementById(document, 'keypadRoutingCue', HTMLElement);
const speakerEl = getRequiredElementById(document, 'speaker', HTMLElement);
const speakerLabel = getRequiredElementById(document, 'speakerLabel', HTMLElement);
const speedEl = getRequiredElementById(document, 'speed', HTMLElement);
const muteEl = getRequiredElementById(document, 'mute', HTMLElement);
const statusShadow = getRequiredElementById(document, 'statusShadow', HTMLElement);
const statusProtect = getRequiredElementById(document, 'statusProtect', HTMLElement);
const statusExpand = getRequiredElementById(document, 'statusExpand', HTMLElement);
const statusCaps = getRequiredElementById(document, 'statusCaps', HTMLElement);
const statusBank0 = getRequiredElementById(document, 'statusBank0', HTMLElement);
const statusBank1 = getRequiredElementById(document, 'statusBank1', HTMLElement);
const statusBank2 = getRequiredElementById(document, 'statusBank2', HTMLElement);
const statusBank3 = getRequiredElementById(document, 'statusBank3', HTMLElement);
const accordionButtons = Array.from(
  document.querySelectorAll<HTMLElement>('[data-accordion-toggle]')
);
const matrixKeyboardHeader =
  accordionButtons.find((button) => button.dataset.accordionToggle === 'matrixKeyboard') ?? null;
const accordionProject = getRequiredElementById(document, 'accordion-project', HTMLElement);
const accordionMachine = getRequiredElementById(document, 'accordion-machine', HTMLElement);
const accordionDisplays = getRequiredElementById(document, 'accordion-displays', HTMLElement);
const accordionVideo = getRequiredElementById(document, 'accordion-video', HTMLElement);
const accordionJoystick = getRequiredElementById(document, 'accordion-joystick', HTMLElement);
const accordionSerial = getRequiredElementById(document, 'accordion-serial', HTMLElement);
const accordionMatrixKeyboard = getRequiredElementById(
  document,
  'accordion-matrix-keyboard',
  HTMLElement
);
const accordionRegisters = getRequiredElementById(document, 'accordion-registers', HTMLElement);
const accordionMemory = getRequiredElementById(document, 'accordion-memory', HTMLElement);
const panelUi = getRequiredElementById(document, 'panel-ui', HTMLElement);
const panelRegisters = getRequiredElementById(document, 'panel-registers', HTMLElement);
const panelMemory = getRequiredElementById(document, 'panel-memory', HTMLElement);
const toolbarEl = getOptionalElementBySelector(document, '.debug80-toolbar', HTMLElement);
const accordionEl = getOptionalElementById(document, 'debug80Accordion', HTMLElement);
const registerStrip = getRequiredElementById(document, 'registerStrip', HTMLElement);
const memoryPanelEl = getRequiredElementById(document, 'memoryPanel', HTMLElement);

const display = createSevenSegDisplay(displayEl, TEC1G_DIGITS, {
  digitClassName: (index) => (index < 2 ? 'digit--data' : 'digit--address'),
});
const segmentPlayer = createSevenSegmentScanPlayer(display);

const sessionStatusController = createSessionStatusController(
  vscode,
  projectElements.restartButton,
  projectElements.buildButton
);
const stopOnEntryControl = wireStopOnEntryControl(vscode, projectElements.stopOnEntryInput);
const symbolCaseControl = wireSymbolCaseControl(vscode, azmSymbolCaseInput);
const azmOptionsControl = wireAzmOptionsControl(
  vscode,
  azmRegisterContractsModeSelect,
  azmContractUpdateModeSelect
);

const glcdRenderer = createGlcdRenderer();
const lcdRenderer = createLcdRenderer();
const tms9918Renderer = createTms9918Renderer();
const matrixUi = createMatrixUiController(vscode, () => !accordionMatrixKeyboard.hidden);
const keyboardOwner = createKeyboardOwnerController({
  onOwnerChange: (_owner, previousOwner) => applyKeyboardOwnerState(previousOwner),
});
const joystickUi = createJoystickUiController(
  vscode,
  () => keyboardOwner.getOwner() === 'joystick'
);

function updateMatrixKeyboardCue(): void {
  applyMatrixRoutingCue(
    {
      appRoot: projectElements.initializedControls.appRoot ?? null,
      keypad: keypadEl,
      cue: keypadRoutingCue,
      header: matrixKeyboardHeader,
    },
    panelLayout.isMatrixKeyboardOpen(),
    keyboardOwner.getOwner() === 'matrixKeyboard' && matrixUi.isKeyboardCaptured(),
    keyboardOwner.getOwner()
  );
}

function applyMatrixKeyboardCapture(captured: boolean): void {
  matrixUi.applyKeyboardCapture(
    captured && keyboardOwner.getOwner() === 'matrixKeyboard' && panelLayout.isMatrixKeyboardOpen()
  );
  updateMatrixKeyboardCue();
}

function applyMatrixKeyboardOpenState(open: boolean): void {
  vscode.postMessage({ type: 'matrixMode', enabled: open });
  syncKeyboardOwnerVisibility();
}

function reassertMatrixKeyboardOpenState(): void {
  if (panelLayout.isMatrixKeyboardOpen()) {
    applyMatrixKeyboardOpenState(true);
  }
}

function keyboardOwnerVisibility(): {
  keypad: boolean;
  matrixKeyboard: boolean;
  joystick: boolean;
} {
  return {
    keypad: !accordionMachine.hidden && !panelLayout.isMatrixKeyboardOpen(),
    matrixKeyboard: panelLayout.isMatrixKeyboardOpen(),
    joystick: !accordionJoystick.hidden,
  };
}

function applyKeyboardOwnerState(previousOwner: KeyboardOwner = null): void {
  const owner = keyboardOwner.getOwner();
  if (previousOwner === 'joystick' && owner !== 'joystick') {
    joystickUi.clear();
  }
  if (previousOwner === 'matrixKeyboard' && owner !== 'matrixKeyboard') {
    matrixUi.releaseKeyboardCapture();
  }
  applyMatrixKeyboardCapture(owner === 'matrixKeyboard');
}

function syncKeyboardOwnerVisibility(): void {
  keyboardOwner.syncVisibility(keyboardOwnerVisibility());
  applyKeyboardOwnerState();
}

function selectKeyboardOwner(owner: Exclude<KeyboardOwner, null>): void {
  keyboardOwner.selectOwner(owner);
  applyKeyboardOwnerState();
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
    joystick: accordionJoystick,
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
    'joystick',
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
    if (panel === 'joystick' && !open) {
      joystickUi.clear();
    }
    if (panel === 'video') {
      vscode.postMessage({ type: 'tms9918Active', enabled: open });
    }
    syncKeyboardOwnerVisibility();
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
    onReset: (state) => {
      releaseAllTecKeypadKeys(keypad);
      joystickUi.clear();
      matrixUi.resetTransientState();
      vscode.postMessage({
        type: 'reset',
        ...(state.fn ? { fn: true } : {}),
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
  segmentPlayer,
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

function applyProjectStatusMessage(message: Tec1gProjectStatusMessage): void {
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
  symbolCaseControl.applyProjectStatus({
    hasProject: initialized,
    azmSymbolCase: message.azmSymbolCase,
  });
  if (message.targetUiVisibility?.tms9918 === true) {
    panelLayout.setPanelOpen('video', true, true);
  }
}

const statusEl = getOptionalElementById(document, 'status', HTMLElement);
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
    applyProjectStatusMessage(message);
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
joystickUi.init();
applyMatrixKeyboardOpenState(panelLayout.isMatrixKeyboardOpen());
syncKeyboardOwnerVisibility();
lcdRenderer.draw();
glcdRenderer.draw();
tms9918Renderer.drawBlank();
panelLayout.setProviderTab(DEFAULT_TAB, false);
vscode.postMessage({ type: 'tab', tab: panelLayout.getProviderTab() });
requestProjectStatus(vscode);
if (keyboardOwner.getOwner() === 'keypad') {
  keypad.focusKeypad();
}
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

function isHardwareKeyboardSurface(target: EventTarget | null): target is Node {
  if (!(target instanceof Node)) {
    return false;
  }
  return [accordionMachine, accordionMatrixKeyboard, accordionJoystick].some((surface) =>
    surface.contains(target)
  );
}

function shouldBypassEmulatorKeyboard(event: KeyboardEvent): boolean {
  return shouldBypassEmulatorKeyboardTarget(event.target);
}

document.addEventListener(
  'pointerdown',
  (event) => {
    const target = event.target;
    if (shouldBypassEmulatorKeyboardTarget(target)) {
      return;
    }
    if (!isHardwareKeyboardSurface(target)) {
      return;
    }
    if (accordionJoystick.contains(target)) {
      selectKeyboardOwner('joystick');
      return;
    }
    if (accordionMatrixKeyboard.contains(target)) {
      selectKeyboardOwner('matrixKeyboard');
      return;
    }
    if (accordionMachine.contains(target)) {
      selectKeyboardOwner('keypad');
    }
  },
  { capture: true }
);
window.addEventListener('blur', () => {
  releaseAllTecKeypadKeys(keypad);
  applyMatrixKeyboardCapture(false);
  joystickUi.clear();
});

window.addEventListener(
  'keydown',
  (event) => {
    if (event.repeat || shouldBypassEmulatorKeyboard(event)) {
      return;
    }
    if (keyboardOwner.getOwner() === 'matrixKeyboard' && matrixUi.handleKeyEvent(event, true)) {
      updateMatrixKeyboardCue();
      return;
    }
    if (keyboardOwner.getOwner() === 'joystick' && joystickUi.handleKeyEvent(event, true)) {
      return;
    }
    if (keyboardOwner.getOwner() === 'keypad') {
      const shortcut = resolveTecKeypadShortcut(event.key);
      routeTecKeypadShortcut(event, shortcut, keypad, ({ fn }) => {
        releaseAllTecKeypadKeys(keypad);
        vscode.postMessage(fn ? { type: 'reset', fn: true } : { type: 'reset' });
      });
      return;
    }
  },
  { capture: true }
);

window.addEventListener(
  'keyup',
  (event) => {
    if (shouldBypassEmulatorKeyboard(event)) {
      return;
    }
    if (keyboardOwner.getOwner() === 'matrixKeyboard' && matrixUi.handleKeyEvent(event, false)) {
      updateMatrixKeyboardCue();
      return;
    }
    if (keyboardOwner.getOwner() === 'joystick' && joystickUi.handleKeyEvent(event, false)) {
      return;
    }
    if (keyboardOwner.getOwner() === 'keypad') {
      routeTecKeypadKeyup(event, keypad);
    }
  },
  { capture: true }
);
window.addEventListener('beforeunload', () => {
  releaseAllTecKeypadKeys(keypad);
  sessionStatusController.dispose();
  stopOnEntryControl.dispose();
  azmOptionsControl.dispose();
  projectStatusUi.dispose();
  projectStatusRefresh.dispose();
});
