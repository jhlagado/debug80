import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  DEBUG80_PROJECT_VERSION,
  isDebug80ProjectConfig,
  isInitializedDebug80Project,
  listProjectSourceFiles,
  readProjectConfig,
  resolveProjectPlatform,
  resolveStopOnEntryForTarget,
  updateProjectTargetSource,
} from '../../src/extension/project-config';

describe('project-config helpers', () => {
  afterEach(() => {
    // temp directories are left for the OS to clean up
  });

  it('lists asm and zax source files relative to the project root', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-project-sources-'));
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.mkdirSync(path.join(root, 'tools'), { recursive: true });
    fs.mkdirSync(path.join(root, 'build'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src', 'main.asm'), 'nop\n');
    fs.writeFileSync(path.join(root, 'src', 'helpers.zax'), 'nop\n');
    fs.writeFileSync(path.join(root, 'tools', 'ignore.txt'), 'x\n');
    fs.writeFileSync(path.join(root, 'build', 'generated.asm'), 'nop\n');

    const files = listProjectSourceFiles(root);

    expect(files).toEqual(['src/helpers.zax', 'src/main.asm']);
  });

  it('updates the selected target source in debug80.json', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-project-config-'));
    const configPath = path.join(root, 'debug80.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        defaultTarget: 'app',
        targets: {
          app: { sourceFile: 'src/old.asm', platform: 'simple' },
        },
      })
    );

    const updated = updateProjectTargetSource(configPath, 'app', 'src/new.asm');

    expect(updated).toBe(true);
    const config = readProjectConfig(configPath);
    expect(config?.targets?.app?.sourceFile).toBe('src/new.asm');
    expect(config?.targets?.app?.asm).toBe('src/new.asm');
    expect(config?.targets?.app?.platform).toBe('simple');
  });

  it('resolves project platform from explicit project manifest fields', () => {
    expect(
      resolveProjectPlatform({
        projectVersion: DEBUG80_PROJECT_VERSION,
        projectPlatform: 'tec1g',
        targets: {
          app: { platform: 'simple' },
        },
      })
    ).toBe('tec1g');
  });

  it('resolves project platform from the default profile when projectPlatform is absent', () => {
    expect(
      resolveProjectPlatform({
        defaultProfile: 'mon3',
        profiles: {
          mon3: {
            platform: 'tec1g',
            bundledAssets: {
              romHex: {
                bundleId: 'tec1g/mon3/v1',
                path: 'mon3.bin',
              },
            },
          },
        },
        targets: {
          app: { sourceFile: 'src/main.asm', profile: 'mon3' },
        },
      })
    ).toBe('tec1g');
  });

  it('falls back to target platform when project platform is absent', () => {
    expect(
      resolveProjectPlatform({
        targets: {
          app: { platform: 'tec1' },
        },
      })
    ).toBe('tec1');
  });

  it('resolves stopOnEntry from target override then project root', () => {
    expect(
      resolveStopOnEntryForTarget(
        {
          stopOnEntry: true,
          targets: { app: { stopOnEntry: false } },
        },
        'app'
      )
    ).toBe(false);
    expect(
      resolveStopOnEntryForTarget(
        {
          stopOnEntry: true,
          targets: { app: {} },
        },
        'app'
      )
    ).toBe(true);
    expect(resolveStopOnEntryForTarget({ targets: { app: {} } }, 'app')).toBe(false);
  });

  it('recognizes initialized debug80 projects from config presence', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-project-init-'));
    const configPath = path.join(root, 'debug80.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        projectVersion: DEBUG80_PROJECT_VERSION,
        projectPlatform: 'simple',
        defaultTarget: 'app',
        targets: {
          app: { sourceFile: 'src/main.asm', platform: 'simple' },
        },
      })
    );

    expect(
      isInitializedDebug80Project({
        name: 'fixture',
        uri: { fsPath: root },
        index: 0,
      } as never)
    ).toBe(true);
  });

  it('rejects configs without targets as uninitialized', () => {
    expect(
      isDebug80ProjectConfig({
        projectVersion: DEBUG80_PROJECT_VERSION,
        projectPlatform: 'simple',
      })
    ).toBe(false);
  });

  it('rejects configs with unsupported project version', () => {
    expect(
      isDebug80ProjectConfig({
        projectVersion: 999 as 1,
        projectPlatform: 'simple',
        targets: {
          app: { sourceFile: 'src/main.asm', platform: 'simple' },
        },
      })
    ).toBe(false);
  });

  it('rejects configs with invalid profile or bundle references', () => {
    expect(
      isDebug80ProjectConfig({
        projectVersion: DEBUG80_PROJECT_VERSION,
        projectPlatform: 'simple',
        profiles: {
          app: {
            platform: 'simple',
            bundledAssets: {
              romHex: {
                bundleId: '',
                path: 'rom.bin',
              },
            },
          },
        },
        targets: {
          app: { sourceFile: 'src/main.asm', profile: 'app' },
        },
      })
    ).toBe(false);
  });

  it('upgrades manifests that use profile metadata to version 2 on read', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-project-manifest-v2-'));
    const configPath = path.join(root, 'debug80.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
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
            },
          },
        },
        targets: {
          app: { sourceFile: 'src/main.asm', profile: 'mon3' },
        },
      })
    );

    const config = readProjectConfig(configPath);

    expect(config?.projectVersion).toBe(DEBUG80_PROJECT_VERSION);
    expect(config?.defaultProfile).toBe('mon3');
    expect(config?.profiles?.mon3?.bundledAssets?.romHex?.bundleId).toBe('tec1g/mon3/v1');
  });

  it('sets assembler to zax when program file is .zax and syncs asm', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-zax-entry-'));
    const configPath = path.join(root, 'debug80.json');
    fs.writeFileSync(
      configPath,
      JSON.stringify({
        defaultTarget: 'app',
        targets: {
          app: {
            asm: 'src/old.asm',
            sourceFile: 'src/old.asm',
            assembler: 'asm80',
            platform: 'simple',
          },
        },
      })
    );

    const updated = updateProjectTargetSource(configPath, 'app', 'src/main.zax');

    expect(updated).toBe(true);
    const config = readProjectConfig(configPath);
    expect(config?.targets?.app?.sourceFile).toBe('src/main.zax');
    expect(config?.targets?.app?.asm).toBe('src/main.zax');
    expect(config?.targets?.app?.assembler).toBe('zax');
  });

});
