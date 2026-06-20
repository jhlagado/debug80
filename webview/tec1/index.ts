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
import {
  getOptionalElementById,
  getOptionalElementBySelector,
  getRequiredElementById,
} from '../common/dom-elements';
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
import { createTec1MessageHandler } from './message-handler';
import { applyTec1PlatformUpdate } from './platform-update';

const vscode = acquireVscodeApi();
const projectElements = getProjectPanelElements(document);
const DEFAULT_TAB: ProviderPanelTab =
  document.body.dataset.activeTab === 'memory' ? 'memory' : 'ui';
const displayEl = getRequiredElementById(document, 'display', HTMLElement);
const keypadEl = getRequiredElementById(document, 'keypad', HTMLElement);
const speakerEl = getRequiredElementById(document, 'speaker', HTMLElement);
const speakerHzEl = getRequiredElementById(document, 'speakerHz', HTMLElement);
const speedEl = getRequiredElementById(document, 'speed', HTMLElement);
const muteEl = getRequiredElementById(document, 'mute', HTMLElement);
const accordionButtons = Array.from(
  document.querySelectorAll<HTMLElement>('[data-accordion-toggle]')
);
const accordionMachine = getRequiredElementById(document, 'accordion-machine', HTMLElement);
const accordionRegisters = getRequiredElementById(document, 'accordion-registers', HTMLElement);
const accordionMemory = getRequiredElementById(document, 'accordion-memory', HTMLElement);
const panelUi = getRequiredElementById(document, 'panel-ui', HTMLElement);
const panelRegisters = getRequiredElementById(document, 'panel-registers', HTMLElement);
const panelMemory = getRequiredElementById(document, 'panel-memory', HTMLElement);
const registerStrip = getRequiredElementById(document, 'registerStrip', HTMLElement);
const memoryPanel = getRequiredElementById(document, 'memoryPanel', HTMLElement);
const toolbarEl = getOptionalElementBySelector(document, '.debug80-toolbar', HTMLElement);
const accordionEl = getOptionalElementById(document, 'debug80Accordion', HTMLElement);
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
const projectStatusUi = createProjectStatusUi(vscode, projectElements.projectStatus, 'tec1');
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
  applyTec1PlatformUpdate(payload, {
    audio,
    applySpeed,
    display,
    lcdRenderer,
    matrixRenderer,
    speakerEl,
    speakerHzEl,
  });
}

const statusEl = getOptionalElementById(document, 'status', HTMLElement);
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

const handleTec1Message = createTec1MessageHandler({
  applyProjectStatus,
  setSessionStatus: (status) => sessionStatusController.setStatus(status),
  setRegisterRefreshActive: (active) => panelLayout.setRegisterRefreshActive(active),
  setProviderTab: (tab, pushState) => panelLayout.setProviderTab(tab, pushState),
  resetPanelLayout: () => panelLayout.resetPanelLayout(),
  applyUpdate,
  handleSnapshot: (payload) =>
    memoryPanelController?.handleSnapshot(payload as Parameters<MemoryPanel['handleSnapshot']>[0]),
  handleSnapshotError: (message) =>
    memoryPanelController?.handleSnapshotError(message as string | undefined),
});

window.addEventListener('message', (event: MessageEvent): void => {
  handleTec1Message(event.data);
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
