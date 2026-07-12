import { describe, expect, it } from 'vitest';
import { applyInitializedProjectControls } from '../../../webview/common/project-controls';

function createElement(): HTMLElement {
  return document.createElement('div');
}

describe('initialized project controls', () => {
  it('shows only initialized controls after project setup', () => {
    const appRoot = createElement();
    const projectHeader = createElement();
    const targetControl = createElement();
    const targetSelect = document.createElement('select');
    targetSelect.value = 'app';
    const platformControl = createElement();
    const platformSelect = document.createElement('select');
    const platformInfoControl = createElement();
    const platformValue = createElement();
    const stopOnEntryLabel = createElement();
    const restartButton = createElement();
    const tabs = createElement();
    const panelUi = createElement();
    const panelMemory = createElement();

    const initialized = applyInitializedProjectControls(
      {
        projectState: 'initialized',
        rootPath: '/workspace/demo',
        hasProject: true,
        platform: 'tec1g',
      },
      {
        appRoot,
        projectHeader,
        targetControl,
        targetSelect,
        platformControl,
        platformSelect,
        platformInfoControl,
        platformValue,
        stopOnEntryLabel,
        restartButton,
        tabs,
        panelUi,
        panelMemory,
      }
    );

    expect(initialized).toBe(true);
    expect(document.body.dataset.projectViewState).toBe('initialized');
    expect(appRoot.dataset.projectViewState).toBe('initialized');
    expect(projectHeader.hidden).toBe(false);
    expect(targetControl.hidden).toBe(false);
    expect(targetSelect.disabled).toBe(false);
    expect(platformControl.hidden).toBe(true);
    expect(platformSelect.disabled).toBe(true);
    expect(platformInfoControl.hidden).toBe(true);
    expect(platformValue.textContent).toBe('');
    expect(stopOnEntryLabel.hidden).toBe(false);
    expect(restartButton.hidden).toBe(false);
    expect(tabs.hidden).toBe(false);
    expect(panelUi.hidden).toBe(false);
    expect(panelMemory.hidden).toBe(false);
  });

  it('keeps platform visible until the project is initialized', () => {
    const appRoot = createElement();
    const projectHeader = createElement();
    const targetControl = createElement();
    const targetSelect = document.createElement('select');
    targetSelect.value = 'app';
    const platformControl = createElement();
    const platformSelect = document.createElement('select');
    const platformInfoControl = createElement();
    const platformValue = createElement();
    const stopOnEntryLabel = createElement();
    const restartButton = createElement();
    const tabs = createElement();
    const panelUi = createElement();
    const panelMemory = createElement();

    const initialized = applyInitializedProjectControls(
      { projectState: 'uninitialized', rootPath: '/workspace/demo', hasProject: false },
      {
        appRoot,
        projectHeader,
        targetControl,
        targetSelect,
        platformControl,
        platformSelect,
        platformInfoControl,
        platformValue,
        stopOnEntryLabel,
        restartButton,
        tabs,
        panelUi,
        panelMemory,
      }
    );

    expect(initialized).toBe(false);
    expect(document.body.dataset.projectViewState).toBe('uninitialized');
    expect(appRoot.dataset.projectViewState).toBe('uninitialized');
    expect(projectHeader.hidden).toBe(false);
    expect(targetControl.hidden).toBe(true);
    expect(targetSelect.disabled).toBe(true);
    expect(targetSelect.value).toBe('');
    expect(platformControl.hidden).toBe(false);
    expect(platformSelect.disabled).toBe(false);
    expect(platformInfoControl.hidden).toBe(true);
    expect(platformValue.textContent).toBe('');
    expect(stopOnEntryLabel.hidden).toBe(true);
    expect(restartButton.hidden).toBe(true);
    expect(tabs.hidden).toBe(true);
    expect(panelUi.hidden).toBe(true);
    expect(panelMemory.hidden).toBe(true);
  });

  it('defaults to setup-only chrome before project state arrives', () => {
    const appRoot = createElement();
    const projectHeader = createElement();
    const targetControl = createElement();
    const targetSelect = document.createElement('select');
    targetSelect.value = 'stale-target';
    const platformControl = createElement();
    const platformSelect = document.createElement('select');
    const platformInfoControl = createElement();
    const platformValue = createElement();
    const stopOnEntryLabel = createElement();
    const restartButton = createElement();
    const tabs = createElement();
    const panelUi = createElement();
    const panelMemory = createElement();

    const initialized = applyInitializedProjectControls(
      {},
      {
        appRoot,
        projectHeader,
        targetControl,
        targetSelect,
        platformControl,
        platformSelect,
        platformInfoControl,
        platformValue,
        stopOnEntryLabel,
        restartButton,
        tabs,
        panelUi,
        panelMemory,
      }
    );

    expect(initialized).toBe(false);
    expect(document.body.dataset.projectViewState).toBe('noWorkspace');
    expect(appRoot.dataset.projectViewState).toBe('noWorkspace');
    expect(projectHeader.hidden).toBe(true);
    expect(targetControl.hidden).toBe(true);
    expect(targetSelect.disabled).toBe(true);
    expect(targetSelect.value).toBe('');
    expect(platformControl.hidden).toBe(true);
    expect(platformSelect.disabled).toBe(true);
    expect(platformInfoControl.hidden).toBe(true);
    expect(platformValue.textContent).toBe('');
    expect(stopOnEntryLabel.hidden).toBe(true);
    expect(restartButton.hidden).toBe(true);
    expect(tabs.hidden).toBe(true);
    expect(panelUi.hidden).toBe(true);
    expect(panelMemory.hidden).toBe(true);
  });

  it('hides platform controls when no workspace root is selected', () => {
    const projectHeader = createElement();
    const platformControl = createElement();
    const platformSelect = document.createElement('select');
    const platformInfoControl = createElement();

    const initialized = applyInitializedProjectControls(
      { projectState: 'noWorkspace' },
      { projectHeader, platformControl, platformSelect, platformInfoControl }
    );

    expect(initialized).toBe(false);
    expect(projectHeader.hidden).toBe(true);
    expect(platformControl.hidden).toBe(true);
    expect(platformSelect.disabled).toBe(true);
    expect(platformInfoControl.hidden).toBe(true);
  });

  it('forces platform controls back to a single visible branch on first render', () => {
    const projectHeader = createElement();
    const platformControl = createElement();
    const platformInfoControl = createElement();

    platformControl.hidden = false;
    platformInfoControl.hidden = false;

    const initialized = applyInitializedProjectControls(
      {},
      { projectHeader, platformControl, platformInfoControl }
    );

    expect(initialized).toBe(false);
    expect(projectHeader.hidden).toBe(true);
    expect(platformControl.hidden).toBe(true);
    expect(platformInfoControl.hidden).toBe(true);
  });

  it('switches cleanly between uninitialized and initialized platform states', () => {
    const projectHeader = createElement();
    const platformControl = createElement();
    const platformInfoControl = createElement();
    const platformValue = createElement();

    applyInitializedProjectControls(
      {
        projectState: 'uninitialized',
        rootPath: '/workspace/demo',
        hasProject: false,
        platform: 'tec1',
      },
      { projectHeader, platformControl, platformInfoControl, platformValue }
    );

    expect(projectHeader.hidden).toBe(false);
    expect(platformControl.hidden).toBe(false);
    expect(platformInfoControl.hidden).toBe(true);
    expect(platformValue.textContent).toBe('');

    applyInitializedProjectControls(
      {
        projectState: 'initialized',
        rootPath: '/workspace/demo',
        hasProject: true,
        platform: 'tec1g',
      },
      { projectHeader, platformControl, platformInfoControl, platformValue }
    );

    expect(projectHeader.hidden).toBe(false);
    expect(platformControl.hidden).toBe(true);
    expect(platformInfoControl.hidden).toBe(true);
    expect(platformValue.textContent).toBe('');

    applyInitializedProjectControls(
      {
        projectState: 'uninitialized',
        rootPath: '/workspace/demo',
        hasProject: false,
        platform: 'simple',
      },
      { projectHeader, platformControl, platformInfoControl, platformValue }
    );

    expect(projectHeader.hidden).toBe(false);
    expect(platformControl.hidden).toBe(false);
    expect(platformInfoControl.hidden).toBe(true);
    expect(platformValue.textContent).toBe('');
  });

  it('clears stale runtime controls when switching from initialized to uninitialized', () => {
    const appRoot = createElement();
    const projectHeader = createElement();
    const targetControl = createElement();
    const targetSelect = document.createElement('select');
    targetSelect.value = 'matrix';
    const platformControl = createElement();
    const platformSelect = document.createElement('select');
    const platformInfoControl = createElement();
    const platformValue = createElement();
    const stopOnEntryLabel = createElement();
    const restartButton = createElement();
    const tabs = createElement();
    const panelUi = createElement();
    const panelMemory = createElement();

    applyInitializedProjectControls(
      {
        projectState: 'initialized',
        rootPath: '/workspace/demo',
        hasProject: true,
        platform: 'tec1g',
      },
      {
        appRoot,
        projectHeader,
        targetControl,
        targetSelect,
        platformControl,
        platformSelect,
        platformInfoControl,
        platformValue,
        stopOnEntryLabel,
        restartButton,
        tabs,
        panelUi,
        panelMemory,
      }
    );

    const initialized = applyInitializedProjectControls(
      {
        projectState: 'uninitialized',
        rootPath: '/workspace/demo',
        hasProject: false,
        platform: 'tec1g',
      },
      {
        appRoot,
        projectHeader,
        targetControl,
        targetSelect,
        platformControl,
        platformSelect,
        platformInfoControl,
        platformValue,
        stopOnEntryLabel,
        restartButton,
        tabs,
        panelUi,
        panelMemory,
      }
    );

    expect(initialized).toBe(false);
    expect(document.body.dataset.projectViewState).toBe('uninitialized');
    expect(projectHeader.hidden).toBe(false);
    expect(targetControl.hidden).toBe(true);
    expect(targetSelect.disabled).toBe(true);
    expect(targetSelect.value).toBe('');
    expect(platformControl.hidden).toBe(false);
    expect(platformSelect.disabled).toBe(false);
    expect(platformInfoControl.hidden).toBe(true);
    expect(platformValue.textContent).toBe('');
    expect(stopOnEntryLabel.hidden).toBe(true);
    expect(restartButton.hidden).toBe(true);
    expect(tabs.hidden).toBe(true);
    expect(panelUi.hidden).toBe(true);
    expect(panelMemory.hidden).toBe(true);
  });

  it('collapses to empty-state only when switching back to no workspace', () => {
    const appRoot = createElement();
    const projectHeader = createElement();
    const targetControl = createElement();
    const targetSelect = document.createElement('select');
    const platformControl = createElement();
    const platformSelect = document.createElement('select');
    const platformInfoControl = createElement();
    const platformValue = createElement();
    const stopOnEntryLabel = createElement();
    const restartButton = createElement();
    const tabs = createElement();
    const panelUi = createElement();
    const panelMemory = createElement();

    applyInitializedProjectControls(
      {
        projectState: 'initialized',
        rootPath: '/workspace/demo',
        hasProject: true,
        platform: 'tec1g',
      },
      {
        appRoot,
        projectHeader,
        targetControl,
        targetSelect,
        platformControl,
        platformSelect,
        platformInfoControl,
        platformValue,
        stopOnEntryLabel,
        restartButton,
        tabs,
        panelUi,
        panelMemory,
      }
    );

    const initialized = applyInitializedProjectControls(
      { projectState: 'noWorkspace' },
      {
        appRoot,
        projectHeader,
        targetControl,
        targetSelect,
        platformControl,
        platformSelect,
        platformInfoControl,
        platformValue,
        stopOnEntryLabel,
        restartButton,
        tabs,
        panelUi,
        panelMemory,
      }
    );

    expect(initialized).toBe(false);
    expect(document.body.dataset.projectViewState).toBe('noWorkspace');
    expect(projectHeader.hidden).toBe(true);
    expect(targetControl.hidden).toBe(true);
    expect(platformControl.hidden).toBe(true);
    expect(platformInfoControl.hidden).toBe(true);
    expect(stopOnEntryLabel.hidden).toBe(true);
    expect(restartButton.hidden).toBe(true);
    expect(tabs.hidden).toBe(true);
    expect(panelUi.hidden).toBe(true);
    expect(panelMemory.hidden).toBe(true);
  });
});
