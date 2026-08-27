/**
 * @file Configure-target command helper tests.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  window: {
    showErrorMessage: vi.fn(),
    showInformationMessage: vi.fn(),
    showInputBox: vi.fn(),
    showQuickPick: vi.fn(),
  },
}));

import { buildAssemblerPickItems } from '../../src/extension/configure-target-commands';

describe('configure-target command helpers', () => {
  it('presents Atom as the default assembly backend and AZM as compatibility', () => {
    expect(buildAssemblerPickItems()).toEqual([
      {
        label: 'default',
        detail: 'Use Atom for assembly sources and infer other source types',
      },
      { label: 'atom', detail: 'Use the Atom assembler for Z80 assembly source' },
      { label: 'azm', detail: 'Use the AZM compatibility backend' },
      { label: 'glimmer', detail: 'Use the Glimmer frontend and its configured Z80 assembler' },
      { label: 'nucleus', detail: 'Force the standalone Nucleus compiler backend' },
    ]);
  });
});
