/**
 * @file Regression tests: project root button empty-state behavior.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { createProjectRootButtonController } from '../../../webview/common/project-root-button';

type PostedMessage = { type: string; [key: string]: unknown };

function createVscodeMock(messages: PostedMessage[]) {
  return {
    postMessage: (message: PostedMessage) => {
      messages.push(message);
    },
  };
}

describe('project root button controller', () => {
  let rootButton: HTMLButtonElement;

  beforeEach(() => {
    document.body.innerHTML = `
      <button id="selectProject" type="button"></button>
    `;
    rootButton = document.getElementById('selectProject') as HTMLButtonElement;
  });

  it('offers an open-folder action when there are no workspace roots', () => {
    const messages: PostedMessage[] = [];
    const controller = createProjectRootButtonController(createVscodeMock(messages), rootButton);

    controller.applyProjectStatus({ roots: [], targetCount: 0 });
    rootButton.click();

    expect(rootButton.textContent).toBe('Open Folder');
    expect(rootButton.title).toContain('Open a folder');
    expect(messages).toContainEqual({ type: 'createProject' });
  });

  it('uses select action when a root exists without a project (Create Project is on the setup card)', () => {
    const messages: PostedMessage[] = [];
    const controller = createProjectRootButtonController(createVscodeMock(messages), rootButton);

    controller.applyProjectStatus({
      rootPath: '/workspace/debug80',
      roots: [{ name: 'debug80', path: '/workspace/debug80', hasProject: false }],
      targetCount: 0,
    });

    expect(rootButton.textContent).toBe('debug80');
    rootButton.click();
    expect(messages).toContainEqual({ type: 'selectProject' });
  });

  it('keeps the root selector behavior for configured projects', () => {
    const messages: PostedMessage[] = [];
    const controller = createProjectRootButtonController(createVscodeMock(messages), rootButton);

    controller.applyProjectStatus({
      rootPath: '/workspace/debug80',
      roots: [{ name: 'debug80', path: '/workspace/debug80', hasProject: true }],
      targetCount: 1,
    });

    rootButton.click();

    expect(messages).toContainEqual({ type: 'selectProject' });
  });
});
