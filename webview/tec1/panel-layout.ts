export type PanelTab = 'ui' | 'memory';

const MEMORY_NARROW_MAX = 480;
const MEMORY_WIDE_MIN = 520;

export interface PanelLayoutController {
  getActiveTab(): PanelTab;
  getMemoryRowSize(): number;
  scheduleMemoryResize(): void;
  setTab(tab: string, notify: boolean): void;
  updateMemoryLayout(forceRefresh: boolean): void;
  wireTabButtons(): void;
}

type PanelLayoutOptions = {
  defaultTab: PanelTab;
  memoryPanel: HTMLElement | null;
  panelMemory: HTMLElement | null;
  panelUi: HTMLElement | null;
  postMessage: (message: unknown) => void;
  requestSnapshot: () => void;
  tabButtons: HTMLElement[];
};

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

export function createPanelLayoutController(options: PanelLayoutOptions): PanelLayoutController {
  let activeTab: PanelTab =
    options.defaultTab === 'memory'
      ? 'memory'
      : 'ui';
  let memoryRowSize = 16;
  let resizeTimer: number | null = null;

  const updateMemoryLayout = (forceRefresh: boolean): void => {
    if (activeTab !== 'memory' || !options.memoryPanel) {
      return;
    }
    const next = resolveMemoryRowSize(options.memoryPanel.clientWidth, memoryRowSize);
    if (next !== memoryRowSize) {
      memoryRowSize = next;
      options.requestSnapshot();
      return;
    }
    if (forceRefresh) {
      options.requestSnapshot();
    }
  };

  const setTab = (tab: string, notify: boolean): void => {
    activeTab = tab === 'memory' ? 'memory' : 'ui';
    options.panelUi?.classList.toggle('active', activeTab === 'ui');
    options.panelMemory?.classList.toggle('active', activeTab === 'memory');
    options.tabButtons.forEach((button) => {
      button.classList.toggle('active', button.dataset.tab === activeTab);
    });
    if (notify) {
      options.postMessage({ type: 'tab', tab: activeTab });
    }
    if (activeTab === 'memory') {
      updateMemoryLayout(true);
    }
  };

  return {
    getActiveTab: (): PanelTab => activeTab,
    getMemoryRowSize: (): number => memoryRowSize,
    scheduleMemoryResize(): void {
      if (resizeTimer !== null) {
        clearTimeout(resizeTimer);
      }
      resizeTimer = window.setTimeout(() => {
        resizeTimer = null;
        updateMemoryLayout(false);
      }, 150);
    },
    setTab,
    updateMemoryLayout,
    wireTabButtons(): void {
      options.tabButtons.forEach((button) => {
        button.addEventListener('click', () => {
          const tab = button.dataset.tab;
          if (!tab) {
            return;
          }
          setTab(tab, true);
        });
      });
    },
  };
}
