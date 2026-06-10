import { describe, expect, it, vi } from 'vitest';

import {
  ProjectTargetSourceFileCache,
  projectRootFromProjectConfigPath,
  targetProgramFileExists,
} from '../../src/extension/project-target-filesystem';

describe('project target filesystem utilities', () => {
  it('resolves workspace roots for root and .vscode project configs', () => {
    expect(projectRootFromProjectConfigPath('/workspace/demo/debug80.json')).toBe(
      '/workspace/demo'
    );
    expect(projectRootFromProjectConfigPath('/workspace/demo/.vscode/debug80.json')).toBe(
      '/workspace/demo'
    );
  });

  it('checks relative and absolute target program files through the supplied filesystem probe', () => {
    const exists = vi.fn((candidate: string) =>
      candidate.replace(/\\/g, '/').endsWith('/src/app.main.asm')
    );

    expect(
      targetProgramFileExists('/workspace/demo', { sourceFile: 'src\\app.main.asm' }, exists)
    ).toBe(true);
    expect(
      targetProgramFileExists(
        '/workspace/demo',
        { sourceFile: '/workspace/demo/src/missing.main.asm' },
        exists
      )
    ).toBe(false);
    const checkedPaths = exists.mock.calls.map(([candidate]) => candidate.replace(/\\/g, '/'));
    expect(checkedPaths).toContain('/workspace/demo/src/app.main.asm');
    expect(checkedPaths).toContain('/workspace/demo/src/missing.main.asm');
  });

  it('treats targets without a source path as present and filesystem errors as missing', () => {
    const exists = vi.fn(() => {
      throw new Error('stat failed');
    });

    expect(targetProgramFileExists('/workspace/demo', {}, exists)).toBe(true);
    expect(
      targetProgramFileExists('/workspace/demo', { sourceFile: 'src/app.main.asm' }, exists)
    ).toBe(false);
  });

  it('caches discovered source files per project root until the TTL expires', () => {
    let now = 1_000;
    const discover = vi
      .fn()
      .mockReturnValueOnce(['src/main.asm'])
      .mockReturnValueOnce(['src/main.asm', 'src/other.main.asm']);
    const cache = new ProjectTargetSourceFileCache({
      ttlMs: 2_000,
      now: () => now,
      discover,
    });

    expect(cache.get('/workspace/demo')).toEqual(['src/main.asm']);
    now += 1_999;
    expect(cache.get('/workspace/demo')).toEqual(['src/main.asm']);
    now += 1;
    expect(cache.get('/workspace/demo')).toEqual(['src/main.asm', 'src/other.main.asm']);
    expect(discover).toHaveBeenCalledTimes(2);
  });
});
