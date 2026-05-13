/**
 * @file Launch args helpers tests.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
const { getExtension, vscodeWorkspace } = vi.hoisted(() => ({
  getExtension: vi.fn(),
  vscodeWorkspace: {
    workspaceFolders: [] as Array<{ uri: { fsPath: string } }>,
  },
}));
vi.mock('vscode', () => ({
  extensions: {
    getExtension,
  },
  workspace: vscodeWorkspace,
}));

import { normalizePlatformName, populateFromConfig } from '../../src/debug/launch-args';
import {
  normalizeSourcePath,
  relativeIfPossible,
  resolveArtifacts,
  resolveAsmPath,
  resolveBaseDir,
  resolveDebugMapPath,
  resolveExtraDebugMapPath,
  resolveRelative,
} from '../../src/debug/mapping/path-resolver';
import type { LaunchRequestArguments } from '../../src/debug/session/types';

describe('launch-args', () => {
  beforeEach(() => {
    getExtension.mockReset();
    getExtension.mockReturnValue(undefined);
    vscodeWorkspace.workspaceFolders = [];
  });

  it('normalizes platform names', () => {
    expect(normalizePlatformName({ platform: 'TEC1' } as LaunchRequestArguments)).toBe('tec1');
    expect(normalizePlatformName({ platform: 'simple' } as LaunchRequestArguments)).toBe('simple');
    expect(normalizePlatformName({ platform: '' } as LaunchRequestArguments)).toBe('simple');
    expect(normalizePlatformName({ platform: 'MicroBee' } as LaunchRequestArguments)).toBe(
      'microbee'
    );
  });

  it('resolves artifacts from asm path', () => {
    const baseDir = os.tmpdir();
    const args = { asm: 'main.asm' } as LaunchRequestArguments;
    const result = resolveArtifacts(args, baseDir);
    expect(result.hexPath).toContain(path.join(baseDir, 'main.hex'));
    expect(result.listingPath).toContain(path.join(baseDir, 'main.lst'));
  });

  it('builds debug map paths', () => {
    const baseDir = path.join(os.tmpdir(), 'debug80-missing-base', 'nested');
    const listingPath = path.join(baseDir, 'main.lst');
    const args = { artifactBase: 'main' } as LaunchRequestArguments;
    const mapPath = resolveDebugMapPath(args, baseDir, undefined, listingPath);
    expect(mapPath).toContain(path.join(baseDir, 'main.d8.json'));
    const extraPath = resolveExtraDebugMapPath(listingPath, baseDir);
    expect(extraPath).toContain(path.join(baseDir, 'main.d8.json'));
  });

  it('builds debug map paths using cache directory', () => {
    const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-cache-base-'));
    const listingPath = path.join(baseDir, 'main.lst');
    const args = { artifactBase: 'main' } as LaunchRequestArguments;
    const mapPath = resolveDebugMapPath(args, baseDir, undefined, listingPath);
    expect(mapPath).toContain(path.join(baseDir, '.debug80', 'cache', 'main.'));
    expect(mapPath.endsWith('.d8.json')).toBe(true);
    const extraPath = resolveExtraDebugMapPath(listingPath, baseDir);
    expect(extraPath).toContain(path.join(baseDir, '.debug80', 'cache', 'main.'));
    expect(extraPath.endsWith('.d8.json')).toBe(true);
  });

  it('merges config file values', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-config-'));
    const configPath = path.join(dir, 'debug80.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({ asm: 'a.asm', assembler: 'asm80', entry: 4660, target: 'default' })
    );
    const merged = populateFromConfig({ projectConfig: configPath } as LaunchRequestArguments, {
      resolveBaseDir: () => dir,
    });
    expect(merged.asm).toBe('a.asm');
    expect(merged.assembler).toBe('asm80');
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
    const merged = populateFromConfig({ projectConfig: pkgPath } as LaunchRequestArguments, {
      resolveBaseDir: () => dir,
    });
    expect(merged.asm).toBe('main.asm');
    expect(merged.outputDir).toBe('build');
  });

  it('resolves platform from target profile metadata when explicit platform is absent', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-profile-target-'));
    const configPath = path.join(dir, 'debug80.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        defaultTarget: 'app',
        profiles: {
          mon3: {
            platform: 'tec1g',
          },
        },
        targets: {
          app: {
            asm: 'src/main.asm',
            profile: 'mon3',
          },
        },
      })
    );

    const merged = populateFromConfig({ projectConfig: configPath } as LaunchRequestArguments, {
      resolveBaseDir: () => dir,
    });

    expect(merged.platform).toBe('tec1g');
  });

  it('resolves platform from defaultProfile when target profile is absent', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-profile-default-'));
    const configPath = path.join(dir, 'debug80.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        defaultTarget: 'app',
        defaultProfile: 'mon3',
        profiles: {
          mon3: {
            platform: 'tec1g',
          },
        },
        targets: {
          app: {
            asm: 'src/main.asm',
          },
        },
      })
    );

    const merged = populateFromConfig({ projectConfig: configPath } as LaunchRequestArguments, {
      resolveBaseDir: () => dir,
    });

    expect(merged.platform).toBe('tec1g');
  });

  it('hydrates tec1g launch paths from bundled profile assets when workspace copies are absent', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-profile-bundle-tec1g-'));
    const configPath = path.join(dir, 'debug80.json');
    const extensionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-extension-'));
    const bundledRom = path.join(
      extensionRoot,
      'resources',
      'bundles',
      'tec1g',
      'mon3',
      'v1',
      'mon3.bin'
    );
    const bundledListing = path.join(
      extensionRoot,
      'resources',
      'bundles',
      'tec1g',
      'mon3',
      'v1',
      'mon3.lst'
    );
    fs.mkdirSync(path.dirname(bundledRom), { recursive: true });
    fs.writeFileSync(bundledRom, 'rom');
    fs.writeFileSync(bundledListing, 'lst');
    getExtension.mockReturnValue({ extensionPath: extensionRoot } as never);
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        defaultTarget: 'app',
        defaultProfile: 'mon3',
        profiles: {
          mon3: {
            platform: 'tec1g',
            bundledAssets: {
              romHex: {
                bundleId: 'tec1g/mon3/v1',
                path: 'mon3.bin',
                destination: 'roms/tec1g/mon3/mon3.bin',
              },
              listing: {
                bundleId: 'tec1g/mon3/v1',
                path: 'mon3.lst',
                destination: 'roms/tec1g/mon3/mon3.lst',
              },
            },
          },
        },
        targets: {
          app: {
            asm: 'src/main.asm',
            profile: 'mon3',
          },
        },
      })
    );

    const merged = populateFromConfig({ projectConfig: configPath } as LaunchRequestArguments, {
      resolveBaseDir: () => dir,
    });

    expect(merged.platform).toBe('tec1g');
    expect(merged.tec1g?.romHex).toBe(bundledRom);
    expect(merged.tec1g?.extraListings).toEqual([bundledListing]);
  });

  it('hydrates tec1 launch paths from bundled profile assets when workspace copies are absent', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-profile-bundle-tec1-'));
    const configPath = path.join(dir, 'debug80.json');
    const extensionRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-extension-'));
    const bundledRom = path.join(
      extensionRoot,
      'resources',
      'bundles',
      'tec1',
      'mon1b',
      'v1',
      'mon-1b.bin'
    );
    const bundledListing = path.join(
      extensionRoot,
      'resources',
      'bundles',
      'tec1',
      'mon1b',
      'v1',
      'mon-1b.lst'
    );
    fs.mkdirSync(path.dirname(bundledRom), { recursive: true });
    fs.writeFileSync(bundledRom, 'rom');
    fs.writeFileSync(bundledListing, 'lst');
    getExtension.mockReturnValue({ extensionPath: extensionRoot } as never);
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        defaultTarget: 'app',
        defaultProfile: 'mon1b',
        profiles: {
          mon1b: {
            platform: 'tec1',
            bundledAssets: {
              romHex: {
                bundleId: 'tec1/mon1b/v1',
                path: 'mon-1b.bin',
                destination: 'roms/tec1/mon1b/mon-1b.bin',
              },
              listing: {
                bundleId: 'tec1/mon1b/v1',
                path: 'mon-1b.lst',
                destination: 'roms/tec1/mon1b/mon-1b.lst',
              },
            },
          },
        },
        targets: {
          app: {
            asm: 'src/main.asm',
            profile: 'mon1b',
          },
        },
      })
    );

    const merged = populateFromConfig({ projectConfig: configPath } as LaunchRequestArguments, {
      resolveBaseDir: () => dir,
    });

    expect(merged.platform).toBe('tec1');
    expect(merged.tec1?.romHex).toBe(bundledRom);
    expect(merged.tec1?.extraListings).toEqual([bundledListing]);
  });

  it('prefers workspace-local bundle overrides when they exist', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-profile-local-tec1g-'));
    const configPath = path.join(dir, 'debug80.json');
    const workspaceRom = path.join(dir, 'roms', 'tec1g', 'mon3', 'mon3.bin');
    const workspaceListing = path.join(dir, 'roms', 'tec1g', 'mon3', 'mon3.lst');
    fs.mkdirSync(path.dirname(workspaceRom), { recursive: true });
    fs.writeFileSync(workspaceRom, 'rom');
    fs.writeFileSync(workspaceListing, 'lst');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        defaultTarget: 'app',
        defaultProfile: 'mon3',
        profiles: {
          mon3: {
            platform: 'tec1g',
            bundledAssets: {
              romHex: {
                bundleId: 'tec1g/mon3/v1',
                path: 'mon3.bin',
                destination: 'roms/tec1g/mon3/mon3.bin',
              },
              listing: {
                bundleId: 'tec1g/mon3/v1',
                path: 'mon3.lst',
                destination: 'roms/tec1g/mon3/mon3.lst',
              },
            },
          },
        },
        targets: {
          app: {
            asm: 'src/main.asm',
            profile: 'mon3',
            tec1g: {
              romHex: 'roms/tec1g/mon3/mon3.bin',
              extraListings: ['roms/tec1g/mon3/mon3.lst'],
            },
          },
        },
      })
    );

    const merged = populateFromConfig({ projectConfig: configPath } as LaunchRequestArguments, {
      resolveBaseDir: () => dir,
    });

    expect(merged.tec1g?.romHex).toBe(workspaceRom);
    expect(merged.tec1g?.extraListings).toEqual([workspaceListing]);
  });

  it('deep-merges tec1g so target overrides do not drop root romHex', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-tec1g-merge-'));
    const configPath = path.join(dir, 'debug80.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        platform: 'tec1g',
        defaultTarget: 'matrix',
        tec1g: {
          romHex: 'roms/mon-3.hex',
          entry: 0,
          appStart: 16384,
        },
        targets: {
          matrix: {
            asm: 'src/matrix.zax',
            tec1g: {
              appStart: 16384,
            },
          },
          asmDemo: {
            asm: 'src/matrix-demo.asm',
          },
        },
      })
    );
    const mergedMatrix = populateFromConfig(
      { projectConfig: configPath, target: 'matrix' } as LaunchRequestArguments,
      { resolveBaseDir: () => dir }
    );
    expect(mergedMatrix.tec1g?.romHex).toBe(path.join(dir, 'roms/mon-3.hex'));
    expect(mergedMatrix.tec1g?.entry).toBe(0);
    expect(mergedMatrix.tec1g?.appStart).toBe(16384);

    const mergedAsm = populateFromConfig(
      { projectConfig: configPath, target: 'asmDemo' } as LaunchRequestArguments,
      { resolveBaseDir: () => dir }
    );
    expect(mergedAsm.tec1g?.romHex).toBe(path.join(dir, 'roms/mon-3.hex'));
    expect(mergedAsm.asm).toBe('src/matrix-demo.asm');
  });

  it('inherits tec1g.romHex from another target when root has no romHex', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-tec1g-inherit-'));
    const configPath = path.join(dir, 'debug80.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        platform: 'tec1g',
        defaultTarget: 'matrix',
        targets: {
          'matrix-demo': {
            asm: 'src/matrix-demo.asm',
            tec1g: {
              romHex: 'roms/mon-3.hex',
              entry: 0,
            },
          },
          matrix: {
            asm: 'src/matrix.zax',
            assembler: 'zax',
            tec1g: {
              appStart: 16384,
            },
          },
        },
      })
    );
    const merged = populateFromConfig(
      { projectConfig: configPath, target: 'matrix' } as LaunchRequestArguments,
      { resolveBaseDir: () => dir }
    );
    expect(merged.tec1g?.romHex).toBe(path.join(dir, 'roms/mon-3.hex'));
    expect(merged.tec1g?.appStart).toBe(16384);
    expect(merged.tec1g?.entry).toBe(0);
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

  it('prefers explicit launch stopOnEntry over project config when projectConfig is present', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-stoponentry-'));
    const configPath = path.join(dir, 'debug80.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        targets: {
          matrix: {
            asm: 'src/matrix.zax',
            stopOnEntry: false,
          },
        },
        defaultTarget: 'matrix',
      })
    );

    const merged = populateFromConfig(
      { projectConfig: configPath, target: 'matrix', stopOnEntry: true } as LaunchRequestArguments,
      { resolveBaseDir: () => dir }
    );

    expect(merged.stopOnEntry).toBe(true);
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
    const result = resolveArtifacts(args, baseDir);
    expect(result.hexPath).toBe(path.join(baseDir, 'a.hex'));
    expect(result.listingPath).toBe(path.join(baseDir, 'a.lst'));
    expect(result.asmPath).toBeUndefined();
  });

  it('throws when artifacts are missing and asm is undefined', () => {
    const baseDir = os.tmpdir();
    const args = {} as LaunchRequestArguments;
    expect(() => resolveArtifacts(args, baseDir)).toThrow();
  });

  it('resolves debug map paths with asm and outputDir', () => {
    const baseDir = path.join(os.tmpdir(), 'debug80-no-cache-output', 'nested');
    const listingPath = path.join(baseDir, 'main.lst');
    const asmPath = path.join(baseDir, 'src', 'main.asm');
    const args = { outputDir: 'out' } as LaunchRequestArguments;
    const mapPath = resolveDebugMapPath(args, baseDir, asmPath, listingPath);
    expect(mapPath).toContain(path.join(baseDir, 'out', 'main.d8.json'));
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
    vscodeWorkspace.workspaceFolders = [{ uri: { fsPath: process.cwd() } }];
    const args = { projectConfig: path.join('configs', 'debug80.json') } as LaunchRequestArguments;
    expect(resolveBaseDir(args)).toBe(process.cwd());
  });

  it('resolves base dir from projectConfig', () => {
    const outside = path.join(os.tmpdir(), 'debug80-external', 'debug80.json');
    const args = { projectConfig: outside } as LaunchRequestArguments;
    expect(resolveBaseDir(args)).toBe(path.dirname(outside));
  });
});
