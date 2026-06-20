import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAccordionLayoutController } from '../../../webview/common/accordion-layout';
import type { MemoryPanel } from '../../../webview/common/memory-panel';
import type { VscodeApi } from '../../../webview/common/vscode';

type PostedMessage = { type: string; tab?: string };

function button(panel: string): HTMLButtonElement {
  const element = document.createElement('button');
  element.dataset.accordionToggle = panel;
  return element;
}

function accordionFixture(panels: string[]): {
  root: HTMLElement;
  buttons: HTMLButtonElement[];
  sections: HTMLElement[];
} {
  const root = document.createElement('div');
  root.className = 'debug80-accordion';
  const buttons = panels.map((panel) => {
    const section = document.createElement('section');
    section.className = 'debug80-accordion-section';
    section.dataset.panel = panel;
    const header = button(panel);
    section.appendChild(header);
    root.appendChild(section);
    return header;
  });
  document.body.appendChild(root);
  return {
    root,
    buttons,
    sections: Array.from(root.querySelectorAll<HTMLElement>('.debug80-accordion-section')),
  };
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
  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

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
        project: true,
        machine: true,
        displays: true,
        video: false,
        serial: false,
        matrixKeyboard: false,
        registers: false,
        memory: true,
      },
      debug80AccordionOrder: ['machine', 'registers', 'memory'],
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

  it('exposes restored matrix keyboard attachment without synchronously notifying during construction', () => {
    const messages: PostedMessage[] = [];
    const panelChanges: Array<{ panel: string; open: boolean }> = [];
    const matrixKeyboardContent = document.createElement('div');
    const vscode = createVscodeMock(messages, {
      debug80Accordion: {
        matrixKeyboard: true,
      },
    });

    const controller = createAccordionLayoutController({
      vscode,
      buttons: [button('machine'), button('matrixKeyboard'), button('memory')],
      panels: {
        machine: document.createElement('div'),
        matrixKeyboard: matrixKeyboardContent,
        memory: document.createElement('div'),
      },
      memoryPanel: document.createElement('div'),
      defaultTab: 'ui',
      getMemoryPanelController: () => null,
      onPanelOpenChange: (panel, open) => panelChanges.push({ panel, open }),
    });

    expect(controller.isMatrixKeyboardOpen()).toBe(true);
    expect(matrixKeyboardContent.hidden).toBe(false);
    expect(panelChanges).toEqual([]);

    controller.notifyInitialOpenPanels();

    expect(panelChanges).toContainEqual({ panel: 'matrixKeyboard', open: true });
  });

  it('toggles serial and matrix keyboard panels without switching provider tabs', () => {
    const messages: PostedMessage[] = [];
    const panelChanges: Array<{ panel: string; open: boolean }> = [];
    const serialButton = button('serial');
    const matrixKeyboardButton = button('matrixKeyboard');
    const serialContent = document.createElement('div');
    const matrixKeyboardContent = document.createElement('div');
    const vscode = createVscodeMock(messages);

    const controller = createAccordionLayoutController({
      vscode,
      buttons: [button('machine'), serialButton, matrixKeyboardButton, button('memory')],
      panels: {
        machine: document.createElement('div'),
        serial: serialContent,
        matrixKeyboard: matrixKeyboardContent,
        memory: document.createElement('div'),
      },
      memoryPanel: document.createElement('div'),
      defaultTab: 'ui',
      getMemoryPanelController: () => null,
      onPanelOpenChange: (panel, open) => panelChanges.push({ panel, open }),
    });
    controller.wireButtons();

    expect(serialContent.hidden).toBe(true);
    expect(matrixKeyboardContent.hidden).toBe(true);
    expect(serialButton.getAttribute('aria-expanded')).toBe('false');
    expect(matrixKeyboardButton.getAttribute('aria-expanded')).toBe('false');

    serialButton.click();
    matrixKeyboardButton.click();

    expect(controller.getProviderTab()).toBe('ui');
    expect(serialContent.hidden).toBe(false);
    expect(matrixKeyboardContent.hidden).toBe(false);
    expect(messages).toEqual([
      { type: 'tab', tab: 'ui' },
      { type: 'tab', tab: 'ui' },
    ]);
    expect(panelChanges).toEqual([
      { panel: 'serial', open: true },
      { panel: 'matrixKeyboard', open: true },
    ]);
    expect(vscode.getState()).toEqual({
      debug80Accordion: {
        project: true,
        machine: true,
        displays: true,
        video: false,
        serial: true,
        matrixKeyboard: true,
        registers: true,
        memory: false,
      },
      debug80AccordionOrder: ['machine', 'serial', 'matrixKeyboard', 'memory'],
    });
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
        project: true,
        machine: true,
        displays: true,
        video: false,
        serial: false,
        matrixKeyboard: false,
        registers: true,
        memory: false,
      },
      debug80AccordionOrder: ['machine', 'registers', 'memory'],
    });
  });

  it('moves accordion sections up and down and persists the custom order', () => {
    const messages: PostedMessage[] = [];
    const fixture = accordionFixture(['project', 'displays', 'machine']);
    const vscode = createVscodeMock(messages);

    createAccordionLayoutController({
      vscode,
      buttons: fixture.buttons,
      panels: {
        project: document.createElement('div'),
        displays: document.createElement('div'),
        machine: document.createElement('div'),
      },
      memoryPanel: document.createElement('div'),
      defaultTab: 'ui',
      getMemoryPanelController: () => null,
    });

    const displaysDown = fixture.sections[1].querySelector<HTMLButtonElement>(
      '[data-accordion-move="down"]'
    );
    displaysDown?.click();

    expect(
      Array.from(fixture.root.querySelectorAll<HTMLElement>('.debug80-accordion-section')).map(
        (section) => section.dataset.panel
      )
    ).toEqual(['project', 'machine', 'displays']);
    expect(vscode.getState()).toMatchObject({
      debug80AccordionOrder: ['project', 'machine', 'displays'],
    });

    const displaysUp = fixture.sections[1].querySelector<HTMLButtonElement>(
      '[data-accordion-move="up"]'
    );
    displaysUp?.click();

    expect(
      Array.from(fixture.root.querySelectorAll<HTMLElement>('.debug80-accordion-section')).map(
        (section) => section.dataset.panel
      )
    ).toEqual(['project', 'displays', 'machine']);
    expect(vscode.getState()).toMatchObject({
      debug80AccordionOrder: ['project', 'displays', 'machine'],
    });
  });

  it('resets accordion order and open state to defaults', () => {
    const messages: PostedMessage[] = [];
    const panelChanges: Array<{ panel: string; open: boolean }> = [];
    const fixture = accordionFixture(['project', 'machine', 'displays', 'video', 'memory']);
    const videoContent = document.createElement('div');
    const memoryContent = document.createElement('div');
    const vscode = createVscodeMock(messages, {
      debug80Accordion: {
        project: false,
        machine: false,
        displays: false,
        video: true,
        memory: true,
      },
      debug80AccordionOrder: ['memory', 'video', 'project', 'displays', 'machine'],
    });

    const controller = createAccordionLayoutController({
      vscode,
      buttons: fixture.buttons,
      panels: {
        project: document.createElement('div'),
        machine: document.createElement('div'),
        displays: document.createElement('div'),
        video: videoContent,
        memory: memoryContent,
      },
      defaultPanelOrder: ['project', 'machine', 'displays', 'video', 'memory'],
      memoryPanel: document.createElement('div'),
      defaultTab: 'ui',
      getMemoryPanelController: () => null,
      onPanelOpenChange: (panel, open) => panelChanges.push({ panel, open }),
    });

    controller.resetPanelLayout();

    expect(
      Array.from(fixture.root.querySelectorAll<HTMLElement>('.debug80-accordion-section')).map(
        (section) => section.dataset.panel
      )
    ).toEqual(['project', 'machine', 'displays', 'video', 'memory']);
    expect(videoContent.hidden).toBe(true);
    expect(memoryContent.hidden).toBe(true);
    expect(controller.getProviderTab()).toBe('ui');
    expect(panelChanges).toEqual([
      { panel: 'project', open: true },
      { panel: 'machine', open: true },
      { panel: 'displays', open: true },
      { panel: 'video', open: false },
      { panel: 'memory', open: false },
    ]);
    expect(vscode.getState()).toMatchObject({
      debug80Accordion: expect.objectContaining({
        project: true,
        machine: true,
        displays: true,
        video: false,
        memory: false,
      }),
      debug80AccordionOrder: ['project', 'machine', 'displays', 'video', 'memory'],
    });
  });

  it('uses an explicit default panel order before source order', () => {
    const messages: PostedMessage[] = [];
    const fixture = accordionFixture(['project', 'displays', 'machine', 'serial']);
    const vscode = createVscodeMock(messages);

    createAccordionLayoutController({
      vscode,
      buttons: fixture.buttons,
      panels: {
        project: document.createElement('div'),
        displays: document.createElement('div'),
        machine: document.createElement('div'),
        serial: document.createElement('div'),
      },
      defaultPanelOrder: ['project', 'machine', 'displays', 'serial'],
      memoryPanel: document.createElement('div'),
      defaultTab: 'ui',
      getMemoryPanelController: () => null,
    });

    expect(
      Array.from(fixture.root.querySelectorAll<HTMLElement>('.debug80-accordion-section')).map(
        (section) => section.dataset.panel
      )
    ).toEqual(['project', 'machine', 'displays', 'serial']);
  });

  it('inserts newly added panels according to default order when stored order is older', () => {
    const messages: PostedMessage[] = [];
    const fixture = accordionFixture([
      'project',
      'machine',
      'displays',
      'video',
      'matrixKeyboard',
      'registers',
      'memory',
      'serial',
    ]);
    const vscode = createVscodeMock(messages, {
      debug80AccordionOrder: [
        'project',
        'machine',
        'displays',
        'matrixKeyboard',
        'registers',
        'memory',
        'serial',
      ],
    });

    createAccordionLayoutController({
      vscode,
      buttons: fixture.buttons,
      panels: {
        project: document.createElement('div'),
        machine: document.createElement('div'),
        displays: document.createElement('div'),
        video: document.createElement('div'),
        matrixKeyboard: document.createElement('div'),
        registers: document.createElement('div'),
        memory: document.createElement('div'),
        serial: document.createElement('div'),
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
      memoryPanel: document.createElement('div'),
      defaultTab: 'ui',
      getMemoryPanelController: () => null,
    });

    expect(
      Array.from(fixture.root.querySelectorAll<HTMLElement>('.debug80-accordion-section')).map(
        (section) => section.dataset.panel
      )
    ).toEqual([
      'project',
      'machine',
      'displays',
      'video',
      'matrixKeyboard',
      'registers',
      'memory',
      'serial',
    ]);
  });

  it('repairs stale persisted order that appended video after serial', () => {
    const messages: PostedMessage[] = [];
    const fixture = accordionFixture([
      'project',
      'machine',
      'displays',
      'video',
      'matrixKeyboard',
      'registers',
      'memory',
      'serial',
    ]);
    const vscode = createVscodeMock(messages, {
      debug80AccordionOrder: [
        'project',
        'machine',
        'displays',
        'matrixKeyboard',
        'registers',
        'memory',
        'serial',
        'video',
      ],
    });

    createAccordionLayoutController({
      vscode,
      buttons: fixture.buttons,
      panels: {
        project: document.createElement('div'),
        machine: document.createElement('div'),
        displays: document.createElement('div'),
        video: document.createElement('div'),
        matrixKeyboard: document.createElement('div'),
        registers: document.createElement('div'),
        memory: document.createElement('div'),
        serial: document.createElement('div'),
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
      memoryPanel: document.createElement('div'),
      defaultTab: 'ui',
      getMemoryPanelController: () => null,
    });

    expect(
      Array.from(fixture.root.querySelectorAll<HTMLElement>('.debug80-accordion-section')).map(
        (section) => section.dataset.panel
      )
    ).toEqual([
      'project',
      'machine',
      'displays',
      'video',
      'matrixKeyboard',
      'registers',
      'memory',
      'serial',
    ]);
    expect(vscode.getState()).toMatchObject({
      debug80AccordionOrder: [
        'project',
        'machine',
        'displays',
        'video',
        'matrixKeyboard',
        'registers',
        'memory',
        'serial',
      ],
    });
  });

  it('polls registers while registers are open and memory is closed', () => {
    vi.useFakeTimers();
    const messages: PostedMessage[] = [];
    const memoryPanel = document.createElement('div');
    const requestSnapshot = vi.fn();
    const requestRegisterSnapshot = vi.fn();
    const memoryController = { requestSnapshot, requestRegisterSnapshot } as unknown as MemoryPanel;
    const memoryButton = button('memory');
    const vscode = createVscodeMock(messages, {
      debug80Accordion: {
        machine: true,
        registers: true,
        memory: false,
      },
    });

    const controller = createAccordionLayoutController({
      vscode,
      buttons: [button('machine'), button('registers'), memoryButton],
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

    controller.setRegisterRefreshActive(true);
    expect(requestRegisterSnapshot).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);
    expect(requestRegisterSnapshot).toHaveBeenCalledTimes(3);
    expect(requestSnapshot).not.toHaveBeenCalled();

    memoryButton.click();
    expect(requestSnapshot).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);
    expect(requestRegisterSnapshot).toHaveBeenCalledTimes(3);
  });
});
