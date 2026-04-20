/**
 * @file Assembler backend resolution tests.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  extensions: { getExtension: vi.fn() },
}));

import { resolveAssemblerBackend } from '../../src/debug/launch/assembler-backend';
import { Asm80Backend } from '../../src/debug/launch/asm80-backend';
import { ZaxBackend } from '../../src/debug/launch/zax-backend';

describe('assembler-backend', () => {
  it('returns asm80 by default', () => {
    expect(resolveAssemblerBackend(undefined, undefined)).toBeInstanceOf(Asm80Backend);
  });

  it('returns asm80 when explicitly requested', () => {
    expect(resolveAssemblerBackend('asm80', undefined)).toBeInstanceOf(Asm80Backend);
  });

  it('returns asm80 for asm-family source paths', () => {
    expect(resolveAssemblerBackend(undefined, '/tmp/program.asm')).toBeInstanceOf(Asm80Backend);
  });

  it('matches asm80 case-insensitively', () => {
    expect(resolveAssemblerBackend('ASM80', undefined)).toBeInstanceOf(Asm80Backend);
  });

  it('returns zax for zax source paths', () => {
    expect(resolveAssemblerBackend(undefined, '/tmp/program.zax')).toBeInstanceOf(ZaxBackend);
  });

  it('returns zax when explicitly requested', () => {
    expect(resolveAssemblerBackend('zax', undefined)).toBeInstanceOf(ZaxBackend);
  });

  it('matches zax case-insensitively', () => {
    expect(resolveAssemblerBackend('ZAX', undefined)).toBeInstanceOf(ZaxBackend);
  });

  it('throws for unknown backends', () => {
    expect(() => resolveAssemblerBackend('unknown', undefined)).toThrow(
      'Unknown assembler backend'
    );
  });
});