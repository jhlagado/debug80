import { describe, expect, it, vi } from 'vitest';
import {
  createDefaultProjectConfig,
  createDefaultLaunchConfig,
  createStarterSourceContent,
} from '../../src/extension/project-scaffolding';

vi.mock('vscode', () => ({
  window: {},
}));

describe('project-scaffolding helpers', () => {
  it('builds a simple target config for asm sources', () => {
    const config = createDefaultProjectConfig({
      targetName: 'app',
      sourceFile: 'src/main.asm',
      outputDir: 'build',
      artifactBase: 'main',
    });

    expect(config).toEqual({
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

  it('includes the zax assembler when scaffolding a zax target', () => {
    const config = createDefaultProjectConfig({
      targetName: 'app',
      sourceFile: 'src/main.zax',
      outputDir: 'build',
      artifactBase: 'main',
      assembler: 'zax',
    });

    expect(config).toEqual(
      expect.objectContaining({
        targets: {
          app: expect.objectContaining({
            assembler: 'zax',
            sourceFile: 'src/main.zax',
          }),
        },
      })
    );
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
          stopOnEntry: true,
        },
      ],
    });
  });
});