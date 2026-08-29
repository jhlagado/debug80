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

function expectAtomBackend(id?: string, sourcePath?: string): void {
  expect(resolveAssemblerBackend(id, sourcePath)).toBeInstanceOf(AtomBackend);
}

describe('assembler-backend', () => {
  it('returns Atom by default', () => {
    expectAtomBackend();
  });

  it('returns azm when explicitly requested', () => {
    expectAzmBackend('azm');
  });

  it('returns Atom for asm-family source paths', () => {
    expectAtomBackend(undefined, '/tmp/program.asm');
    expectAtomBackend(undefined, '/tmp/program.inc');
    expectAtomBackend(undefined, '/tmp/program.z80');
  });

  it('matches azm case-insensitively', () => {
    expectAzmBackend('AZM');
    expectAzmBackend('ASM80');
  });

  it('matches Atom case-insensitively', () => {
    expectAtomBackend('atom', '/tmp/program.asm');
    expectAtomBackend('ATOM', '/tmp/program.asm');
    expectAtomBackend('ATOM-Z80', '/tmp/program.asm');
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
    expectAtomBackend(undefined, '/tmp/program.zax');
  });
});
