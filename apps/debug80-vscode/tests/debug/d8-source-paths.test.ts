import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import {
  findPrimaryDebugMapSource,
  resolveDebugMapFilePath,
} from '../../src/debug/mapping/d8-source-paths';

const toPortable = (value: string): string => value.replace(/\\/g, '/');

describe('D8 source path helpers', () => {
  it('keeps absolute D8 file keys absolute', () => {
    const absolute = path.resolve(os.tmpdir(), 'debug80-absolute-source.asm');

    expect(resolveDebugMapFilePath(absolute, '/unused/build/main.d8.json', [])).toBe(absolute);
  });

  it('resolves relative D8 file keys through source roots before the map directory', () => {
    withTempRoot('debug80-d8-source-paths-', (root) => {
      const sourceRoot = path.join(root, 'project');
      const sourcePath = path.join(sourceRoot, 'roms', 'tec1g', 'mon3', 'mon3.z80');
      const mapPath = path.join(root, 'project', 'build', 'roms', 'tec1g', 'mon3', 'mon3.d8.json');
      writeTextFile(sourcePath, 'Boot:\n');
      ensureParentDir(mapPath);

      expect(
        toPortable(resolveDebugMapFilePath('roms/tec1g/mon3/mon3.z80', mapPath, [sourceRoot]))
      ).toContain('project/roms/tec1g/mon3/mon3.z80');
    });
  });

  it('can preserve source-root path spelling for editor navigation', () => {
    withTempRoot('debug80-d8-source-editor-', (root) => {
      const sourceRoot = path.join(root, 'workspace');
      const sourcePath = path.join(sourceRoot, 'src', 'main.asm');
      const mapPath = path.join(root, 'workspace', 'build', 'main.d8.json');
      writeTextFile(sourcePath, 'Main:\n');

      expect(
        resolveDebugMapFilePath('src/main.asm', mapPath, [sourceRoot], { canonicalize: false })
      ).toBe(path.resolve(sourceRoot, 'src/main.asm'));
    });
  });

  it('falls back to a path beside the D8 map when a relative key is not in source roots', () => {
    withTempRoot('debug80-d8-source-fallback-', (root) => {
      const mapPath = path.join(root, 'build', 'program.d8.json');

      expect(resolveDebugMapFilePath('generated/program.asm', mapPath, [root])).toBe(
        path.join(path.dirname(mapPath), 'generated', 'program.asm')
      );
    });
  });

  it('can fall back to the project root for editor navigation', () => {
    withTempRoot('debug80-d8-editor-fallback-', (root) => {
      const projectRoot = path.join(root, 'project');
      const mapPath = path.join(projectRoot, 'build', 'main.d8.json');

      expect(
        resolveDebugMapFilePath('src/missing.asm', mapPath, [projectRoot], {
          fallbackDir: projectRoot,
          canonicalize: false,
        })
      ).toBe(path.join(projectRoot, 'src', 'missing.asm'));
    });
  });

  it('selects the map-named source as the primary file when available', () => {
    withTempRoot('debug80-d8-primary-source-', (root) => {
      const projectRoot = path.join(root, 'project');
      const mainPath = path.join(projectRoot, 'src', 'main.asm');
      const mon3Path = path.join(projectRoot, 'roms', 'tec1g', 'mon3', 'mon3.z80');
      const mapPath = path.join(projectRoot, 'build', 'roms', 'tec1g', 'mon3', 'mon3.d8.json');
      writeTextFile(mainPath, 'Main:\n');
      writeTextFile(mon3Path, 'Boot:\n');

      expect(
        toPortable(
          findPrimaryDebugMapSource(
            mapPath,
            ['src/main.asm', 'roms/tec1g/mon3/mon3.z80'],
            [projectRoot]
          ) ?? ''
        )
      ).toContain('roms/tec1g/mon3/mon3.z80');
    });
  });
});

function withTempRoot(prefix: string, run: (root: string) => void): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function writeTextFile(filePath: string, contents: string): void {
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, contents);
}

function ensureParentDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}
