import { beforeEach, describe, expect, it, vi } from 'vitest';

const { showQuickPick, showInputBox, showInformationMessage, showErrorMessage } = vi.hoisted(
  () => ({
    showQuickPick: vi.fn(),
    showInputBox: vi.fn(),
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
  })
);

import {
  createDefaultProjectConfig,
  createDefaultLaunchConfig,
  createStarterSourceContent,
  scaffoldProject,
} from '../../src/extension/project-scaffolding';
import { DEBUG80_PROJECT_VERSION } from '../../src/extension/project-config';

vi.mock('vscode', () => ({
  window: {
    showQuickPick,
    showInputBox,
    showInformationMessage,
    showErrorMessage,
  },
}));

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn((candidate: string) => {
      const normalized = candidate.replace(/\\/g, '/');
      return (
        !normalized.endsWith('/debug80.json') &&
        !normalized.endsWith('/.vscode/debug80.json') &&
        !normalized.endsWith('/.debug80.json')
      );
    }),
    writeFileSync: vi.fn(),
  };
});

vi.mock('../../src/debug/config-utils', () => ({
  ensureDirExists: vi.fn(),
  inferDefaultTarget: vi.fn(() => ({
    sourceFile: 'src/main.asm',
    outputDir: 'build',
    artifactBase: 'main',
  })),
}));

vi.mock('../../src/extension/project-config', async () => {
  const actual = await vi.importActual<typeof import('../../src/extension/project-config')>(
    '../../src/extension/project-config'
  );
  return {
    ...actual,
    listProjectSourceFiles: vi.fn(() => []),
  };
});

describe('project-scaffolding helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds a simple target config for asm sources', () => {
    const config = createDefaultProjectConfig({
      targetName: 'app',
      platform: 'simple',
      sourceFile: 'src/main.asm',
      outputDir: 'build',
      artifactBase: 'main',
    });

    expect(config).toEqual({
      projectVersion: DEBUG80_PROJECT_VERSION,
      projectPlatform: 'simple',
      defaultTarget: 'app',
      targets: {
        app: {
          sourceFile: 'src/main.asm',
          outputDir: 'build',
          artifactBase: 'main',
          platform: 'simple',
          simple: {
            regions: [
              { start: 0, end: 2047, kind: 'rom' },
              { start: 2048, end: 65535, kind: 'ram' },
            ],
            appStart: 0x0900,
            entry: 0,
          },
        },
      },
    });
  });

  it('does not include assembler field when scaffolding a zax target (auto-inferred from extension)', () => {
    const config = createDefaultProjectConfig({
      targetName: 'app',
      platform: 'simple',
      sourceFile: 'src/main.zax',
      outputDir: 'build',
      artifactBase: 'main',
    });

    expect(config).toEqual(
      expect.objectContaining({
        targets: {
          app: expect.objectContaining({
            sourceFile: 'src/main.zax',
          }),
        },
      })
    );
    // assembler is no longer written to new project configs (auto-inferred from file extension)
    expect(config.targets.app).not.toHaveProperty('assembler');
  });

  it('creates starter source text for asm and zax', () => {
    expect(createStarterSourceContent('asm')).toContain('; Debug80 starter (ASM)');
    expect(createStarterSourceContent('asm')).toContain('jr start');
    expect(createStarterSourceContent('zax')).toContain('; Debug80 starter (ZAX)');
    expect(createStarterSourceContent('zax')).toContain('jr start');
  });

  it('creates a generic current-project launch config', () => {
    expect(createDefaultLaunchConfig()).toEqual({
      version: '0.2.0',
      configurations: [
        {
          name: 'Debug80: Current Project',
          type: 'z80',
          request: 'launch',
        },
      ],
    });
  });

  it('builds a tec1 target config when scaffolding for TEC-1', () => {
    const config = createDefaultProjectConfig({
      targetName: 'app',
      platform: 'tec1',
      sourceFile: 'src/main.asm',
      outputDir: 'build',
      artifactBase: 'main',
    });

    expect(config).toEqual({
      projectVersion: DEBUG80_PROJECT_VERSION,
      projectPlatform: 'tec1',
      defaultProfile: 'mon1b',
      defaultTarget: 'app',
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
          sourceFile: 'src/main.asm',
          outputDir: 'build',
          artifactBase: 'main',
          platform: 'tec1',
          profile: 'mon1b',
          tec1: {
            regions: [
              { start: 0, end: 2047, kind: 'rom' },
              { start: 2048, end: 4095, kind: 'ram' },
            ],
            appStart: 0x0800,
            entry: 0,
            romHex: 'roms/tec1/mon1b/mon-1b.bin',
            extraListings: ['roms/tec1/mon1b/mon-1b.lst'],
            sourceRoots: ['src', 'roms/tec1/mon1b'],
          },
        },
      },
    });
  });

  it('builds a tec1g bundled profile config for MON3', () => {
    const config = createDefaultProjectConfig({
      targetName: 'app',
      platform: 'tec1g',
      sourceFile: 'src/main.asm',
      outputDir: 'build',
      artifactBase: 'main',
    });

    expect(config).toEqual({
      projectVersion: DEBUG80_PROJECT_VERSION,
      projectPlatform: 'tec1g',
      defaultProfile: 'mon3',
      defaultTarget: 'app',
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
          sourceFile: 'src/main.asm',
          outputDir: 'build',
          artifactBase: 'main',
          platform: 'tec1g',
          profile: 'mon3',
          tec1g: {
            regions: [
              { start: 0, end: 2047, kind: 'rom' },
              { start: 2048, end: 32767, kind: 'ram' },
              { start: 49152, end: 65535, kind: 'rom' },
            ],
            appStart: 0x4000,
            entry: 0,
            romHex: 'roms/tec1g/mon3/mon3.bin',
            extraListings: ['roms/tec1g/mon3/mon3.lst'],
            sourceRoots: ['src', 'roms/tec1g/mon3'],
          },
        },
      },
    });
  });

  it('builds a tec1 bundled profile config for MON-1B', () => {
    const config = createDefaultProjectConfig({
      targetName: 'app',
      platform: 'tec1',
      sourceFile: 'src/main.asm',
      outputDir: 'build',
      artifactBase: 'main',
    });

    expect(config).toEqual({
      projectVersion: DEBUG80_PROJECT_VERSION,
      projectPlatform: 'tec1',
      defaultProfile: 'mon1b',
      defaultTarget: 'app',
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
          sourceFile: 'src/main.asm',
          outputDir: 'build',
          artifactBase: 'main',
          platform: 'tec1',
          profile: 'mon1b',
          tec1: {
            regions: [
              { start: 0, end: 2047, kind: 'rom' },
              { start: 2048, end: 4095, kind: 'ram' },
            ],
            appStart: 0x0800,
            entry: 0,
            romHex: 'roms/tec1/mon1b/mon-1b.bin',
            extraListings: ['roms/tec1/mon1b/mon-1b.lst'],
            sourceRoots: ['src', 'roms/tec1/mon1b'],
          },
        },
      },
    });
  });

  it('builds a tec1g target config when scaffolding for TEC-1G', () => {
    const config = createDefaultProjectConfig({
      targetName: 'app',
      platform: 'tec1g',
      sourceFile: 'src/main.asm',
      outputDir: 'build',
      artifactBase: 'main',
    });

    expect(config).toEqual({
      projectVersion: DEBUG80_PROJECT_VERSION,
      projectPlatform: 'tec1g',
      defaultProfile: 'mon3',
      defaultTarget: 'app',
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
          sourceFile: 'src/main.asm',
          outputDir: 'build',
          artifactBase: 'main',
          platform: 'tec1g',
          profile: 'mon3',
          tec1g: {
            regions: [
              { start: 0, end: 2047, kind: 'rom' },
              { start: 2048, end: 32767, kind: 'ram' },
              { start: 49152, end: 65535, kind: 'rom' },
            ],
            appStart: 0x4000,
            entry: 0,
            romHex: 'roms/tec1g/mon3/mon3.bin',
            extraListings: ['roms/tec1g/mon3/mon3.lst'],
            sourceRoots: ['src', 'roms/tec1g/mon3'],
          },
        },
      },
    });
  });

  it('cancels scaffolding when platform selection is dismissed', async () => {
    showQuickPick.mockResolvedValueOnce(undefined);

    const created = await scaffoldProject(
      { name: 'demo', uri: { fsPath: '/workspace/demo' }, index: 0 } as never,
      false
    );

    expect(created).toBe(false);
    expect(showInputBox).not.toHaveBeenCalled();
  });

  it('writes a tec1g config after choosing platform, target name, and starter source', async () => {
    const fs = await import('fs');
    const writeFileSync = vi.mocked(fs.writeFileSync);

    showQuickPick.mockResolvedValueOnce({ platform: 'tec1g' }).mockResolvedValueOnce({
      choice: { kind: 'starter', language: 'asm' },
    });
    showInputBox.mockResolvedValueOnce('app');

    const created = await scaffoldProject(
      { name: 'demo', uri: { fsPath: '/workspace/demo' }, index: 0 } as never,
      false
    );

    expect(created).toBe(true);
    expect(showQuickPick).toHaveBeenCalledTimes(2);
    expect(showInputBox).toHaveBeenCalledOnce();
    expect(writeFileSync).toHaveBeenCalled();
    expect(
      writeFileSync.mock.calls.some(([filePath]) =>
        String(filePath).replace(/\\/g, '/').endsWith('/.vscode/settings.json')
      )
    ).toBe(false);

    const configWrite = writeFileSync.mock.calls.find(([filePath]) =>
      String(filePath).replace(/\\/g, '/').endsWith('/debug80.json')
    );
    expect(configWrite).toBeDefined();

    const writtenConfig = JSON.parse(String(configWrite?.[1] ?? '{}')) as {
      projectVersion?: number;
      projectPlatform?: string;
      defaultProfile?: string;
      profiles?: Record<string, { platform?: string; bundledAssets?: Record<string, { bundleId?: string }> }>;
      targets?: Record<string, { platform?: string; profile?: string; tec1g?: Record<string, unknown> }>;
    };
    expect(writtenConfig.projectVersion).toBe(DEBUG80_PROJECT_VERSION);
    expect(writtenConfig.projectPlatform).toBe('tec1g');
    expect(writtenConfig.defaultProfile).toBe('mon3');
    expect(writtenConfig.profiles?.mon3?.platform).toBe('tec1g');
    expect(writtenConfig.profiles?.mon3?.bundledAssets?.romHex?.bundleId).toBe('tec1g/mon3/v1');
    expect(writtenConfig.targets?.app?.platform).toBe('tec1g');
    expect(writtenConfig.targets?.app?.profile).toBe('mon3');
    expect(writtenConfig.targets?.app?.tec1g).toEqual(
      expect.objectContaining({
        appStart: 0x4000,
        entry: 0,
        romHex: 'roms/tec1g/mon3/mon3.bin',
        extraListings: ['roms/tec1g/mon3/mon3.lst'],
      })
    );

    expect(showInformationMessage).toHaveBeenCalledWith(
      'Debug80: Created TEC-1G project in debug80.json targeting src/main.asm.'
    );
  });
});
