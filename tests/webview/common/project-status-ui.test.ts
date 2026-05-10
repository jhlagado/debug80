import { beforeEach, describe, expect, it } from 'vitest';
import { applyInitializedProjectControls } from '../../../webview/common/project-controls';
import { createProjectStatusUi } from '../../../webview/common/project-status-ui';
import type { ProjectStatusPayload } from '../../../src/contracts/platform-view';
import type { VscodeApi } from '../../../webview/common/vscode';

type ProjectPayload = {
  rootPath?: ProjectStatusPayload['rootPath'];
  roots?: ProjectStatusPayload['roots'];
  targets?: ProjectStatusPayload['targets'];
  targetName?: ProjectStatusPayload['targetName'];
  projectState?: ProjectStatusPayload['projectState'];
  hasProject?: ProjectStatusPayload['hasProject'];
  platform?: ProjectStatusPayload['platform'];
};

function createVscodeMock(): VscodeApi {
  return {
    postMessage: () => undefined,
    getState: () => undefined,
    setState: () => undefined,
  };
}

function isVisible(element: HTMLElement | null): boolean {
  let current: HTMLElement | null = element;
  while (current) {
    if (current.hidden) {
      return false;
    }
    current = current.parentElement;
  }
  return element !== null;
}

function getElements() {
  return {
    appRoot: document.getElementById('app') as HTMLElement,
    projectHeader: document.getElementById('projectHeader') as HTMLElement,
    selectProjectButton: document.getElementById('selectProject') as HTMLButtonElement,
    targetControl: document
      .getElementById('homeTargetSelect')
      ?.closest('.project-control') as HTMLElement,
    homeTargetSelect: document.getElementById('homeTargetSelect') as HTMLSelectElement,
    platformControl: document
      .getElementById('platformSelect')
      ?.closest('.project-control') as HTMLElement,
    platformSelect: document.getElementById('platformSelect') as HTMLSelectElement,
    platformInitButton: document.getElementById('platformInitButton') as HTMLButtonElement,
    platformInfoControl: document.getElementById('platformInfoControl') as HTMLElement,
    platformValue: document.getElementById('platformValue') as HTMLElement,
    setupCard: document.getElementById('setupCard') as HTMLElement,
    setupCardText: document.getElementById('setupCardText') as HTMLElement,
    setupPrimaryAction: document.getElementById('setupPrimaryAction') as HTMLButtonElement,
    restartButton: document.getElementById('restartDebug') as HTMLElement,
    tabs: document.getElementById('tabs') as HTMLElement,
    panelUi: document.getElementById('panel-ui') as HTMLElement,
    panelRegisters: document.getElementById('panel-registers') as HTMLElement,
    panelMemory: document.getElementById('panel-memory') as HTMLElement,
  };
}

function applyProjectPayload(payload: ProjectPayload): void {
  const elements = getElements();
  const ui = createProjectStatusUi(
    createVscodeMock(),
    {
      selectProjectButton: elements.selectProjectButton,
      setupCard: elements.setupCard,
      setupCardText: elements.setupCardText,
      setupPrimaryAction: elements.setupPrimaryAction,
      platformInitButton: elements.platformInitButton,
      homeTargetSelect: elements.homeTargetSelect,
      getPlatform: () => elements.platformSelect.value,
    },
    'tec1g'
  );

  ui.applyProjectStatus(payload);
  applyInitializedProjectControls(payload, {
    appRoot: elements.appRoot,
    projectHeader: elements.projectHeader,
    targetControl: elements.targetControl,
    targetSelect: elements.homeTargetSelect,
    platformControl: elements.platformControl,
    platformSelect: elements.platformSelect,
    platformInfoControl: elements.platformInfoControl,
    platformValue: elements.platformValue,
    restartButton: elements.restartButton,
    tabs: elements.tabs,
    panelUi: elements.panelUi,
    panelRegisters: elements.panelRegisters,
    panelMemory: elements.panelMemory,
  });
  ui.dispose();
}

function visiblePlatformControlCount(): number {
  return [getElements().platformControl, getElements().platformInfoControl].filter(isVisible)
    .length;
}

function visibleInitializeAffordanceCount(): number {
  return [getElements().platformInitButton, getElements().setupPrimaryAction].filter(isVisible)
    .length;
}

describe('project status UI invariants', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="app">
        <div class="project-header" id="projectHeader">
          <div class="project-control">
            <span class="project-label">Project</span>
            <button class="project-root-button" id="selectProject" type="button">No workspace roots available</button>
          </div>
          <div class="project-control">
            <span class="project-label">Target</span>
            <select class="project-select" id="homeTargetSelect"></select>
          </div>
          <div class="project-control" hidden>
            <span class="project-label">Platform</span>
            <select class="project-select" id="platformSelect">
              <option value="simple">Simple</option>
              <option value="tec1">TEC-1</option>
              <option value="tec1g">TEC-1G</option>
            </select>
            <button class="project-action-button" id="platformInitButton" type="button">Initialize</button>
          </div>
          <div class="project-control" id="platformInfoControl" hidden>
            <span class="project-label">Platform</span>
            <span class="project-value" id="platformValue"></span>
          </div>
        </div>
        <div class="setup-card" id="setupCard">
          <div class="setup-card-text" id="setupCardText">Select a workspace root to get started.</div>
          <div class="setup-card-actions">
            <button class="project-action-button" id="setupPrimaryAction" type="button">Open Folder</button>
          </div>
        </div>
        <button id="restartDebug" type="button">Restart</button>
        <div id="tabs"></div>
        <div id="panel-ui"></div>
        <div id="panel-registers"></div>
        <div id="panel-memory"></div>
      </div>
    `;
  });

  it('renders initialized projects with a compact project label and target selector', () => {
    applyProjectPayload({
      projectState: 'initialized',
      rootPath: '/workspace/debug80',
      roots: [{ name: 'debug80', path: '/workspace/debug80', hasProject: true }],
      targets: [
        { name: 'app', detail: 'Application target' },
        { name: 'tests', description: 'Test target' },
      ],
      targetName: 'app',
      hasProject: true,
      platform: 'tec1g',
    });

    const elements = getElements();
    expect(document.body.dataset.projectViewState).toBe('initialized');
    expect(elements.projectHeader.hidden).toBe(false);
    expect(elements.selectProjectButton.textContent).toBe('debug80');
    expect(elements.selectProjectButton.title).toContain('/workspace/debug80');
    expect(elements.homeTargetSelect.disabled).toBe(false);
    expect(elements.targetControl.hidden).toBe(false);
    expect(elements.homeTargetSelect.value).toBe('app');
    expect(
      Array.from(elements.homeTargetSelect.options).map((option) => option.textContent)
    ).toEqual(['Select target...', 'app', 'tests']);
    expect(elements.setupCard.hidden).toBe(true);
    expect(visiblePlatformControlCount()).toBe(0);
  });

  it('hides targets for uninitialized projects and shows one platform/init affordance', () => {
    applyProjectPayload({
      projectState: 'uninitialized',
      rootPath: '/workspace/debug80',
      roots: [{ name: 'debug80', path: '/workspace/debug80', hasProject: false }],
      targets: [{ name: 'stale-target' }],
      targetName: 'stale-target',
      hasProject: false,
      platform: 'tec1g',
    });

    const elements = getElements();
    expect(document.body.dataset.projectViewState).toBe('uninitialized');
    expect(elements.projectHeader.hidden).toBe(false);
    expect(elements.selectProjectButton.textContent).toBe('debug80');
    expect(elements.targetControl.hidden).toBe(true);
    expect(elements.homeTargetSelect.disabled).toBe(true);
    expect(elements.homeTargetSelect.value).toBe('');
    expect(
      Array.from(elements.homeTargetSelect.options).map((option) => option.textContent)
    ).toEqual(['No targets available']);
    expect(elements.setupCard.hidden).toBe(false);
    expect(elements.setupCardText.textContent).toBe('Uninitialized Debug80 project');
    expect(elements.setupPrimaryAction.hidden).toBe(true);
    expect(elements.platformControl.hidden).toBe(false);
    expect(elements.platformSelect.disabled).toBe(false);
    expect(visiblePlatformControlCount()).toBe(1);
    expect(visibleInitializeAffordanceCount()).toBe(1);
  });

  it('does not render duplicate platform selectors for initialized or uninitialized states', () => {
    applyProjectPayload({
      projectState: 'initialized',
      rootPath: '/workspace/debug80',
      roots: [{ name: 'debug80', path: '/workspace/debug80', hasProject: true }],
      targets: [{ name: 'app' }],
      targetName: 'app',
      hasProject: true,
      platform: 'tec1g',
    });

    expect(visiblePlatformControlCount()).toBe(0);
    expect(document.querySelectorAll('#platformSelect').length).toBe(1);

    applyProjectPayload({
      projectState: 'uninitialized',
      rootPath: '/workspace/debug80',
      roots: [{ name: 'debug80', path: '/workspace/debug80', hasProject: false }],
      targets: [],
      hasProject: false,
      platform: 'tec1g',
    });

    expect(visiblePlatformControlCount()).toBe(1);
    expect(document.querySelectorAll('#platformSelect').length).toBe(1);
  });

  it('corrects stale open-folder state when a valid project payload arrives', () => {
    applyProjectPayload({
      projectState: 'noWorkspace',
      roots: [],
      targets: [],
      hasProject: false,
    });

    expect(document.body.dataset.projectViewState).toBe('noWorkspace');
    expect(getElements().projectHeader.hidden).toBe(true);
    expect(getElements().selectProjectButton.textContent).toBe('Open Folder');
    expect(getElements().setupCard.hidden).toBe(false);
    expect(getElements().setupPrimaryAction.textContent).toBe('Open Folder');

    applyProjectPayload({
      projectState: 'initialized',
      rootPath: '/workspace/debug80',
      roots: [{ name: 'debug80', path: '/workspace/debug80', hasProject: true }],
      targets: [{ name: 'app' }],
      targetName: 'app',
      hasProject: true,
      platform: 'tec1g',
    });

    const elements = getElements();
    expect(document.body.dataset.projectViewState).toBe('initialized');
    expect(elements.projectHeader.hidden).toBe(false);
    expect(elements.selectProjectButton.textContent).toBe('debug80');
    expect(elements.selectProjectButton.dataset.action).toBe('select');
    expect(elements.setupCard.hidden).toBe(true);
    expect(elements.targetControl.hidden).toBe(false);
    expect(elements.homeTargetSelect.disabled).toBe(false);
    expect(elements.homeTargetSelect.value).toBe('app');
    expect(visiblePlatformControlCount()).toBe(0);
  });
});
