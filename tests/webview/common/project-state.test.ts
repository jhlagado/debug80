import { describe, expect, it } from 'vitest';
import { resolveProjectViewState } from '../../../webview/common/project-state';

describe('project view state resolver', () => {
  it('prefers explicit projectState values', () => {
    expect(resolveProjectViewState({ projectState: 'noWorkspace' })).toBe('noWorkspace');
    expect(resolveProjectViewState({ projectState: 'uninitialized' })).toBe('uninitialized');
    expect(resolveProjectViewState({ projectState: 'initialized' })).toBe('initialized');
  });

  it('falls back to initialized when hasProject is true', () => {
    expect(resolveProjectViewState({ hasProject: true, rootPath: '/workspace/demo' })).toBe(
      'initialized'
    );
  });

  it('falls back to uninitialized when a root is selected without a project', () => {
    expect(resolveProjectViewState({ rootPath: '/workspace/demo', hasProject: false })).toBe(
      'uninitialized'
    );
  });

  it('falls back to noWorkspace without a selected root', () => {
    expect(resolveProjectViewState({ hasProject: false })).toBe('noWorkspace');
  });
});
