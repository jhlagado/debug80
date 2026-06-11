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
  const fixture = createTargetDiscoveryFixture();

  afterEach(() => {
    fixture.cleanup();
  });

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
    const root = fixture.createWorkspace('debug80-target-discovery-', [
      'src/main.asm',
      'src/pacmo.main.asm',
      'src/include.asm',
      'src/helper.z80',
      'src/games/tetro.main.asm',
      'build/generated.main.asm',
    ]);

    expect(listTargetEntrySourceFiles(root)).toEqual([
      'src/games/tetro.main.asm',
      'src/main.asm',
      'src/pacmo.main.asm',
    ]);
  });

  it('does not require a src folder for target entry source discovery', () => {
    const root = fixture.createWorkspace('debug80-target-discovery-root-', [
      'main.asm',
      'app.main.asm',
      'alt.z80',
      'loader.a80',
      'startup.s',
      ['contracts.asmi', 'extern MON_PRINT_CHAR\n'],
      'lib/include.asm',
    ]);

    expect(listTargetEntrySourceFiles(root)).toEqual(['app.main.asm', 'main.asm']);
  });
});

type WorkspaceFile = string | [relativePath: string, contents: string];

interface TargetDiscoveryFixture {
  cleanup(): void;
  createWorkspace(prefix: string, files: WorkspaceFile[]): string;
}

function createTargetDiscoveryFixture(): TargetDiscoveryFixture {
  const tempDirs: string[] = [];

  return {
    cleanup() {
      for (const dir of tempDirs) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
      tempDirs.length = 0;
    },
    createWorkspace(prefix, files) {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
      tempDirs.push(root);
      for (const file of files) {
        const [relativePath, contents] = Array.isArray(file) ? file : [file, 'nop\n'];
        writeWorkspaceFile(root, relativePath, contents);
      }
      return root;
    },
  };
}

function writeWorkspaceFile(root: string, relativePath: string, contents: string): void {
  fs.mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
  fs.writeFileSync(path.join(root, relativePath), contents);
}
