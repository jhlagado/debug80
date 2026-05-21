/**
 * @file Assembler backend resolution tests.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  extensions: { getExtension: vi.fn() },
}));

import { resolveAssemblerBackend } from '../../src/debug/launch/assembler-backend';
import { AzmBackend } from '../../src/debug/launch/azm-backend';

describe('assembler-backend', () => {
  it('returns azm by default', () => {
    expect(resolveAssemblerBackend(undefined, undefined)).toBeInstanceOf(AzmBackend);
  });

  it('returns azm when explicitly requested', () => {
    expect(resolveAssemblerBackend('azm', undefined)).toBeInstanceOf(AzmBackend);
  });

  it('keeps asm80 as a backwards-compatible alias for azm', () => {
    expect(resolveAssemblerBackend('asm80', undefined)).toBeInstanceOf(AzmBackend);
  });

  it('returns azm for asm-family source paths', () => {
    expect(resolveAssemblerBackend(undefined, '/tmp/program.asm')).toBeInstanceOf(AzmBackend);
    expect(resolveAssemblerBackend(undefined, '/tmp/program.z80')).toBeInstanceOf(AzmBackend);
  });

  it('matches azm and asm80 alias case-insensitively', () => {
    expect(resolveAssemblerBackend('AZM', undefined)).toBeInstanceOf(AzmBackend);
    expect(resolveAssemblerBackend('ASM80', undefined)).toBeInstanceOf(AzmBackend);
  });

  it('throws for unknown backends', () => {
    expect(() => resolveAssemblerBackend('unknown', undefined)).toThrow(
      'Unknown assembler backend'
    );
  });

  it('does not expose the removed zax backend', () => {
    expect(() => resolveAssemblerBackend('zax', undefined)).toThrow('Unknown assembler backend');
    expect(resolveAssemblerBackend(undefined, '/tmp/program.zax')).toBeInstanceOf(AzmBackend);
  });
});
