/**
 * @file Assembler backend resolution tests.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  extensions: { getExtension: vi.fn() },
}));

import { resolveAssemblerBackend } from '../../src/debug/launch/assembler-backend';
import { AzmBackend } from '../../src/debug/launch/azm-backend';

function expectAzmBackend(id?: string, sourcePath?: string): void {
  expect(resolveAssemblerBackend(id, sourcePath)).toBeInstanceOf(AzmBackend);
}

describe('assembler-backend', () => {
  it('returns azm by default', () => {
    expectAzmBackend();
  });

  it('returns azm when explicitly requested', () => {
    expectAzmBackend('azm');
  });

  it('returns azm for asm-family source paths', () => {
    expectAzmBackend(undefined, '/tmp/program.asm');
    expectAzmBackend(undefined, '/tmp/program.z80');
  });

  it('matches azm case-insensitively', () => {
    expectAzmBackend('AZM');
  });

  it('throws for unknown backends', () => {
    expect(() => resolveAssemblerBackend('unknown', undefined)).toThrow(
      'Unknown assembler backend'
    );
  });

  it('does not expose the removed zax backend', () => {
    expect(() => resolveAssemblerBackend('zax', undefined)).toThrow('Unknown assembler backend');
    expectAzmBackend(undefined, '/tmp/program.zax');
  });
});
