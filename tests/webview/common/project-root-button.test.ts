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
  let createButton: HTMLButtonElement;

  beforeEach(() => {
    document.body.innerHTML = `
      <button id="selectProject" type="button"></button>
      <button id="createProject" type="button"></button>
    `;
    rootButton = document.getElementById('selectProject') as HTMLButtonElement;
    createButton = document.getElementById('createProject') as HTMLButtonElement;
  });

  it('offers an open-folder action when there are no workspace roots', () => {
    const messages: PostedMessage[] = [];
    const controller = createProjectRootButtonController(
      createVscodeMock(messages),
      rootButton,
      createButton
    );

    controller.applyProjectStatus({ roots: [], targetCount: 0 });
    rootButton.click();

    expect(rootButton.textContent).toBe('Open Folder');
    expect(rootButton.title).toContain('Open a folder');
    expect(createButton.hidden).toBe(true);
    expect(messages).toContainEqual({ type: 'createProject' });
  });

  it('keeps create-project hidden for an empty root so setup card owns the primary action', () => {
    const messages: PostedMessage[] = [];
    const controller = createProjectRootButtonController(
      createVscodeMock(messages),
      rootButton,
      createButton
    );

    controller.applyProjectStatus({
      rootPath: '/workspace/debug80',
      roots: [{ name: 'debug80', path: '/workspace/debug80', hasProject: false }],
      targetCount: 0,
    });

    expect(rootButton.textContent).toBe('debug80');
    expect(createButton.hidden).toBe(true);
    expect(createButton.disabled).toBe(true);
    expect(messages).toEqual([]);
  });

  it('keeps the root selector behavior for configured projects', () => {
    const messages: PostedMessage[] = [];
    const controller = createProjectRootButtonController(
      createVscodeMock(messages),
      rootButton,
      createButton
    );

    controller.applyProjectStatus({
      rootPath: '/workspace/debug80',
      roots: [{ name: 'debug80', path: '/workspace/debug80', hasProject: true }],
      targetCount: 1,
    });

    rootButton.click();

    expect(createButton.hidden).toBe(true);
    expect(messages).toContainEqual({ type: 'selectProject' });
  });
});
