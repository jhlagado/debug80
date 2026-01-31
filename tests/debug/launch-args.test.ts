/**
 * @file Launch args helpers tests.
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  normalizePlatformName,
  populateFromConfig,
  resolveArtifacts,
  resolveDebugMapPath,
  resolveExtraDebugMapPath,
  resolveRelative,
  resolveAsmPath,
  normalizeSourcePath,
  relativeIfPossible,
  resolveBaseDir,
} from '../../src/debug/launch-args';
import type { LaunchRequestArguments } from '../../src/debug/types';

describe('launch-args', () => {
  it('normalizes platform names', () => {
    expect(normalizePlatformName({ platform: 'TEC1' } as LaunchRequestArguments)).toBe('tec1');
    expect(normalizePlatformName({ platform: 'simple' } as LaunchRequestArguments)).toBe('simple');
    expect(normalizePlatformName({ platform: '' } as LaunchRequestArguments)).toBe('simple');
    expect(() =>
      normalizePlatformName({ platform: 'unknown' } as LaunchRequestArguments)
    ).toThrow('Unsupported platform');
  });

  it('resolves artifacts from asm path', () => {
    const baseDir = os.tmpdir();
    const args = { asm: 'main.asm' } as LaunchRequestArguments;
    const result = resolveArtifacts(args, baseDir, {
      resolveAsmPath: (asm, dir) => resolveAsmPath(asm, dir),
      resolveRelative: (filePath, dir) => resolveRelative(filePath, dir),
    });
    expect(result.hexPath).toContain(path.join(baseDir, 'main.hex'));
    expect(result.listingPath).toContain(path.join(baseDir, 'main.lst'));
  });

  it('builds debug map paths', () => {
    const baseDir = os.tmpdir();
    const listingPath = path.join(baseDir, 'main.lst');
    const args = { artifactBase: 'main' } as LaunchRequestArguments;
    const helpers = {
      resolveCacheDir: () => undefined,
      buildListingCacheKey: () => 'deadbeef',
      resolveRelative: (filePath: string, dir: string) => resolveRelative(filePath, dir),
    };
    const mapPath = resolveDebugMapPath(args, baseDir, undefined, listingPath, helpers);
    expect(mapPath).toContain(path.join(baseDir, 'main.d8dbg.json'));
    const extraPath = resolveExtraDebugMapPath(listingPath, helpers);
    expect(extraPath).toContain(path.join(baseDir, 'main.d8dbg.json'));
  });

  it('builds debug map paths using cache directory', () => {
    const baseDir = os.tmpdir();
    const listingPath = path.join(baseDir, 'main.lst');
    const args = { artifactBase: 'main' } as LaunchRequestArguments;
    const helpers = {
      resolveCacheDir: () => path.join(baseDir, 'cache'),
      buildListingCacheKey: () => 'abcd',
      resolveRelative: (filePath: string, dir: string) => resolveRelative(filePath, dir),
    };
    const mapPath = resolveDebugMapPath(args, baseDir, undefined, listingPath, helpers);
    expect(mapPath).toContain(path.join(baseDir, 'cache', 'main.abcd.d8dbg.json'));
    const extraPath = resolveExtraDebugMapPath(listingPath, helpers);
    expect(extraPath).toContain(path.join(baseDir, 'cache', 'main.abcd.d8dbg.json'));
  });

  it('merges config file values', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-config-'));
    const configPath = path.join(dir, 'debug80.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({ asm: 'a.asm', entry: 4660, target: 'default' })
    );
    const merged = populateFromConfig(
      { projectConfig: configPath } as LaunchRequestArguments,
      { resolveBaseDir: () => dir }
    );
    expect(merged.asm).toBe('a.asm');
    expect(merged.entry).toBe(4660);
  });

  it('merges config from package.json and selects target', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-pkg-'));
    const pkgPath = path.join(dir, 'package.json');
    fs.writeFileSync(
      pkgPath,
      JSON.stringify({
        debug80: {
          defaultTarget: 'app',
          targets: {
            app: { asm: 'main.asm', outputDir: 'build' },
          },
        },
      })
    );
    const merged = populateFromConfig(
      { projectConfig: pkgPath } as LaunchRequestArguments,
      { resolveBaseDir: () => dir }
    );
    expect(merged.asm).toBe('main.asm');
    expect(merged.outputDir).toBe('build');
  });

  it('returns args when config is missing or unreadable', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-missing-'));
    const args = { asm: path.join(dir, 'main.asm') } as LaunchRequestArguments;
    const merged = populateFromConfig(args, { resolveBaseDir: () => dir });
    expect(merged).toEqual(args);

    const badDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-bad-'));
    const badConfig = path.join(badDir, 'debug80.json');
    fs.writeFileSync(badConfig, '{not json');
    const badArgs = { asm: path.join(badDir, 'main.asm') } as LaunchRequestArguments;
    const mergedBad = populateFromConfig(badArgs, { resolveBaseDir: () => badDir });
    expect(mergedBad).toEqual(badArgs);
  });

  it('normalizes source paths and relative paths', () => {
    const root = path.parse(process.cwd()).root;
    const baseDir = path.join(root, 'root');
    const otherDir = path.join(root, 'other', 'root');

    expect(normalizeSourcePath('main.asm', baseDir)).toBe(path.join(baseDir, 'main.asm'));
    expect(relativeIfPossible(path.join(baseDir, 'src', 'main.asm'), baseDir)).toBe(
      path.join('src', 'main.asm')
    );
    expect(relativeIfPossible(path.join(otherDir, 'file.asm'), baseDir)).toBe(
      path.resolve(otherDir, 'file.asm')
    );
  });

  it('resolves artifacts when hex/listing are provided', () => {
    const baseDir = os.tmpdir();
    const args = { hex: 'a.hex', listing: 'a.lst' } as LaunchRequestArguments;
    const result = resolveArtifacts(args, baseDir, {
      resolveAsmPath: (asm, dir) => resolveAsmPath(asm, dir),
      resolveRelative: (filePath, dir) => resolveRelative(filePath, dir),
    });
    expect(result.hexPath).toBe(path.join(baseDir, 'a.hex'));
    expect(result.listingPath).toBe(path.join(baseDir, 'a.lst'));
    expect(result.asmPath).toBeUndefined();
  });

  it('throws when artifacts are missing and asm is undefined', () => {
    const baseDir = os.tmpdir();
    const args = {} as LaunchRequestArguments;
    expect(() =>
      resolveArtifacts(args, baseDir, {
        resolveAsmPath: (asm, dir) => resolveAsmPath(asm, dir),
        resolveRelative: (filePath, dir) => resolveRelative(filePath, dir),
      })
    ).toThrow('Z80 runtime requires "asm"');
  });

  it('resolves debug map paths with asm and outputDir', () => {
    const baseDir = os.tmpdir();
    const listingPath = path.join(baseDir, 'main.lst');
    const asmPath = path.join(baseDir, 'src', 'main.asm');
    const args = { outputDir: 'out' } as LaunchRequestArguments;
    const helpers = {
      resolveCacheDir: () => '',
      buildListingCacheKey: () => 'ignored',
      resolveRelative: (filePath: string, dir: string) => resolveRelative(filePath, dir),
    };
    const mapPath = resolveDebugMapPath(args, baseDir, asmPath, listingPath, helpers);
    expect(mapPath).toContain(path.join(baseDir, 'out', 'main.d8dbg.json'));
  });

  it('resolves asm paths for empty and absolute inputs', () => {
    const baseDir = os.tmpdir();
    expect(resolveAsmPath(undefined, baseDir)).toBeUndefined();
    expect(resolveAsmPath('', baseDir)).toBeUndefined();
    const abs = path.join(baseDir, 'main.asm');
    expect(resolveAsmPath(abs, baseDir)).toBe(abs);
    expect(resolveAsmPath('main.asm', baseDir)).toBe(abs);
  });

  it('resolves relative paths and base dir for workspace config', () => {
    const baseDir = os.tmpdir();
    expect(resolveRelative('main.asm', baseDir)).toBe(path.join(baseDir, 'main.asm'));
    const args = { projectConfig: path.join('configs', 'debug80.json') } as LaunchRequestArguments;
    expect(resolveBaseDir(args)).toBe(process.cwd());
  });

  it('resolves base dir from projectConfig', () => {
    const outside = path.join(os.tmpdir(), 'debug80-external', 'debug80.json');
    const args = { projectConfig: outside } as LaunchRequestArguments;
    expect(resolveBaseDir(args)).toBe(path.dirname(outside));
  });
});
