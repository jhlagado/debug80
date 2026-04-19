import { describe, expect, it } from 'vitest';
import { applyInitializedProjectControls } from '../../../webview/common/project-controls';

function createElement(): HTMLElement {
  return document.createElement('div');
}

describe('initialized project controls', () => {
  it('shows only initialized controls after project setup', () => {
    const appRoot = createElement();
    const targetControl = createElement();
    const platformControl = createElement();
    const platformInfoControl = createElement();
    const platformValue = createElement();
    const stopOnEntryLabel = createElement();
    const restartButton = createElement();
    const tabs = createElement();
    const panelUi = createElement();
    const panelMemory = createElement();

    const initialized = applyInitializedProjectControls(
      { projectState: 'initialized', rootPath: '/workspace/demo', hasProject: true, platform: 'tec1g' },
      {
        appRoot,
        targetControl,
        platformControl,
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
    expect(targetControl.hidden).toBe(false);
    expect(platformControl.hidden).toBe(true);
    expect(platformInfoControl.hidden).toBe(false);
    expect(platformValue.textContent).toBe('TEC-1G');
    expect(stopOnEntryLabel.hidden).toBe(false);
    expect(restartButton.hidden).toBe(false);
    expect(tabs.hidden).toBe(false);
    expect(panelUi.hidden).toBe(false);
    expect(panelMemory.hidden).toBe(false);
  });

  it('keeps platform visible until the project is initialized', () => {
    const appRoot = createElement();
    const targetControl = createElement();
    const platformControl = createElement();
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
        targetControl,
        platformControl,
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
    expect(targetControl.hidden).toBe(true);
    expect(platformControl.hidden).toBe(false);
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
    const targetControl = createElement();
    const platformControl = createElement();
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
        targetControl,
        platformControl,
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
    expect(targetControl.hidden).toBe(true);
    expect(platformControl.hidden).toBe(true);
    expect(platformInfoControl.hidden).toBe(true);
    expect(platformValue.textContent).toBe('');
    expect(stopOnEntryLabel.hidden).toBe(true);
    expect(restartButton.hidden).toBe(true);
    expect(tabs.hidden).toBe(true);
    expect(panelUi.hidden).toBe(true);
    expect(panelMemory.hidden).toBe(true);
  });

  it('hides platform controls when no workspace root is selected', () => {
    const platformControl = createElement();
    const platformInfoControl = createElement();

    const initialized = applyInitializedProjectControls(
      { projectState: 'noWorkspace' },
      { platformControl, platformInfoControl }
    );

    expect(initialized).toBe(false);
    expect(platformControl.hidden).toBe(true);
    expect(platformInfoControl.hidden).toBe(true);
  });

  it('forces platform controls back to a single visible branch on first render', () => {
    const platformControl = createElement();
    const platformInfoControl = createElement();

    platformControl.hidden = false;
    platformInfoControl.hidden = false;

    const initialized = applyInitializedProjectControls(
      {},
      { platformControl, platformInfoControl }
    );

    expect(initialized).toBe(false);
    expect(platformControl.hidden).toBe(true);
    expect(platformInfoControl.hidden).toBe(true);
  });

  it('switches cleanly between uninitialized and initialized platform states', () => {
    const platformControl = createElement();
    const platformInfoControl = createElement();
    const platformValue = createElement();

    applyInitializedProjectControls(
      { projectState: 'uninitialized', rootPath: '/workspace/demo', hasProject: false, platform: 'tec1' },
      { platformControl, platformInfoControl, platformValue }
    );

    expect(platformControl.hidden).toBe(false);
    expect(platformInfoControl.hidden).toBe(true);
    expect(platformValue.textContent).toBe('');

    applyInitializedProjectControls(
      { projectState: 'initialized', rootPath: '/workspace/demo', hasProject: true, platform: 'tec1g' },
      { platformControl, platformInfoControl, platformValue }
    );

    expect(platformControl.hidden).toBe(true);
    expect(platformInfoControl.hidden).toBe(false);
    expect(platformValue.textContent).toBe('TEC-1G');

    applyInitializedProjectControls(
      { projectState: 'uninitialized', rootPath: '/workspace/demo', hasProject: false, platform: 'simple' },
      { platformControl, platformInfoControl, platformValue }
    );

    expect(platformControl.hidden).toBe(false);
    expect(platformInfoControl.hidden).toBe(true);
    expect(platformValue.textContent).toBe('');
  });
});
