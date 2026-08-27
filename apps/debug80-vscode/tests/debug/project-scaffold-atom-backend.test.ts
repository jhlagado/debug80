/**
 * @file Project scaffold to assembler-backend contract tests.
 */

import * as path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  extensions: { getExtension: vi.fn() },
  Uri: {
    file: (fsPath: string) => ({ fsPath }),
    joinPath: (...segments: Array<{ fsPath?: string } | string>) => {
      const parts = segments.map((segment) =>
        typeof segment === 'string' ? segment : (segment.fsPath ?? '')
      );
      return { fsPath: path.join(...parts) };
    },
  },
  window: {},
}));

import { resolveAssemblerBackend } from '../../src/debug/launch/assembler-backend';
import { AtomBackend } from '../../src/debug/launch/atom-backend';
import { createDefaultProjectConfig } from '../../src/extension/project-scaffolding';
import { getProjectKitChoices } from '../../src/extension/project-kits';

describe('project scaffold Atom backend contract', () => {
  it('routes every built-in ASM starter kit to the Atom backend', () => {
    for (const { kit } of getProjectKitChoices()) {
      const config = createDefaultProjectConfig({
        kit,
        targetName: 'app',
        sourceFile: 'src/main.asm',
        outputDir: 'build',
        artifactBase: 'main',
      });

      const target = config.targets.app;
      expect(target, kit.id).toMatchObject({
        sourceFile: 'src/main.asm',
        assembler: 'atom',
      });
      expect(resolveAssemblerBackend(String(target.assembler), String(target.sourceFile))).toBeInstanceOf(
        AtomBackend
      );
    }
  });
});
