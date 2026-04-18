import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

const { showQuickPick, showInputBox, showInformationMessage, showErrorMessage } = vi.hoisted(
  () => ({
    showQuickPick: vi.fn(),
    showInputBox: vi.fn(),
    showInformationMessage: vi.fn(),
    showErrorMessage: vi.fn(),
  })
);

function defaultExistsSync(candidate: string): boolean {
  const normalized = candidate.replace(/\\/g, '/');
  return (
    !normalized.endsWith('/debug80.json') &&
    !normalized.endsWith('/.vscode/debug80.json') &&
    !normalized.endsWith('/.debug80.json')
  );
}

import {
  createDefaultProjectConfig,
  createDefaultLaunchConfig,
  createStarterSourceContent,
  scaffoldProject,
} from '../../src/extension/project-scaffolding';
import { DEBUG80_PROJECT_VERSION } from '../../src/extension/project-config';
import { getProjectKitById } from '../../src/extension/project-kits';

vi.mock('vscode', () => ({
  Uri: {
    file: (fsPath: string) => ({ fsPath }),
    joinPath: (...segments: Array<{ fsPath?: string } | string>) => {
      const parts = segments.map((segment) =>
        typeof segment === 'string' ? segment : segment.fsPath ?? ''
      );
      return { fsPath: path.join(...parts) };
    },
  },
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
    existsSync: vi.fn(defaultExistsSync),
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
    vi.mocked(fs.existsSync).mockImplementation(defaultExistsSync);
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

  it('builds a tec1 mon1b profile kit config with bundled asset refs', () => {
    const config = createDefaultProjectConfig({
      kit: kit('tec1/mon1b'),
      targetName: 'app',
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
          description: 'TEC-1 monitor-first profile with user code at 0x0800.',
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

  it('builds a tec1 classic-2k profile kit config without bundled asset refs', () => {
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

  it('builds a tec1g mon3 profile kit config with bundled asset refs', () => {
    const config = createDefaultProjectConfig({
      kit: kit('tec1g/mon3'),
      targetName: 'app',
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
          description: 'TEC-1G monitor-first profile with user code at 0x4000.',
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

  it('cancels scaffolding when profile kit selection is dismissed', async () => {
    showQuickPick.mockResolvedValueOnce(undefined);

    const created = await scaffoldProject(
      { name: 'demo', uri: { fsPath: '/workspace/demo' }, index: 0 } as never,
      false
    );

    expect(created).toBe(false);
    expect(showInputBox).not.toHaveBeenCalled();
  });

  it('initializes from the selected platform with the default project kit and starter target', async () => {
    const fs = await import('fs');
    const actualFs = await vi.importActual<typeof import('fs')>('fs');
    const existsSync = vi.mocked(fs.existsSync);
    const writeFileSync = vi.mocked(fs.writeFileSync);

    const workspaceRoot = actualFs.mkdtempSync(path.join(os.tmpdir(), 'debug80-init-flow-'));
    try {
      existsSync.mockImplementation((candidate: string) => {
        const normalized = candidate.replace(/\\/g, '/');
        return (
          !normalized.endsWith('/debug80.json') &&
          !normalized.endsWith('/.debug80.json') &&
          !normalized.endsWith('/src/main.asm')
        );
      });
      showErrorMessage.mockImplementation((message: string) => {
        throw new Error(message);
      });

      const created = await scaffoldProject(
        { name: 'demo', uri: { fsPath: workspaceRoot }, index: 0 } as never,
        false,
        undefined,
        'tec1'
      );

      expect(created).toBe(true);
      expect(showQuickPick).not.toHaveBeenCalled();
      expect(showInputBox).not.toHaveBeenCalled();

      const configWrite = writeFileSync.mock.calls.find(([filePath]) =>
        String(filePath).replace(/\\/g, '/').endsWith('/debug80.json')
      );
      expect(configWrite).toBeDefined();
      const starterWrite = writeFileSync.mock.calls.find(([filePath]) =>
        String(filePath).replace(/\\/g, '/').endsWith('/src/main.asm')
      );
      expect(starterWrite).toBeDefined();

      const writtenConfig = JSON.parse(String(configWrite?.[1] ?? '{}')) as {
        defaultTarget?: string;
        defaultProfile?: string;
        projectPlatform?: string;
        targets?: Record<string, { sourceFile?: string; platform?: string; profile?: string }>;
      };
      expect(writtenConfig.projectPlatform).toBe('tec1');
      expect(writtenConfig.defaultProfile).toBe('mon1b');
      expect(writtenConfig.defaultTarget).toBe('app');
      expect(writtenConfig.targets?.app).toEqual(
        expect.objectContaining({
          sourceFile: 'src/main.asm',
          platform: 'tec1',
          profile: 'mon1b',
        })
      );
      expect(showInformationMessage).toHaveBeenCalledWith(
        'Debug80: Created TEC-1 / MON-1B project in debug80.json targeting src/main.asm.'
      );
    } finally {
      vi.mocked(fs.existsSync).mockImplementation(defaultExistsSync);
      showErrorMessage.mockReset();
      actualFs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('writes a tec1g config without copying MON-3 bundle files during scaffold', async () => {
    const fs = await import('fs');
    const actualFs = await vi.importActual<typeof import('fs')>('fs');
    const writeFileSync = vi.mocked(fs.writeFileSync);
    const existsSync = vi.mocked(fs.existsSync);

    existsSync.mockImplementation((candidate: string) => {
      const normalized = candidate.replace(/\\/g, '/');
      if (
        normalized.endsWith('/debug80.json') ||
        normalized.endsWith('/.vscode/debug80.json') ||
        normalized.endsWith('/.debug80.json')
      ) {
        return false;
      }
      if (normalized.includes('/resources/bundles/')) {
        return true;
      }
      return false;
    });

    const workspaceRoot = actualFs.mkdtempSync(path.join(os.tmpdir(), 'debug80-scaffold-'));
    try {
      showQuickPick.mockResolvedValueOnce({ kit: kit('tec1g/mon3') }).mockResolvedValueOnce({
        choice: { kind: 'starter', language: 'asm' },
      });
      showInputBox.mockResolvedValueOnce('app');

      const created = await scaffoldProject(
        { name: 'demo', uri: { fsPath: workspaceRoot }, index: 0 } as never,
        false
      );

      expect(created).toBe(true);
      expect(showQuickPick).toHaveBeenCalledTimes(2);
      expect(showInputBox).toHaveBeenCalledOnce();
      expect(writeFileSync).toHaveBeenCalled();

      const configWrite = writeFileSync.mock.calls.find(([filePath]) =>
        String(filePath).replace(/\\/g, '/').endsWith('/debug80.json')
      );
      expect(configWrite).toBeDefined();

      const writtenConfig = JSON.parse(String(configWrite?.[1] ?? '{}')) as {
        projectVersion?: number;
        projectPlatform?: string;
        defaultProfile?: string;
        profiles?: Record<string, { platform?: string; bundledAssets?: Record<string, { bundleId?: string; destination?: string }> }>;
        targets?: Record<string, { platform?: string; profile?: string; tec1g?: Record<string, unknown> }>;
      };
      expect(writtenConfig.projectVersion).toBe(DEBUG80_PROJECT_VERSION);
      expect(writtenConfig.projectPlatform).toBe('tec1g');
      expect(writtenConfig.defaultProfile).toBe('mon3');
      expect(writtenConfig.profiles?.mon3?.platform).toBe('tec1g');
      expect(writtenConfig.profiles?.mon3?.bundledAssets?.romHex?.bundleId).toBe('tec1g/mon3/v1');
      expect(writtenConfig.profiles?.mon3?.bundledAssets?.romHex?.destination).toBe(
        'roms/tec1g/mon3/mon3.bin'
      );
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

      expect(
        writeFileSync.mock.calls
          .map(([filePath]) => String(filePath).replace(/\\/g, '/'))
          .filter((filePath) => filePath.includes('/roms/'))
      ).toEqual([]);
      expect(showInformationMessage).toHaveBeenCalledWith(
        'Debug80: Created TEC-1G / MON-3 project in debug80.json targeting src/main.asm.'
      );
    } finally {
      vi.mocked(fs.existsSync).mockImplementation(defaultExistsSync);
      actualFs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('writes a tec1 config without copying MON-1B bundle files during scaffold', async () => {
    const fs = await import('fs');
    const actualFs = await vi.importActual<typeof import('fs')>('fs');
    const writeFileSync = vi.mocked(fs.writeFileSync);
    const existsSync = vi.mocked(fs.existsSync);

    existsSync.mockImplementation((candidate: string) => {
      const normalized = candidate.replace(/\\/g, '/');
      if (
        normalized.endsWith('/debug80.json') ||
        normalized.endsWith('/.vscode/debug80.json') ||
        normalized.endsWith('/.debug80.json')
      ) {
        return false;
      }
      if (normalized.includes('/resources/bundles/')) {
        return true;
      }
      return false;
    });

    const workspaceRoot = actualFs.mkdtempSync(path.join(os.tmpdir(), 'debug80-scaffold-'));
    try {
      showQuickPick.mockResolvedValueOnce({ kit: kit('tec1/mon1b') }).mockResolvedValueOnce({
        choice: { kind: 'starter', language: 'asm' },
      });
      showInputBox.mockResolvedValueOnce('app');

      const created = await scaffoldProject(
        { name: 'demo', uri: { fsPath: workspaceRoot }, index: 0 } as never,
        false
      );

      expect(created).toBe(true);
      expect(showQuickPick).toHaveBeenCalledTimes(2);
      expect(showInputBox).toHaveBeenCalledOnce();
      expect(writeFileSync).toHaveBeenCalled();

      const configWrite = writeFileSync.mock.calls.find(([filePath]) =>
        String(filePath).replace(/\\/g, '/').endsWith('/debug80.json')
      );
      expect(configWrite).toBeDefined();

      const writtenConfig = JSON.parse(String(configWrite?.[1] ?? '{}')) as {
        projectPlatform?: string;
        defaultProfile?: string;
        targets?: Record<string, { tec1?: Record<string, unknown> }>;
      };
      expect(writtenConfig.projectPlatform).toBe('tec1');
      expect(writtenConfig.defaultProfile).toBe('mon1b');
      expect(writtenConfig.targets?.app?.tec1).toEqual(
        expect.objectContaining({
          romHex: 'roms/tec1/mon1b/mon-1b.bin',
          extraListings: ['roms/tec1/mon1b/mon-1b.lst'],
        })
      );

      expect(
        writeFileSync.mock.calls
          .map(([filePath]) => String(filePath).replace(/\\/g, '/'))
          .filter((filePath) => filePath.includes('/roms/'))
      ).toEqual([]);
      expect(showInformationMessage).toHaveBeenCalledWith(
        'Debug80: Created TEC-1 / MON-1B project in debug80.json targeting src/main.asm.'
      );
    } finally {
      vi.mocked(fs.existsSync).mockImplementation(defaultExistsSync);
      actualFs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
});
