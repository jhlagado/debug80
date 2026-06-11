import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  isTargetEntrySourcePath,
  listTargetEntrySourceFiles,
  TARGET_ENTRY_SOURCE_FILENAMES,
  TARGET_ENTRY_SOURCE_SUFFIXES,
} from '../../src/extension/target-discovery';

describe('target discovery conventions', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  function makeTempWorkspace(prefix: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempDirs.push(root);
    return root;
  }

  function writeWorkspaceFile(root: string, relativePath: string, contents = 'nop\n'): void {
    fs.writeFileSync(path.join(root, relativePath), contents);
  }

  it('defines the runnable target entry source conventions in one place', () => {
    expect(TARGET_ENTRY_SOURCE_FILENAMES).toEqual(['main.asm']);
    expect(TARGET_ENTRY_SOURCE_SUFFIXES).toEqual(['.main.asm']);

    expect(isTargetEntrySourcePath('main.asm')).toBe(true);
    expect(isTargetEntrySourcePath('src/main.asm')).toBe(true);
    expect(isTargetEntrySourcePath('src/pacmo.main.asm')).toBe(true);
    expect(isTargetEntrySourcePath('src/include.asm')).toBe(false);
    expect(isTargetEntrySourcePath('src/tool.z80')).toBe(false);
    expect(isTargetEntrySourcePath('src/contracts.asmi')).toBe(false);
  });

  it('lists target entry source files relative to the project root', () => {
    const root = makeTempWorkspace('debug80-target-discovery-');
    fs.mkdirSync(path.join(root, 'src', 'games'), { recursive: true });
    fs.mkdirSync(path.join(root, 'build'), { recursive: true });
    writeWorkspaceFile(root, 'src/main.asm');
    writeWorkspaceFile(root, 'src/pacmo.main.asm');
    writeWorkspaceFile(root, 'src/include.asm');
    writeWorkspaceFile(root, 'src/helper.z80');
    writeWorkspaceFile(root, 'src/games/tetro.main.asm');
    writeWorkspaceFile(root, 'build/generated.main.asm');

    expect(listTargetEntrySourceFiles(root)).toEqual([
      'src/games/tetro.main.asm',
      'src/main.asm',
      'src/pacmo.main.asm',
    ]);
  });

  it('does not require a src folder for target entry source discovery', () => {
    const root = makeTempWorkspace('debug80-target-discovery-root-');
    fs.mkdirSync(path.join(root, 'lib'), { recursive: true });
    writeWorkspaceFile(root, 'main.asm');
    writeWorkspaceFile(root, 'app.main.asm');
    writeWorkspaceFile(root, 'alt.z80');
    writeWorkspaceFile(root, 'loader.a80');
    writeWorkspaceFile(root, 'startup.s');
    writeWorkspaceFile(root, 'contracts.asmi', 'extern MON_PRINT_CHAR\n');
    writeWorkspaceFile(root, 'lib/include.asm');

    expect(listTargetEntrySourceFiles(root)).toEqual(['app.main.asm', 'main.asm']);
  });
});
