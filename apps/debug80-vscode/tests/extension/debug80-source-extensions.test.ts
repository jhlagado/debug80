import { describe, expect, it } from 'vitest';
import {
  AZM_LANGUAGE_EXTENSIONS,
  DEBUG80_REBUILD_SOURCE_EXTENSIONS,
  isDebug80RebuildSourcePath,
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
});
