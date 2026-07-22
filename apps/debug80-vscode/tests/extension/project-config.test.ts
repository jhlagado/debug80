import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  addProjectTarget,
  DEBUG80_PROJECT_VERSION,
  isDebug80ProjectConfig,
  isInitializedDebug80Project,
  projectTargetNameFromSource,
  readProjectConfig,
  removeProjectTarget,
  resolveProjectAzmSymbolCase,
  resolveProjectPlatform,
  resolveStopOnEntryForTarget,
  updateProjectTargetSource,
  updateProjectAzmSymbolCase,
} from '../../src/extension/project-config';

describe('project-config helpers', () => {
  const fixture = createProjectConfigFixture();

  afterEach(() => {
    fixture.cleanup();
  });

  function createProject(prefix: string, config: object): { root: string; configPath: string } {
    return fixture.createProject(prefix, config);
  }

  function expectTargetSource(configPath: string, targetName: string, sourceFile: string): void {
    const config = readProjectConfig(configPath);
    expect(config?.targets?.[targetName]?.sourceFile).toBe(sourceFile);
    expect(config?.targets?.[targetName]?.asm).toBe(sourceFile);
  }

  it('updates the selected target source in debug80.json', () => {
    const { configPath } = createProject('debug80-project-config-', {
      defaultTarget: 'app',
      targets: {
        app: { sourceFile: 'src/old.asm', platform: 'simple' },
      },
    });

    const updated = updateProjectTargetSource(configPath, 'app', 'src/new.asm');

    expect(updated).toBe(true);
    expectTargetSource(configPath, 'app', 'src/new.asm');
    const config = readProjectConfig(configPath);
    expect(config?.targets?.app?.platform).toBe('simple');
  });

  it('derives concise target names from conventional and arbitrary source files', () => {
    expect(projectTargetNameFromSource('matrix-smoke.main.asm')).toBe('matrix-smoke');
    expect(projectTargetNameFromSource('legacy/monitor.main.z80')).toBe('monitor');
    expect(projectTargetNameFromSource('experiments/display.asm')).toBe('display');
    expect(projectTargetNameFromSource('demo.glim')).toBe('demo');
  });

  it('lets each added target infer its assembler from its own source extension', () => {
    const { configPath } = createProject('debug80-add-cross-language-target-', {
      defaultTarget: 'game',
      targets: {
        game: { sourceFile: 'game.glim', assembler: 'glimmer', platform: 'tec1g' },
      },
    });

    expect(addProjectTarget(configPath, 'legacy', 'legacy/main.z80')).toBe(true);
    const config = readProjectConfig(configPath);
    expect(config?.targets?.legacy?.sourceFile).toBe('legacy/main.z80');
    expect(config?.targets?.legacy?.assembler).toBeUndefined();
  });

  it('uses build for the first target added to a zero-target project', () => {
    const { configPath } = createProject('debug80-add-first-target-', {
      projectVersion: DEBUG80_PROJECT_VERSION,
      projectPlatform: 'tec1g',
      targets: {},
    });

    expect(addProjectTarget(configPath, 'demo', 'demo.asm')).toBe(true);
    expect(readProjectConfig(configPath)?.targets?.demo?.outputDir).toBe('build');
  });

  it('respects a project output directory for the first added target', () => {
    const { configPath } = createProject('debug80-add-first-custom-output-', {
      projectVersion: DEBUG80_PROJECT_VERSION,
      projectPlatform: 'tec1g',
      outputDir: 'artifacts',
      targets: {},
    });

    expect(addProjectTarget(configPath, 'demo', 'demo.asm')).toBe(true);
    expect(readProjectConfig(configPath)?.targets?.demo?.outputDir).toBe('artifacts');
  });

  it('removes a target without touching source settings on remaining targets', () => {
    const { configPath } = createProject('debug80-remove-target-', {
      defaultTarget: 'matrix',
      target: 'matrix',
      targets: {
        matrix: { sourceFile: 'matrix.main.asm', platform: 'tec1g' },
        panel: { sourceFile: 'panel.main.asm', platform: 'tec1g' },
      },
    });

    expect(removeProjectTarget(configPath, 'matrix')).toEqual({
      kind: 'removed',
      nextTarget: 'panel',
    });
    const config = readProjectConfig(configPath);
    expect(config?.targets?.matrix).toBeUndefined();
    expect(config?.targets?.panel?.sourceFile).toBe('panel.main.asm');
    expect(config?.defaultTarget).toBe('panel');
    expect(config?.target).toBe('panel');
  });

  it('removes the only configured target, leaving a valid zero-target project', () => {
    const { configPath } = createProject('debug80-remove-last-target-', {
      defaultTarget: 'app',
      targets: { app: { sourceFile: 'app.asm' } },
    });

    expect(removeProjectTarget(configPath, 'app')).toEqual({
      kind: 'removed',
      nextTarget: undefined,
    });
    const config = readProjectConfig(configPath);
    expect(config?.targets).toEqual({});
    expect(config?.defaultTarget).toBeUndefined();
    expect(config?.target).toBeUndefined();
    expect(isDebug80ProjectConfig(config)).toBe(true);
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
    const { root } = createProject('debug80-project-init-', {
      projectVersion: DEBUG80_PROJECT_VERSION,
      projectPlatform: 'simple',
      defaultTarget: 'app',
      targets: {
        app: { sourceFile: 'src/main.asm', platform: 'simple' },
      },
    });

    expect(
      isInitializedDebug80Project({
        name: 'fixture',
        uri: { fsPath: root },
        index: 0,
      } as never)
    ).toBe(true);
  });

  it('accepts configs without targets as zero-target projects', () => {
    expect(
      isDebug80ProjectConfig({
        projectVersion: DEBUG80_PROJECT_VERSION,
        projectPlatform: 'simple',
      })
    ).toBe(true);
    expect(
      isDebug80ProjectConfig({
        projectVersion: DEBUG80_PROJECT_VERSION,
        projectPlatform: 'simple',
        targets: {},
      })
    ).toBe(true);
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
    const { configPath } = createProject('debug80-project-manifest-v2-', {
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
    });

    const config = readProjectConfig(configPath);

    expect(config?.projectVersion).toBe(DEBUG80_PROJECT_VERSION);
    expect(config?.defaultProfile).toBe('mon3');
    expect(config?.profiles?.mon3?.bundledAssets?.romHex?.bundleId).toBe('tec1g/mon3/v1');
  });

  it('clears stale unsupported assembler ids when changing the program file', () => {
    const { configPath } = createProject('debug80-azm-entry-', {
      defaultTarget: 'app',
      targets: {
        app: {
          asm: 'src/old.asm',
          sourceFile: 'src/old.asm',
          assembler: 'legacy',
          platform: 'simple',
        },
      },
    });

    const updated = updateProjectTargetSource(configPath, 'app', 'src/main.z80');

    expect(updated).toBe(true);
    expectTargetSource(configPath, 'app', 'src/main.z80');
    const config = readProjectConfig(configPath);
    expect(config?.targets?.app?.assembler).toBeUndefined();
  });

  it('preserves the Glimmer assembler when changing the program file', () => {
    const { configPath } = createProject('debug80-glimmer-entry-', {
      defaultTarget: 'app',
      targets: {
        app: {
          sourceFile: 'src/old.glim',
          assembler: 'glimmer',
          platform: 'tec1g',
        },
      },
    });

    expect(updateProjectTargetSource(configPath, 'app', 'src/game.glim')).toBe(true);
    expect(readProjectConfig(configPath)?.targets?.app?.assembler).toBe('glimmer');
  });

  it('clears an assembler override that conflicts with the new program extension', () => {
    const { configPath } = createProject('debug80-cross-language-entry-', {
      defaultTarget: 'app',
      targets: {
        app: {
          sourceFile: 'src/old.glim',
          assembler: 'glimmer',
          platform: 'tec1g',
        },
      },
    });

    expect(updateProjectTargetSource(configPath, 'app', 'src/main.asm')).toBe(true);
    expect(readProjectConfig(configPath)?.targets?.app?.assembler).toBeUndefined();
  });

  it('persists AZM symbol case while preserving other project AZM options', () => {
    const { configPath } = createProject('debug80-symbol-case-', {
      defaultTarget: 'app',
      azm: { registerContracts: 'audit' },
      targets: { app: { sourceFile: 'src/main.asm', platform: 'simple' } },
    });

    expect(resolveProjectAzmSymbolCase(readProjectConfig(configPath))).toBe('strict');
    expect(updateProjectAzmSymbolCase(configPath, 'insensitive')).toBe(true);
    const config = readProjectConfig(configPath);
    expect(resolveProjectAzmSymbolCase(config)).toBe('insensitive');
    expect(config?.azm?.registerContracts).toBe('audit');
  });
});

type ProjectConfigFixture = {
  cleanup(): void;
  createProject(prefix: string, config: object): { root: string; configPath: string };
};

function createProjectConfigFixture(): ProjectConfigFixture {
  const tmpDirs: string[] = [];

  return {
    cleanup(): void {
      for (const dir of tmpDirs.splice(0)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },

    createProject(prefix: string, config: object): { root: string; configPath: string } {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
      tmpDirs.push(root);
      const configPath = path.join(root, 'debug80.json');
      fs.writeFileSync(configPath, JSON.stringify(config));
      return { root, configPath };
    },
  };
}
