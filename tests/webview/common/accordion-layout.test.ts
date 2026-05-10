import { describe, expect, it, vi } from 'vitest';
import { createAccordionLayoutController } from '../../../webview/common/accordion-layout';
import type { MemoryPanel } from '../../../webview/common/memory-panel';
import type { VscodeApi } from '../../../webview/common/vscode';

type PostedMessage = { type: string; tab?: string };

function button(panel: string): HTMLButtonElement {
  const element = document.createElement('button');
  element.dataset.accordionToggle = panel;
  return element;
}

function createVscodeMock(messages: PostedMessage[], initialState: unknown = null): VscodeApi {
  let state = initialState;
  return {
    postMessage: (message: unknown) => {
      messages.push(message as PostedMessage);
    },
    getState: () => state,
    setState: (next: unknown) => {
      state = next;
    },
  };
}

describe('accordion layout controller', () => {
  it('defaults to machine and registers open and persists toggled sections', () => {
    const messages: PostedMessage[] = [];
    const memoryPanel = document.createElement('div');
    const memoryController = {
      requestSnapshot: () => {},
      requestRegisterSnapshot: () => {},
    } as unknown as MemoryPanel;
    const registersButton = button('registers');
    const memoryButton = button('memory');
    const vscode = createVscodeMock(messages);

    const controller = createAccordionLayoutController({
      vscode,
      buttons: [button('machine'), registersButton, memoryButton],
      panels: {
        machine: document.createElement('div'),
        registers: document.createElement('div'),
        memory: document.createElement('div'),
      },
      memoryPanel,
      defaultTab: 'ui',
      getMemoryPanelController: () => memoryController,
    });
    controller.wireButtons();

    expect(controller.isMachineOpen()).toBe(true);
    expect(controller.isCpuOpen()).toBe(true);
    expect(controller.isMemoryOpen()).toBe(false);
    expect(controller.getProviderTab()).toBe('ui');

    registersButton.click();
    expect(controller.isCpuOpen()).toBe(false);
    expect(messages.at(-1)).toEqual({ type: 'tab', tab: 'ui' });

    memoryButton.click();
    expect(controller.isMemoryOpen()).toBe(true);
    expect(controller.getProviderTab()).toBe('memory');
    expect(messages.at(-1)).toEqual({ type: 'tab', tab: 'memory' });
    expect(vscode.getState()).toEqual({
      debug80Accordion: {
        machine: true,
        registers: false,
        memory: true,
      },
    });
  });

  it('restores persisted section state from VS Code webview state', () => {
    const messages: PostedMessage[] = [];
    const memoryPanel = document.createElement('div');
    const memoryContent = document.createElement('div');
    const vscode = createVscodeMock(messages, {
      debug80Accordion: {
        machine: false,
        registers: false,
        memory: true,
      },
    });

    const controller = createAccordionLayoutController({
      vscode,
      buttons: [button('machine'), button('registers'), button('memory')],
      panels: {
        machine: document.createElement('div'),
        registers: document.createElement('div'),
        memory: memoryContent,
      },
      memoryPanel,
      defaultTab: 'ui',
      getMemoryPanelController: () => null,
    });

    expect(controller.isMachineOpen()).toBe(false);
    expect(controller.isCpuOpen()).toBe(true);
    expect(controller.isMemoryOpen()).toBe(true);
    expect(memoryContent.hidden).toBe(false);
    expect(controller.getProviderTab()).toBe('memory');
  });

  it('requests a register snapshot when registers are opened without activating memory', () => {
    const messages: PostedMessage[] = [];
    const memoryPanel = document.createElement('div');
    const requestSnapshot = vi.fn();
    const requestRegisterSnapshot = vi.fn();
    const memoryController = { requestSnapshot, requestRegisterSnapshot } as unknown as MemoryPanel;
    const registersButton = button('registers');
    const memoryButton = button('memory');
    const vscode = createVscodeMock(messages, {
      debug80Accordion: {
        machine: true,
        registers: false,
        memory: false,
      },
    });

    const controller = createAccordionLayoutController({
      vscode,
      buttons: [button('machine'), registersButton, memoryButton],
      panels: {
        machine: document.createElement('div'),
        registers: document.createElement('div'),
        memory: document.createElement('div'),
      },
      memoryPanel,
      defaultTab: 'ui',
      getMemoryPanelController: () => memoryController,
    });
    controller.wireButtons();

    registersButton.click();
    expect(controller.isCpuOpen()).toBe(true);
    expect(controller.isMemoryOpen()).toBe(false);
    expect(controller.getProviderTab()).toBe('ui');
    expect(requestSnapshot).not.toHaveBeenCalled();
    expect(requestRegisterSnapshot).toHaveBeenCalledTimes(1);

    memoryButton.click();
    expect(controller.isMemoryOpen()).toBe(true);
    expect(controller.getProviderTab()).toBe('memory');
    expect(requestSnapshot).toHaveBeenCalledTimes(1);
    expect(requestRegisterSnapshot).toHaveBeenCalledTimes(1);
  });

  it('closes memory when the provider selects the UI tab', () => {
    const messages: PostedMessage[] = [];
    const memoryPanel = document.createElement('div');
    const machineContent = document.createElement('div');
    const memoryContent = document.createElement('div');
    const memoryButton = button('memory');
    const requestSnapshot = vi.fn();
    const memoryController = {
      requestSnapshot,
      requestRegisterSnapshot: () => {},
    } as unknown as MemoryPanel;
    const vscode = createVscodeMock(messages, {
      debug80Accordion: {
        machine: true,
        registers: true,
        memory: true,
      },
    });

    const controller = createAccordionLayoutController({
      vscode,
      buttons: [button('machine'), button('registers'), memoryButton],
      panels: {
        machine: machineContent,
        registers: document.createElement('div'),
        memory: memoryContent,
      },
      memoryPanel,
      defaultTab: 'ui',
      getMemoryPanelController: () => memoryController,
    });

    expect(controller.getProviderTab()).toBe('memory');
    expect(controller.isMemoryOpen()).toBe(true);

    controller.setProviderTab('ui', true);

    expect(controller.getProviderTab()).toBe('ui');
    expect(controller.isMachineOpen()).toBe(true);
    expect(controller.isMemoryOpen()).toBe(false);
    expect(machineContent.hidden).toBe(false);
    expect(memoryContent.hidden).toBe(true);
    expect(memoryButton.getAttribute('aria-expanded')).toBe('false');
    expect(messages.at(-1)).toEqual({ type: 'tab', tab: 'ui' });
    expect(requestSnapshot).not.toHaveBeenCalled();
    expect(vscode.getState()).toEqual({
      debug80Accordion: {
        machine: true,
        registers: true,
        memory: false,
      },
    });
  });
});
