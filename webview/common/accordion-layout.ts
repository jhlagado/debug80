import type { MemoryPanel } from './memory-panel';
import type { VscodeApi } from './vscode';

export type AccordionPanel = 'machine' | 'registers' | 'memory';
export type ProviderPanelTab = 'ui' | 'memory';

type StoredAccordionState = {
  debug80Accordion?: Partial<Record<AccordionPanel, boolean>>;
};

type AccordionLayoutOptions = {
  vscode: VscodeApi;
  buttons: HTMLElement[];
  panels: Partial<Record<AccordionPanel, HTMLElement | null>>;
  memoryPanel: HTMLElement | null;
  defaultTab: ProviderPanelTab;
  getMemoryPanelController: () => MemoryPanel | null;
};

export type AccordionLayoutController = {
  getProviderTab: () => ProviderPanelTab;
  getMemoryRowSize: () => number;
  isMachineOpen: () => boolean;
  isCpuOpen: () => boolean;
  isMemoryOpen: () => boolean;
  refreshOpenRegisters: () => void;
  setProviderTab: (tab: string, notify: boolean) => void;
  scheduleMemoryResize: () => void;
  updateMemoryLayout: (forceRefresh: boolean) => void;
  wireButtons: () => void;
};

const MEMORY_NARROW_MAX = 480;
const MEMORY_WIDE_MIN = 520;
const DEFAULT_OPEN_STATE: Record<AccordionPanel, boolean> = {
  machine: true,
  registers: true,
  memory: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readStoredOpenState(vscode: VscodeApi): Partial<Record<AccordionPanel, boolean>> {
  const state = vscode.getState();
  if (!isRecord(state) || !isRecord(state.debug80Accordion)) {
    return {};
  }
  const stored = state.debug80Accordion;
  return {
    machine: typeof stored.machine === 'boolean' ? stored.machine : undefined,
    registers: typeof stored.registers === 'boolean' ? stored.registers : undefined,
    memory: typeof stored.memory === 'boolean' ? stored.memory : undefined,
  };
}

function writeStoredOpenState(
  vscode: VscodeApi,
  openState: Record<AccordionPanel, boolean>
): void {
  const current = vscode.getState();
  const base = isRecord(current) ? current : {};
  const next: StoredAccordionState & Record<string, unknown> = {
    ...base,
    debug80Accordion: { ...openState },
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
  const stored = readStoredOpenState(options.vscode);
  const openState: Record<AccordionPanel, boolean> = {
    ...DEFAULT_OPEN_STATE,
    ...stored,
  };
  if (options.defaultTab === 'memory' && stored.memory === undefined && stored.registers === undefined) {
    openState.memory = true;
  }

  let providerTab: ProviderPanelTab = openState.memory ? 'memory' : 'ui';
  let memoryRowSize = 16;
  let resizeTimer: number | null = null;

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

  function setOpen(panel: AccordionPanel, open: boolean, notify: boolean): void {
    openState[panel] = open;
    applyPanelState(panel);
    writeStoredOpenState(options.vscode, openState);
    syncProviderTab(notify);
    if (panel === 'memory' && open) {
      updateMemoryLayout(true);
    }
    if (panel === 'registers' && open) {
      refreshOpenRegisters();
    }
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
    writeStoredOpenState(options.vscode, openState);
    syncProviderTab(notify);
  }

  (Object.keys(openState) as AccordionPanel[]).forEach(applyPanelState);
  writeStoredOpenState(options.vscode, openState);
  syncProviderTab(false);

  return {
    getProviderTab: () => providerTab,
    getMemoryRowSize: () => memoryRowSize,
    isMachineOpen: () => openState.machine,
    isCpuOpen: () => openState.registers || openState.memory,
    isMemoryOpen: () => openState.memory,
    refreshOpenRegisters,
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
  };
}
