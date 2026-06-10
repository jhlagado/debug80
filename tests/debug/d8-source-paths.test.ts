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
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-d8-source-paths-'));
    const sourceRoot = path.join(root, 'project');
    const sourcePath = path.join(sourceRoot, 'roms', 'tec1g', 'mon3', 'mon3.z80');
    const mapPath = path.join(root, 'project', 'build', 'roms', 'tec1g', 'mon3', 'mon3.d8.json');
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.mkdirSync(path.dirname(mapPath), { recursive: true });
    fs.writeFileSync(sourcePath, 'Boot:\n');

    expect(toPortable(resolveDebugMapFilePath('roms/tec1g/mon3/mon3.z80', mapPath, [sourceRoot]))).toContain(
      'project/roms/tec1g/mon3/mon3.z80'
    );

    fs.rmSync(root, { recursive: true, force: true });
  });

  it('can preserve source-root path spelling for editor navigation', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-d8-source-editor-'));
    const sourceRoot = path.join(root, 'workspace');
    const sourcePath = path.join(sourceRoot, 'src', 'main.asm');
    const mapPath = path.join(root, 'workspace', 'build', 'main.d8.json');
    fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
    fs.writeFileSync(sourcePath, 'Main:\n');

    expect(
      resolveDebugMapFilePath('src/main.asm', mapPath, [sourceRoot], { canonicalize: false })
    ).toBe(path.resolve(sourceRoot, 'src/main.asm'));

    fs.rmSync(root, { recursive: true, force: true });
  });

  it('falls back to a path beside the D8 map when a relative key is not in source roots', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-d8-source-fallback-'));
    const mapPath = path.join(root, 'build', 'program.d8.json');

    expect(resolveDebugMapFilePath('generated/program.asm', mapPath, [root])).toBe(
      path.join(path.dirname(mapPath), 'generated', 'program.asm')
    );

    fs.rmSync(root, { recursive: true, force: true });
  });

  it('can fall back to the project root for editor navigation', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-d8-editor-fallback-'));
    const projectRoot = path.join(root, 'project');
    const mapPath = path.join(projectRoot, 'build', 'main.d8.json');

    expect(
      resolveDebugMapFilePath('src/missing.asm', mapPath, [projectRoot], {
        fallbackDir: projectRoot,
        canonicalize: false,
      })
    ).toBe(path.join(projectRoot, 'src', 'missing.asm'));

    fs.rmSync(root, { recursive: true, force: true });
  });

  it('selects the map-named source as the primary file when available', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-d8-primary-source-'));
    const projectRoot = path.join(root, 'project');
    const mainPath = path.join(projectRoot, 'src', 'main.asm');
    const mon3Path = path.join(projectRoot, 'roms', 'tec1g', 'mon3', 'mon3.z80');
    const mapPath = path.join(projectRoot, 'build', 'roms', 'tec1g', 'mon3', 'mon3.d8.json');
    fs.mkdirSync(path.dirname(mainPath), { recursive: true });
    fs.mkdirSync(path.dirname(mon3Path), { recursive: true });
    fs.writeFileSync(mainPath, 'Main:\n');
    fs.writeFileSync(mon3Path, 'Boot:\n');

    expect(
      toPortable(
        findPrimaryDebugMapSource(mapPath, ['src/main.asm', 'roms/tec1g/mon3/mon3.z80'], [
          projectRoot,
        ]) ?? ''
      )
    ).toContain('roms/tec1g/mon3/mon3.z80');

    fs.rmSync(root, { recursive: true, force: true });
  });
});
