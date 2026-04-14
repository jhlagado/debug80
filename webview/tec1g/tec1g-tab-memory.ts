/**
 * @file UI / memory tab switching and responsive memory row size for the TEC-1G webview.
 */

import type { VscodeApi } from '../common/vscode';
import type { Tec1gPanelTab } from './entry-types';
import type { MemoryPanel } from '../common/memory-panel';

const MEMORY_NARROW_MAX = 480;
const MEMORY_WIDE_MIN = 520;

export type Tec1gTabMemoryOptions = {
  vscode: VscodeApi;
  tabButtons: HTMLElement[];
  panelUi: HTMLElement | null;
  panelMemory: HTMLElement | null;
  memoryPanel: HTMLElement | null;
  defaultTab: Tec1gPanelTab;
  getMemoryPanelController: () => MemoryPanel | null;
};

export type Tec1gTabMemory = {
  getActiveTab: () => Tec1gPanelTab;
  getMemoryRowSize: () => number;
  setTab: (tab: string, notify: boolean) => void;
  scheduleMemoryResize: () => void;
  updateMemoryLayout: (forceRefresh: boolean) => void;
};

/**
 * Tab visibility, `tab` postMessage, and memory panel width → snapshot row size.
 */
export function createTec1gTabMemory(options: Tec1gTabMemoryOptions): Tec1gTabMemory {
  const { vscode, tabButtons, panelUi, panelMemory, memoryPanel, defaultTab, getMemoryPanelController } = options;

  let activeTab: Tec1gPanelTab = defaultTab === 'memory' ? 'memory' : 'ui';
  let memoryRowSize = 16;
  let resizeTimer: number | null = null;

  function resolveMemoryRowSize(width: number): number {
    if (!Number.isFinite(width)) {
      return memoryRowSize;
    }
    if (width <= MEMORY_NARROW_MAX) {
      return 8;
    }
    if (width >= MEMORY_WIDE_MIN) {
      return 16;
    }
    return memoryRowSize;
  }

  function updateMemoryLayout(forceRefresh: boolean): void {
    if (activeTab !== 'memory') {
      return;
    }
    if (!memoryPanel) {
      return;
    }
    const next = resolveMemoryRowSize(memoryPanel.clientWidth);
    if (next !== memoryRowSize) {
      memoryRowSize = next;
      getMemoryPanelController()?.requestSnapshot();
      return;
    }
    if (forceRefresh) {
      getMemoryPanelController()?.requestSnapshot();
    }
  }

  function scheduleMemoryResize(): void {
    if (resizeTimer !== null) {
      clearTimeout(resizeTimer);
    }
    resizeTimer = setTimeout(() => {
      resizeTimer = null;
      updateMemoryLayout(false);
    }, 150);
  }

  function setTab(tab: string, notify: boolean): void {
    activeTab = tab === 'memory' ? 'memory' : 'ui';
    if (panelUi) {
      panelUi.classList.toggle('active', activeTab === 'ui');
    }
    if (panelMemory) {
      panelMemory.classList.toggle('active', activeTab === 'memory');
    }
    tabButtons.forEach((button) => {
      const isActive = button.dataset.tab === activeTab;
      button.classList.toggle('active', isActive);
    });
    if (notify) {
      vscode.postMessage({ type: 'tab', tab: activeTab });
    }
    if (activeTab === 'memory') {
      updateMemoryLayout(true);
    }
  }

  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const tab = button.dataset.tab;
      if (!tab) {
        return;
      }
      setTab(tab, true);
    });
  });

  return {
    getActiveTab: () => activeTab,
    getMemoryRowSize: () => memoryRowSize,
    setTab,
    scheduleMemoryResize,
    updateMemoryLayout,
  };
}
