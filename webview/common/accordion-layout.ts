import type { MemoryPanel } from './memory-panel';
import type { VscodeApi } from './vscode';

export type AccordionPanel =
  | 'project'
  | 'machine'
  | 'displays'
  | 'video'
  | 'serial'
  | 'matrixKeyboard'
  | 'registers'
  | 'memory';
export type ProviderPanelTab = 'ui' | 'memory';

type StoredAccordionState = {
  debug80Accordion?: Partial<Record<AccordionPanel, boolean>>;
  debug80AccordionOrder?: AccordionPanel[];
};

type AccordionLayoutOptions = {
  vscode: VscodeApi;
  buttons: HTMLElement[];
  panels: Partial<Record<AccordionPanel, HTMLElement | null>>;
  defaultPanelOrder?: AccordionPanel[];
  memoryPanel: HTMLElement | null;
  defaultTab: ProviderPanelTab;
  getMemoryPanelController: () => MemoryPanel | null;
  onPanelOpenChange?: (panel: AccordionPanel, open: boolean) => void;
};

export type AccordionLayoutController = {
  getProviderTab: () => ProviderPanelTab;
  getMemoryRowSize: () => number;
  isMachineOpen: () => boolean;
  isMatrixKeyboardOpen: () => boolean;
  notifyInitialOpenPanels: () => void;
  isCpuOpen: () => boolean;
  isMemoryOpen: () => boolean;
  refreshOpenRegisters: () => void;
  setRegisterRefreshActive: (active: boolean) => void;
  setProviderTab: (tab: string, notify: boolean) => void;
  setPanelOpen: (panel: AccordionPanel, open: boolean, notify: boolean) => void;
  resetPanelLayout: () => void;
  scheduleMemoryResize: () => void;
  updateMemoryLayout: (forceRefresh: boolean) => void;
  wireButtons: () => void;
};

const MEMORY_NARROW_MAX = 480;
const MEMORY_WIDE_MIN = 520;
const REGISTER_REFRESH_INTERVAL_MS = 500;
const DEFAULT_OPEN_STATE: Record<AccordionPanel, boolean> = {
  project: true,
  machine: true,
  displays: true,
  video: false,
  serial: false,
  matrixKeyboard: false,
  registers: true,
  memory: false,
};
const PANEL_SET = new Set<AccordionPanel>([
  'project',
  'machine',
  'displays',
  'video',
  'serial',
  'matrixKeyboard',
  'registers',
  'memory',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readStoredOpenState(vscode: VscodeApi): Partial<Record<AccordionPanel, boolean>> {
  const state = vscode.getState();
  if (!isRecord(state) || !isRecord(state.debug80Accordion)) {
    return {};
  }
  const stored = state.debug80Accordion;
  const result: Partial<Record<AccordionPanel, boolean>> = {};
  if (typeof stored.project === 'boolean') result.project = stored.project;
  if (typeof stored.machine === 'boolean') result.machine = stored.machine;
  if (typeof stored.displays === 'boolean') result.displays = stored.displays;
  if (typeof stored.video === 'boolean') result.video = stored.video;
  if (typeof stored.serial === 'boolean') result.serial = stored.serial;
  if (typeof stored.matrixKeyboard === 'boolean') result.matrixKeyboard = stored.matrixKeyboard;
  if (typeof stored.registers === 'boolean') result.registers = stored.registers;
  if (typeof stored.memory === 'boolean') result.memory = stored.memory;
  return result;
}

function samePanelOrder(left: AccordionPanel[], right: AccordionPanel[]): boolean {
  return left.length === right.length && left.every((panel, index) => panel === right[index]);
}

function repairStaleAppendedPanelOrder(
  storedOrder: AccordionPanel[],
  defaultOrder: AccordionPanel[]
): AccordionPanel[] {
  let repairedOrder = [...storedOrder];
  for (const panel of defaultOrder) {
    const storedIndex = repairedOrder.indexOf(panel);
    const defaultIndex = defaultOrder.indexOf(panel);
    if (
      storedIndex === -1 ||
      storedIndex === defaultIndex ||
      storedIndex !== repairedOrder.length - 1
    ) {
      continue;
    }
    const storedWithoutPanel = repairedOrder.filter((candidate) => candidate !== panel);
    const defaultWithoutPanel = defaultOrder.filter((candidate) => candidate !== panel);
    if (!samePanelOrder(storedWithoutPanel, defaultWithoutPanel)) {
      continue;
    }
    repairedOrder = [...storedWithoutPanel];
    repairedOrder.splice(defaultIndex, 0, panel);
  }
  return repairedOrder;
}

function readStoredPanelOrder(vscode: VscodeApi, defaultOrder: AccordionPanel[]): AccordionPanel[] {
  const state = vscode.getState();
  if (!isRecord(state) || !Array.isArray(state.debug80AccordionOrder)) {
    return [...defaultOrder];
  }
  const defaultSet = new Set(defaultOrder);
  const seen = new Set<AccordionPanel>();
  const storedOrder = state.debug80AccordionOrder.filter((panel): panel is AccordionPanel => {
    if (!defaultSet.has(panel as AccordionPanel) || seen.has(panel as AccordionPanel)) {
      return false;
    }
    seen.add(panel as AccordionPanel);
    return true;
  });
  const mergedOrder = repairStaleAppendedPanelOrder(storedOrder, defaultOrder);
  seen.clear();
  for (const panel of mergedOrder) {
    seen.add(panel);
  }
  for (const panel of defaultOrder) {
    if (seen.has(panel)) {
      continue;
    }
    const defaultIndex = defaultOrder.indexOf(panel);
    let insertIndex = mergedOrder.length;
    for (let i = defaultIndex + 1; i < defaultOrder.length; i += 1) {
      const nextDefaultPanel = defaultOrder[i];
      const existingIndex =
        nextDefaultPanel === undefined ? -1 : mergedOrder.indexOf(nextDefaultPanel);
      if (existingIndex !== -1) {
        insertIndex = existingIndex;
        break;
      }
    }
    mergedOrder.splice(insertIndex, 0, panel);
    seen.add(panel);
  }
  return mergedOrder;
}

function writeStoredAccordionState(
  vscode: VscodeApi,
  openState: Record<AccordionPanel, boolean>,
  panelOrder: AccordionPanel[]
): void {
  const current = vscode.getState();
  const base = isRecord(current) ? current : {};
  const next: StoredAccordionState & Record<string, unknown> = {
    ...base,
    debug80Accordion: { ...openState },
    debug80AccordionOrder: [...panelOrder],
  };
  vscode.setState(next);
}

function resolveMemoryRowSize(width: number, currentSize: number): number {
  if (!Number.isFinite(width)) {
    return currentSize;
  }
  if (width <= MEMORY_NARROW_MAX) {
    return 8;
  }
  if (width >= MEMORY_WIDE_MIN) {
    return 16;
  }
  return currentSize;
}

export function createAccordionLayoutController(
  options: AccordionLayoutOptions
): AccordionLayoutController {
  const sectionByPanel = new Map<AccordionPanel, HTMLElement>();
  const orderControlsByPanel = new Map<
    AccordionPanel,
    { moveUp: HTMLButtonElement; moveDown: HTMLButtonElement }
  >();
  const buttonOrder = options.buttons
    .map((button) => button.dataset.accordionToggle)
    .filter((panel): panel is AccordionPanel =>
      Boolean(panel && PANEL_SET.has(panel as AccordionPanel))
    );
  const defaultPanelOrder =
    options.defaultPanelOrder?.filter((panel) => buttonOrder.includes(panel)) ?? [];
  const defaultOrder = [
    ...defaultPanelOrder,
    ...buttonOrder.filter((panel) => !defaultPanelOrder.includes(panel)),
  ];
  let panelOrder = readStoredPanelOrder(options.vscode, defaultOrder);
  const stored = readStoredOpenState(options.vscode);
  const openState: Record<AccordionPanel, boolean> = {
    ...DEFAULT_OPEN_STATE,
    ...stored,
  };
  if (
    options.defaultTab === 'memory' &&
    stored.memory === undefined &&
    stored.registers === undefined
  ) {
    openState.memory = true;
  }

  let providerTab: ProviderPanelTab = openState.memory ? 'memory' : 'ui';
  let memoryRowSize = 16;
  let resizeTimer: number | null = null;
  let registerRefreshActive = false;
  let registerRefreshTimer: number | null = null;
  const panelLabels: Record<AccordionPanel, string> = {
    project: 'Project',
    machine: 'Machine',
    displays: 'Displays',
    video: 'TMS9918 Video',
    serial: 'Serial',
    matrixKeyboard: 'Matrix Keyboard',
    registers: 'Registers',
    memory: 'Memory',
  };

  function getContent(panel: AccordionPanel): HTMLElement | null {
    return options.panels[panel] ?? null;
  }

  function applyPanelState(panel: AccordionPanel): void {
    const content = getContent(panel);
    if (content) {
      content.hidden = !openState[panel];
      content.classList.toggle('active', openState[panel]);
    }
    for (const button of options.buttons) {
      if (button.dataset.accordionToggle !== panel) {
        continue;
      }
      button.classList.toggle('active', openState[panel]);
      button.setAttribute('aria-expanded', openState[panel] ? 'true' : 'false');
    }
  }

  function getAccordionRoot(): HTMLElement | null {
    return options.buttons[0]?.closest('.debug80-accordion') as HTMLElement | null;
  }

  function createMoveButton(panel: AccordionPanel, direction: 'up' | 'down'): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'debug80-accordion-move-button';
    button.dataset.accordionMove = direction;
    button.dataset.accordionPanel = panel;
    button.textContent = direction === 'up' ? '↑' : '↓';
    button.title = `Move ${panelLabels[panel]} ${direction}`;
    button.setAttribute('aria-label', `Move ${panelLabels[panel]} ${direction}`);
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      movePanel(panel, direction);
    });
    return button;
  }

  function prepareOrderControls(): void {
    for (const button of options.buttons) {
      const panel = button.dataset.accordionToggle as AccordionPanel | undefined;
      if (!panel || !PANEL_SET.has(panel)) {
        continue;
      }
      const section = button.closest('.debug80-accordion-section') as HTMLElement | null;
      if (!section) {
        continue;
      }
      sectionByPanel.set(panel, section);
      const row = document.createElement('div');
      row.className = 'debug80-accordion-header-row';
      section.insertBefore(row, button);
      row.appendChild(button);
      const controls = document.createElement('div');
      controls.className = 'debug80-accordion-move-controls';
      const moveUp = createMoveButton(panel, 'up');
      const moveDown = createMoveButton(panel, 'down');
      controls.append(moveUp, moveDown);
      row.appendChild(controls);
      orderControlsByPanel.set(panel, { moveUp, moveDown });
    }
  }

  function applyPanelOrder(): void {
    const root = getAccordionRoot();
    if (!root) {
      return;
    }
    for (const panel of panelOrder) {
      const section = sectionByPanel.get(panel);
      if (section) {
        root.appendChild(section);
      }
    }
    for (const panel of panelOrder) {
      const controls = orderControlsByPanel.get(panel);
      if (!controls) {
        continue;
      }
      const index = panelOrder.indexOf(panel);
      controls.moveUp.disabled = index <= 0;
      controls.moveDown.disabled = index === -1 || index >= panelOrder.length - 1;
    }
  }

  function movePanel(panel: AccordionPanel, direction: 'up' | 'down'): void {
    const index = panelOrder.indexOf(panel);
    if (index === -1) {
      return;
    }
    const nextIndex = direction === 'up' ? index - 1 : index + 1;
    if (nextIndex < 0 || nextIndex >= panelOrder.length) {
      return;
    }
    const nextOrder = [...panelOrder];
    [nextOrder[index], nextOrder[nextIndex]] = [nextOrder[nextIndex], nextOrder[index]];
    panelOrder = nextOrder;
    applyPanelOrder();
    writeStoredAccordionState(options.vscode, openState, panelOrder);
  }

  function getNextProviderTab(): ProviderPanelTab {
    return openState.memory ? 'memory' : 'ui';
  }

  function syncProviderTab(notify: boolean): void {
    const next = getNextProviderTab();
    providerTab = next;
    if (notify) {
      options.vscode.postMessage({ type: 'tab', tab: next });
    }
  }

  function updateMemoryLayout(forceRefresh: boolean): void {
    if (!openState.memory || !options.memoryPanel) {
      return;
    }
    const next = resolveMemoryRowSize(options.memoryPanel.clientWidth, memoryRowSize);
    if (next !== memoryRowSize) {
      memoryRowSize = next;
      options.getMemoryPanelController()?.requestSnapshot();
      return;
    }
    if (forceRefresh) {
      options.getMemoryPanelController()?.requestSnapshot();
    }
  }

  function refreshOpenRegisters(): void {
    if (openState.registers) {
      options.getMemoryPanelController()?.requestRegisterSnapshot();
    }
  }

  function syncRegisterRefresh(): void {
    const shouldRefresh = registerRefreshActive && openState.registers && !openState.memory;
    if (!shouldRefresh) {
      if (registerRefreshTimer !== null) {
        clearInterval(registerRefreshTimer);
        registerRefreshTimer = null;
      }
      return;
    }
    if (registerRefreshTimer !== null) {
      return;
    }
    refreshOpenRegisters();
    registerRefreshTimer = window.setInterval(refreshOpenRegisters, REGISTER_REFRESH_INTERVAL_MS);
  }

  function setRegisterRefreshActive(active: boolean): void {
    registerRefreshActive = active;
    syncRegisterRefresh();
  }

  function setOpen(panel: AccordionPanel, open: boolean, notify: boolean): void {
    openState[panel] = open;
    applyPanelState(panel);
    writeStoredAccordionState(options.vscode, openState, panelOrder);
    options.onPanelOpenChange?.(panel, open);
    syncProviderTab(notify);
    if (panel === 'memory' && open) {
      updateMemoryLayout(true);
    }
    if (panel === 'registers' && open) {
      refreshOpenRegisters();
    }
    syncRegisterRefresh();
  }

  function setProviderTab(tab: string, notify: boolean): void {
    if (tab === 'memory') {
      setOpen('memory', true, notify);
      return;
    }
    openState.machine = true;
    openState.memory = false;
    applyPanelState('machine');
    applyPanelState('memory');
    writeStoredAccordionState(options.vscode, openState, panelOrder);
    syncProviderTab(notify);
    syncRegisterRefresh();
  }

  function resetPanelLayout(): void {
    const previousOpenState: Record<AccordionPanel, boolean> = { ...openState };
    panelOrder = [...defaultOrder];
    for (const panel of Object.keys(openState) as AccordionPanel[]) {
      openState[panel] = DEFAULT_OPEN_STATE[panel];
    }
    applyPanelOrder();
    (Object.keys(openState) as AccordionPanel[]).forEach(applyPanelState);
    writeStoredAccordionState(options.vscode, openState, panelOrder);
    for (const panel of panelOrder) {
      if (previousOpenState[panel] !== openState[panel]) {
        options.onPanelOpenChange?.(panel, openState[panel]);
      }
    }
    syncProviderTab(true);
    updateMemoryLayout(true);
    syncRegisterRefresh();
  }

  prepareOrderControls();
  applyPanelOrder();
  (Object.keys(openState) as AccordionPanel[]).forEach(applyPanelState);
  writeStoredAccordionState(options.vscode, openState, panelOrder);
  syncProviderTab(false);

  return {
    getProviderTab: () => providerTab,
    getMemoryRowSize: () => memoryRowSize,
    isMachineOpen: () => openState.machine,
    notifyInitialOpenPanels(): void {
      if (openState.matrixKeyboard) {
        options.onPanelOpenChange?.('matrixKeyboard', true);
      }
      if (openState.video) {
        options.onPanelOpenChange?.('video', true);
      }
    },
    isCpuOpen: () => openState.registers || openState.memory,
    isMemoryOpen: () => openState.memory,
    refreshOpenRegisters,
    setRegisterRefreshActive,
    setPanelOpen: setOpen,
    resetPanelLayout,
    setProviderTab,
    scheduleMemoryResize(): void {
      if (resizeTimer !== null) {
        clearTimeout(resizeTimer);
      }
      resizeTimer = window.setTimeout(() => {
        resizeTimer = null;
        updateMemoryLayout(false);
      }, 150);
    },
    updateMemoryLayout,
    wireButtons(): void {
      options.buttons.forEach((button) => {
        button.addEventListener('click', () => {
          const panel = button.dataset.accordionToggle as AccordionPanel | undefined;
          if (!panel || !(panel in openState)) {
            return;
          }
          setOpen(panel, !openState[panel], true);
        });
      });
    },
    isMatrixKeyboardOpen: () => openState.matrixKeyboard,
  };
}
