/**
 * @file Assembler backend resolution tests.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  extensions: { getExtension: vi.fn() },
}));

import { resolveAssemblerBackend } from '../../src/debug/assembler-backend';
import { Asm80Backend } from '../../src/debug/asm80-backend';

describe('assembler-backend', () => {
  it('returns asm80 by default', () => {
    expect(resolveAssemblerBackend(undefined, undefined)).toBeInstanceOf(Asm80Backend);
  });

  it('returns asm80 when explicitly requested', () => {
    expect(resolveAssemblerBackend('asm80', undefined)).toBeInstanceOf(Asm80Backend);
  });

  it('matches asm80 case-insensitively', () => {
    expect(resolveAssemblerBackend('ASM80', undefined)).toBeInstanceOf(Asm80Backend);
  });

  it('throws for unknown backends', () => {
    expect(() => resolveAssemblerBackend('unknown', undefined)).toThrow(
      'Unknown assembler backend'
    );
  });
});