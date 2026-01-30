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
} from '../src/debug/launch-args';
import type { LaunchRequestArguments } from '../src/debug/types';

describe('launch-args', () => {
  it('normalizes platform names', () => {
    expect(normalizePlatformName({ platform: 'TEC1' } as LaunchRequestArguments)).toBe('tec1');
    expect(normalizePlatformName({ platform: 'simple' } as LaunchRequestArguments)).toBe('simple');
  });

  it('resolves artifacts from asm path', () => {
    const baseDir = '/tmp';
    const args = { asm: 'main.asm' } as LaunchRequestArguments;
    const result = resolveArtifacts(args, baseDir, {
      resolveAsmPath: (asm, dir) => resolveAsmPath(asm, dir),
      resolveRelative: (filePath, dir) => resolveRelative(filePath, dir),
    });
    expect(result.hexPath).toContain(path.join('/tmp', 'main.hex'));
    expect(result.listingPath).toContain(path.join('/tmp', 'main.lst'));
  });

  it('builds debug map paths', () => {
    const baseDir = '/tmp';
    const listingPath = '/tmp/main.lst';
    const args = { artifactBase: 'main' } as LaunchRequestArguments;
    const helpers = {
      resolveCacheDir: () => undefined,
      buildListingCacheKey: () => 'deadbeef',
      resolveRelative: (filePath: string, dir: string) => resolveRelative(filePath, dir),
    };
    const mapPath = resolveDebugMapPath(args, baseDir, undefined, listingPath, helpers);
    expect(mapPath).toContain(path.join('/tmp', 'main.d8dbg.json'));
    const extraPath = resolveExtraDebugMapPath(listingPath, helpers);
    expect(extraPath).toContain(path.join('/tmp', 'main.d8dbg.json'));
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

  it('normalizes source paths and relative paths', () => {
    expect(normalizeSourcePath('main.asm', '/root')).toBe(path.join('/root', 'main.asm'));
    expect(relativeIfPossible('/root/src/main.asm', '/root')).toBe(path.join('src', 'main.asm'));
  });
});
