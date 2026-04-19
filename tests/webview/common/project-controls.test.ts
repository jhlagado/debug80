import { describe, expect, it } from 'vitest';
import { applyInitializedProjectControls } from '../../../webview/common/project-controls';

function createElement(): HTMLElement {
  return document.createElement('div');
}

describe('initialized project controls', () => {
  it('shows only initialized controls after project setup', () => {
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
    const targetControl = createElement();
    const platformControl = createElement();
    const platformInfoControl = createElement();
    const platformValue = createElement();
    const stopOnEntryLabel = createElement();
    const restartButton = createElement();

    const initialized = applyInitializedProjectControls(
      { projectState: 'uninitialized', rootPath: '/workspace/demo', hasProject: false },
      { targetControl, platformControl, platformInfoControl, platformValue, stopOnEntryLabel, restartButton }
    );

    expect(initialized).toBe(false);
    expect(targetControl.hidden).toBe(true);
    expect(platformControl.hidden).toBe(false);
    expect(platformInfoControl.hidden).toBe(true);
    expect(platformValue.textContent).toBe('');
    expect(stopOnEntryLabel.hidden).toBe(true);
    expect(restartButton.hidden).toBe(true);
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
});
