import { describe, expect, it, vi } from 'vitest';

import {
  ProjectTargetSourceFileCache,
  projectRootFromProjectConfigPath,
  targetProgramFileExists,
} from '../../src/extension/project-target-filesystem';

const workspaceRoot = '/workspace/demo';

function normalizePath(candidate: string): string {
  return candidate.replace(/\\/g, '/');
}

function checkedPaths(exists: ReturnType<typeof vi.fn>): string[] {
  return exists.mock.calls.map(([candidate]) => normalizePath(candidate));
}

function createSourceCacheHarness() {
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

  return {
    cache,
    advanceBy: (ms: number): void => {
      now += ms;
    },
    expectDiscoveries: (count: number): void => {
      expect(discover).toHaveBeenCalledTimes(count);
    },
  };
}

describe('project target filesystem utilities', () => {
  it('resolves workspace roots for root and .vscode project configs', () => {
    expect(projectRootFromProjectConfigPath(`${workspaceRoot}/debug80.json`)).toBe(workspaceRoot);
    expect(projectRootFromProjectConfigPath(`${workspaceRoot}/.vscode/debug80.json`)).toBe(
      workspaceRoot
    );
  });

  it('checks relative and absolute target program files through the supplied filesystem probe', () => {
    const exists = vi.fn((candidate: string) => normalizePath(candidate).endsWith('/src/app.main.asm'));

    expect(targetProgramFileExists(workspaceRoot, { sourceFile: 'src\\app.main.asm' }, exists)).toBe(
      true
    );
    expect(
      targetProgramFileExists(
        workspaceRoot,
        { sourceFile: `${workspaceRoot}/src/missing.main.asm` },
        exists
      )
    ).toBe(false);
    expect(checkedPaths(exists)).toContain(`${workspaceRoot}/src/app.main.asm`);
    expect(checkedPaths(exists)).toContain(`${workspaceRoot}/src/missing.main.asm`);
  });

  it('treats targets without a source path as present and filesystem errors as missing', () => {
    const exists = vi.fn(() => {
      throw new Error('stat failed');
    });

    expect(targetProgramFileExists(workspaceRoot, {}, exists)).toBe(true);
    expect(targetProgramFileExists(workspaceRoot, { sourceFile: 'src/app.main.asm' }, exists)).toBe(
      false
    );
  });

  it('caches discovered source files per project root until the TTL expires', () => {
    const { cache, advanceBy, expectDiscoveries } = createSourceCacheHarness();

    expect(cache.get(workspaceRoot)).toEqual(['src/main.asm']);
    advanceBy(1_999);
    expect(cache.get(workspaceRoot)).toEqual(['src/main.asm']);
    advanceBy(1);
    expect(cache.get(workspaceRoot)).toEqual(['src/main.asm', 'src/other.main.asm']);
    expectDiscoveries(2);
  });
});
