import { describe, expect, it } from 'vitest';
import { applyInitializedProjectControls } from '../../../webview/common/project-controls';

function createElement(): HTMLElement {
  return document.createElement('div');
}

describe('initialized project controls', () => {
  it('shows only initialized controls after project setup', () => {
    const targetControl = createElement();
    const platformControl = createElement();
    const stopOnEntryLabel = createElement();
    const restartButton = createElement();
    const tabs = createElement();
    const panelUi = createElement();
    const panelMemory = createElement();

    const initialized = applyInitializedProjectControls(
      { projectState: 'initialized', rootPath: '/workspace/demo', hasProject: true },
      { targetControl, platformControl, stopOnEntryLabel, restartButton, tabs, panelUi, panelMemory }
    );

    expect(initialized).toBe(true);
    expect(targetControl.hidden).toBe(false);
    expect(platformControl.hidden).toBe(true);
    expect(stopOnEntryLabel.hidden).toBe(false);
    expect(restartButton.hidden).toBe(false);
    expect(tabs.hidden).toBe(false);
    expect(panelUi.hidden).toBe(false);
    expect(panelMemory.hidden).toBe(false);
  });

  it('keeps platform visible until the project is initialized', () => {
    const targetControl = createElement();
    const platformControl = createElement();
    const stopOnEntryLabel = createElement();
    const restartButton = createElement();

    const initialized = applyInitializedProjectControls(
      { projectState: 'uninitialized', rootPath: '/workspace/demo', hasProject: false },
      { targetControl, platformControl, stopOnEntryLabel, restartButton }
    );

    expect(initialized).toBe(false);
    expect(targetControl.hidden).toBe(true);
    expect(platformControl.hidden).toBe(false);
    expect(stopOnEntryLabel.hidden).toBe(true);
    expect(restartButton.hidden).toBe(true);
  });
});
