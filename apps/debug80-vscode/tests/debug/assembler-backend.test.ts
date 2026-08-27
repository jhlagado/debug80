/**
 * @file Assembler backend resolution tests.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  extensions: { getExtension: vi.fn() },
}));

import { resolveAssemblerBackend } from '../../src/debug/launch/assembler-backend';
import { AtomBackend } from '../../src/debug/launch/atom-backend';
import { AzmBackend } from '../../src/debug/launch/azm-backend';
import { GlimmerBackend } from '../../src/debug/launch/glimmer-backend';
import { NucleusBackend } from '../../src/debug/launch/nucleus-backend';

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

  it('returns Atom only when explicitly requested for assembly source', () => {
    expect(resolveAssemblerBackend('atom', '/tmp/program.asm')).toBeInstanceOf(AtomBackend);
    expect(resolveAssemblerBackend('ATOM', '/tmp/program.asm')).toBeInstanceOf(AtomBackend);
    expectAzmBackend(undefined, '/tmp/program.asm');
  });

  it('throws for unknown backends', () => {
    expect(() => resolveAssemblerBackend('unknown', undefined)).toThrow(
      'Unknown assembler backend'
    );
  });

  it('returns glimmer for .glim source paths', () => {
    expect(resolveAssemblerBackend(undefined, '/tmp/game.glim')).toBeInstanceOf(GlimmerBackend);
  });

  it('returns glimmer when explicitly requested', () => {
    expect(resolveAssemblerBackend('glimmer', undefined)).toBeInstanceOf(GlimmerBackend);
    expect(resolveAssemblerBackend('GLIMMER', undefined)).toBeInstanceOf(GlimmerBackend);
  });

  it('returns nucleus for .nu source paths or an explicit backend', () => {
    expect(resolveAssemblerBackend(undefined, '/tmp/main.nu')).toBeInstanceOf(NucleusBackend);
    expect(resolveAssemblerBackend('NUCLEUS', undefined)).toBeInstanceOf(NucleusBackend);
  });

  it('does not expose the removed zax backend', () => {
    expect(() => resolveAssemblerBackend('zax', undefined)).toThrow('Unknown assembler backend');
    expectAzmBackend(undefined, '/tmp/program.zax');
  });
});
