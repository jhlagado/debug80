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
      return !normalized.endsWith('/.vscode/debug80.json');
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
      defaultTarget: 'app',
      targets: {
        app: {
          sourceFile: 'src/main.asm',
          outputDir: 'build',
          artifactBase: 'main',
          platform: 'tec1',
          tec1: {
            regions: [
              { start: 0, end: 2047, kind: 'rom' },
              { start: 2048, end: 4095, kind: 'ram' },
            ],
            appStart: 0x0800,
            entry: 0,
          },
        },
      },
    });
  });

  it('merges bundled MON3 paths into tec1g when materialization succeeded', () => {
    const config = createDefaultProjectConfig({
      targetName: 'app',
      platform: 'tec1g',
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

    expect(config.targets.app).toEqual(
      expect.objectContaining({
        platform: 'tec1g',
        tec1g: expect.objectContaining({
          romHex: 'roms/tec1g/mon3/mon3.bin',
          extraListings: ['roms/tec1g/mon3/mon3.lst'],
          sourceRoots: ['src', 'roms/tec1g/mon3'],
        }),
      })
    );
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
      defaultTarget: 'app',
      targets: {
        app: {
          sourceFile: 'src/main.asm',
          outputDir: 'build',
          artifactBase: 'main',
          platform: 'tec1g',
          tec1g: {
            regions: [
              { start: 0, end: 2047, kind: 'rom' },
              { start: 2048, end: 32767, kind: 'ram' },
              { start: 49152, end: 65535, kind: 'rom' },
            ],
            appStart: 0x4000,
            entry: 0,
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

    const configWrite = writeFileSync.mock.calls.find(([filePath]) =>
      String(filePath).replace(/\\/g, '/').endsWith('/.vscode/debug80.json')
    );
    expect(configWrite).toBeDefined();

    const writtenConfig = JSON.parse(String(configWrite?.[1] ?? '{}')) as {
      projectVersion?: number;
      projectPlatform?: string;
      targets?: Record<string, { platform?: string; tec1g?: Record<string, unknown> }>;
    };
    expect(writtenConfig.projectVersion).toBe(DEBUG80_PROJECT_VERSION);
    expect(writtenConfig.projectPlatform).toBe('tec1g');
    expect(writtenConfig.targets?.app?.platform).toBe('tec1g');
    expect(writtenConfig.targets?.app?.tec1g).toEqual(
      expect.objectContaining({
        appStart: 0x4000,
        entry: 0,
      })
    );

    expect(showInformationMessage).toHaveBeenCalledWith(
      'Debug80: Created TEC-1G project in .vscode/debug80.json targeting src/main.asm.'
    );
  });
});
