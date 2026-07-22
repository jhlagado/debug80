import { describe, expect, it } from 'vitest';
import {
  AZM_LANGUAGE_EXTENSIONS,
  DEBUG80_REBUILD_SOURCE_EXTENSIONS,
  isDebug80RebuildSourcePath,
  isDebug80RebuildSourceWithinWorkspace,
} from '../../src/extension/debug80-source-extensions';

describe('Debug80 source extensions', () => {
  it('keeps Glimmer separate from AZM language associations', () => {
    expect(AZM_LANGUAGE_EXTENSIONS).toEqual(['.asm', '.z80', '.asmi']);
  });

  it('rebuilds active sessions when AZM or Glimmer sources are saved', () => {
    expect(DEBUG80_REBUILD_SOURCE_EXTENSIONS).toEqual(['.asm', '.z80', '.asmi', '.glim']);
    expect(isDebug80RebuildSourcePath('/project/src/main.asm')).toBe(true);
    expect(isDebug80RebuildSourcePath('/project/src/main.z80')).toBe(true);
    expect(isDebug80RebuildSourcePath('/project/src/contracts.asmi')).toBe(true);
    expect(isDebug80RebuildSourcePath('/project/src/game.glim')).toBe(true);
    expect(isDebug80RebuildSourcePath('/project/src/GAME.GLIM')).toBe(true);
  });

  it('ignores unrelated files', () => {
    expect(isDebug80RebuildSourcePath('/project/src/notes.txt')).toBe(false);
    expect(isDebug80RebuildSourcePath('/project/src/glim')).toBe(false);
  });

  it('requires a rebuild source to be inside the active workspace boundary', () => {
    expect(isDebug80RebuildSourceWithinWorkspace('/work/demo/src/game.glim', '/work/demo')).toBe(
      true
    );
    expect(
      isDebug80RebuildSourceWithinWorkspace('/work/demo-copy/src/game.glim', '/work/demo')
    ).toBe(false);
    expect(
      isDebug80RebuildSourceWithinWorkspace('C:\\Work\\Demo\\src\\game.glim', 'c:\\work\\demo')
    ).toBe(true);
    expect(
      isDebug80RebuildSourceWithinWorkspace('C:\\Work\\DemoCopy\\game.glim', 'c:\\work\\demo')
    ).toBe(false);
  });
});
