import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyProjectPanelStatusControls,
  getProjectPanelElements,
  wireProjectPanelPlatformControls,
} from '../../../webview/common/project-panel-elements';

describe('project panel DOM element collection', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="app">
        <div id="projectHeader">
          <button id="selectProject" type="button"></button>
          <button id="addWorkspaceFolder" type="button"></button>
          <label class="stop-on-entry-label"><input id="stopOnEntry" type="checkbox" /></label>
          <div class="project-control" id="targetControl">
            <select id="homeTargetSelect"></select>
          </div>
          <div class="project-control" id="platformControl">
            <select id="platformSelect">
              <option value="simple">Simple</option>
              <option value="tec1">TEC-1</option>
              <option value="tec1g" selected>TEC-1G</option>
            </select>
          </div>
          <div id="platformInfoControl"><span id="platformValue"></span></div>
        </div>
        <div id="setupCard"><span id="setupCardText"></span><button id="setupPrimaryAction"></button></div>
        <button id="platformInitButton"></button>
        <button id="restartDebug"></button>
        <button id="testCoolTerm"></button>
        <button id="sendHexToBoard"></button>
        <div id="hardwareStatusLine"></div>
        <div id="sourceMapStatusLine"></div>
        <div class="debug80-toolbar"></div>
        <div id="debug80Accordion"></div>
        <div id="tabs"></div>
        <div id="panel-ui"></div>
        <div id="panel-registers"></div>
        <div id="panel-memory"></div>
      </div>
    `;
    const platformSelect = document.getElementById('platformSelect') as HTMLSelectElement | null;
    if (platformSelect) {
      platformSelect.value = 'tec1g';
    }
  });

  it('returns shared project status and initialized-control bundles from the same handles', () => {
    const elements = getProjectPanelElements(document);

    expect(elements.addWorkspaceFolderButton!.id).toBe('addWorkspaceFolder');
    expect(elements.platformSelect!.id).toBe('platformSelect');
    expect(elements.stopOnEntryInput!.id).toBe('stopOnEntry');

    expect(elements.projectStatus.selectProjectButton!.id).toBe('selectProject');
    expect(elements.projectStatus.setupCard!.id).toBe('setupCard');
    expect(elements.projectStatus.homeTargetSelect!.id).toBe('homeTargetSelect');
    expect(elements.projectStatus.testCoolTermButton!.id).toBe('testCoolTerm');
    expect(elements.projectStatus.sendHexToBoardButton!.id).toBe('sendHexToBoard');

    expect(elements.initializedControls.appRoot!.id).toBe('app');
    expect(elements.initializedControls.projectHeader!.id).toBe('projectHeader');
    expect(elements.initializedControls.targetControl!.id).toBe('targetControl');
    expect(elements.initializedControls.platformControl!.id).toBe('platformControl');
    expect(elements.initializedControls.platformSelect).toBe(elements.platformSelect);
    expect(elements.initializedControls.restartButton!.id).toBe('restartDebug');
    expect(elements.initializedControls.accordion!.id).toBe('debug80Accordion');
  });

  it('wires add-folder and initialized platform-save messages', () => {
    const messages: unknown[] = [];
    const elements = getProjectPanelElements(document);

    wireProjectPanelPlatformControls(
      { postMessage: (message) => messages.push(message) },
      elements,
      'tec1g',
      () => true
    );

    elements.addWorkspaceFolderButton!.click();
    elements.platformSelect!.dispatchEvent(new Event('change'));

    expect(messages).toEqual([
      { type: 'openWorkspaceFolder', platform: 'tec1g' },
      { type: 'saveProjectConfig', platform: 'tec1g' },
    ]);
  });

  it('does not save platform changes before project initialization', () => {
    const messages: unknown[] = [];
    const elements = getProjectPanelElements(document);

    wireProjectPanelPlatformControls(
      { postMessage: (message) => messages.push(message) },
      elements,
      'tec1g',
      () => false
    );

    elements.platformSelect!.dispatchEvent(new Event('change'));

    expect(messages).toEqual([]);
  });

  it('applies project status through the shared initialized-control bundle', () => {
    const elements = getProjectPanelElements(document);

    const initialized = applyProjectPanelStatusControls(
      {
        projectState: 'initialized',
        rootPath: '/workspace/app',
        hasProject: true,
        platform: 'tec1g',
      },
      elements,
      { tabs: document.querySelector<HTMLElement>('.debug80-toolbar') }
    );

    expect(initialized).toBe(true);
    expect(document.body.dataset.projectViewState).toBe('initialized');
    expect(elements.platformSelect!.value).toBe('tec1g');
    expect(elements.initializedControls.projectHeader!.hidden).toBe(false);
  });

  it('keeps optional platform-specific controls nullable', () => {
    document.getElementById('testCoolTerm')?.remove();
    document.getElementById('sendHexToBoard')?.remove();
    document.getElementById('debug80Accordion')?.remove();

    const elements = getProjectPanelElements(document);

    expect(elements.projectStatus.testCoolTermButton).toBeNull();
    expect(elements.projectStatus.sendHexToBoardButton).toBeNull();
    expect(elements.initializedControls.accordion).toBeNull();
  });
});
