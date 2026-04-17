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
import { getProjectKitById } from '../../src/extension/project-kits';

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

  function kit(id: Parameters<typeof getProjectKitById>[0]) {
    const resolved = getProjectKitById(id);
    expect(resolved).toBeDefined();
    return resolved as NonNullable<typeof resolved>;
  }

  it('builds a simple/default profile kit config for asm sources', () => {
    const config = createDefaultProjectConfig({
      kit: kit('simple/default'),
      targetName: 'app',
      sourceFile: 'src/main.asm',
      outputDir: 'build',
      artifactBase: 'main',
    });

    expect(config).toEqual({
      projectVersion: DEBUG80_PROJECT_VERSION,
      projectPlatform: 'simple',
      defaultProfile: 'default',
      defaultTarget: 'app',
      profiles: {
        default: {
          platform: 'simple',
          description: 'Generic Debug80 RAM program kit at 0x0900.',
        },
      },
      targets: {
        app: {
          sourceFile: 'src/main.asm',
          outputDir: 'build',
          artifactBase: 'main',
          platform: 'simple',
          profile: 'default',
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

  it('builds a simple/default profile kit config for zax sources', () => {
    const config = createDefaultProjectConfig({
      kit: kit('simple/default'),
      targetName: 'app',
      sourceFile: 'src/main.zax',
      outputDir: 'build',
      artifactBase: 'main',
    });

    expect(config).toEqual(
      expect.objectContaining({
        defaultProfile: 'default',
        targets: {
          app: expect.objectContaining({
            sourceFile: 'src/main.zax',
            profile: 'default',
          }),
        },
      })
    );
  });

  it('creates starter source text for all built-in kits', () => {
    const extensionUri = { fsPath: process.cwd() } as never;
    expect(createStarterSourceContent(extensionUri, kit('simple/default'), 'asm')).toContain(
      'ORG 0x0900'
    );
    expect(createStarterSourceContent(extensionUri, kit('simple/default'), 'zax')).toContain(
      'ORG 0x0900'
    );
    expect(createStarterSourceContent(extensionUri, kit('tec1/mon1b'), 'asm')).toContain(
      'ORG 0x0800'
    );
    expect(createStarterSourceContent(extensionUri, kit('tec1/classic-2k'), 'asm')).toContain(
      'ORG 0x0900'
    );
    expect(createStarterSourceContent(extensionUri, kit('tec1g/mon3'), 'asm')).toContain(
      'ORG 0x4000'
    );
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

  it('builds a tec1 mon1b profile kit config when scaffolding for TEC-1', () => {
    const config = createDefaultProjectConfig({
      kit: kit('tec1/mon1b'),
      targetName: 'app',
      sourceFile: 'src/main.asm',
      outputDir: 'build',
      artifactBase: 'main',
      bundledMon1b: {
        ok: true,
        destinationRelative: 'roms/tec1/mon1b',
        romRelativePath: 'roms/tec1/mon1b/mon-1b.bin',
        listingRelativePath: 'roms/tec1/mon1b/mon-1b.lst',
      },
    });

    expect(config).toEqual({
      projectVersion: DEBUG80_PROJECT_VERSION,
      projectPlatform: 'tec1',
      defaultProfile: 'mon1b',
      defaultTarget: 'app',
      profiles: {
        mon1b: expect.objectContaining({
          platform: 'tec1',
          bundledAssets: expect.objectContaining({
            romHex: expect.objectContaining({ bundleId: 'tec1/mon1b/v1', path: 'mon-1b.bin' }),
            listing: expect.objectContaining({ bundleId: 'tec1/mon1b/v1', path: 'mon-1b.lst' }),
          }),
        }),
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

  it('builds a tec1 classic-2k profile kit config when scaffolding for TEC-1', () => {
    const config = createDefaultProjectConfig({
      kit: kit('tec1/classic-2k'),
      targetName: 'app',
      sourceFile: 'src/main.asm',
      outputDir: 'build',
      artifactBase: 'main',
    });

    expect(config).toEqual({
      projectVersion: DEBUG80_PROJECT_VERSION,
      projectPlatform: 'tec1',
      defaultProfile: 'classic-2k',
      defaultTarget: 'app',
      profiles: {
        'classic-2k': {
          platform: 'tec1',
          description: 'Classic TEC-1 RAM-program profile at 0x0900.',
        },
      },
      targets: {
        app: {
          sourceFile: 'src/main.asm',
          outputDir: 'build',
          artifactBase: 'main',
          platform: 'tec1',
          profile: 'classic-2k',
          tec1: {
            regions: [
              { start: 0, end: 2047, kind: 'rom' },
              { start: 2048, end: 4095, kind: 'ram' },
            ],
            appStart: 0x0900,
            entry: 0,
          },
        },
      },
    });
  });

  it('does not pull MON-1B bundle fields into classic-2k scaffolding', async () => {
    const fs = await import('fs');
    const writeFileSync = vi.mocked(fs.writeFileSync);

    showQuickPick.mockResolvedValueOnce({ kit: kit('tec1/classic-2k') }).mockResolvedValueOnce({
      choice: { kind: 'starter', language: 'asm' },
    });
    showInputBox.mockResolvedValueOnce('app');

    const created = await scaffoldProject(
      { name: 'demo', uri: { fsPath: '/workspace/demo' }, index: 0 } as never,
      false
    );

    expect(created).toBe(true);

    const configWrite = writeFileSync.mock.calls.find(([filePath]) =>
      String(filePath).replace(/\\/g, '/').endsWith('/debug80.json')
    );
    expect(configWrite).toBeDefined();

    const writtenConfig = JSON.parse(String(configWrite?.[1] ?? '{}')) as {
      targets?: Record<string, { tec1?: Record<string, unknown> }>;
    };
    expect(writtenConfig.targets?.app?.tec1).toBeDefined();
    expect(writtenConfig.targets?.app?.tec1).not.toHaveProperty('romHex');
    expect(writtenConfig.targets?.app?.tec1).not.toHaveProperty('extraListings');
    expect(writtenConfig.targets?.app?.tec1).not.toHaveProperty('sourceRoots');
  });

  it('builds a tec1g mon3 profile kit config when scaffolding for TEC-1G', () => {
    const config = createDefaultProjectConfig({
      kit: kit('tec1g/mon3'),
      targetName: 'app',
      sourceFile: 'src/main.asm',
      outputDir: 'build',
      artifactBase: 'main',
      bundledMon3: {
        ok: true,
        destinationRelative: 'roms/tec1g/mon3',
        romRelativePath: 'roms/tec1g/mon3/mon3.bin',
        listingRelativePath: 'roms/tec1g/mon3/mon3.lst',
      },
    });

    expect(config).toEqual({
      projectVersion: DEBUG80_PROJECT_VERSION,
      projectPlatform: 'tec1g',
      defaultProfile: 'mon3',
      defaultTarget: 'app',
      profiles: {
        mon3: expect.objectContaining({
          platform: 'tec1g',
          bundledAssets: expect.objectContaining({
            romHex: expect.objectContaining({ bundleId: 'tec1g/mon3/v1', path: 'mon3.bin' }),
            listing: expect.objectContaining({ bundleId: 'tec1g/mon3/v1', path: 'mon3.lst' }),
          }),
        }),
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

  it('cancels scaffolding when profile kit selection is dismissed', async () => {
    showQuickPick.mockResolvedValueOnce(undefined);

    const created = await scaffoldProject(
      { name: 'demo', uri: { fsPath: '/workspace/demo' }, index: 0 } as never,
      false
    );

    expect(created).toBe(false);
    expect(showInputBox).not.toHaveBeenCalled();
  });

  it('writes a tec1g config after choosing a profile kit, target name, and starter source', async () => {
    const fs = await import('fs');
    const writeFileSync = vi.mocked(fs.writeFileSync);

    showQuickPick.mockResolvedValueOnce({ kit: kit('tec1g/mon3') }).mockResolvedValueOnce({
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
      targets?: Record<string, { platform?: string; profile?: string; tec1g?: Record<string, unknown> }>;
    };
    expect(writtenConfig.projectVersion).toBe(DEBUG80_PROJECT_VERSION);
    expect(writtenConfig.projectPlatform).toBe('tec1g');
    expect(writtenConfig.defaultProfile).toBe('mon3');
    expect(writtenConfig.targets?.app?.platform).toBe('tec1g');
    expect(writtenConfig.targets?.app?.profile).toBe('mon3');
    expect(writtenConfig.targets?.app?.tec1g).toEqual(
      expect.objectContaining({
        appStart: 0x4000,
        entry: 0,
      })
    );

    expect(showInformationMessage).toHaveBeenCalledWith(
      'Debug80: Created TEC-1G / MON-3 project in debug80.json targeting src/main.asm.'
    );
  });
});
