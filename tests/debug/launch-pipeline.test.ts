/**
 * @file Launch pipeline helpers tests.
 */

import { describe, it, expect, vi } from 'vitest';
import { assembleIfRequested, normalizeStepLimit, resolveExtraListings } from '../../src/debug/launch-pipeline';
import type { LaunchRequestArguments } from '../../src/debug/types';

vi.mock('../../src/debug/assembler', () => ({
  runAssembler: () => ({ success: true }),
  runAssemblerBin: () => ({ success: true }),
}));

describe('launch-pipeline', () => {
  it('normalizes step limits', () => {
    expect(normalizeStepLimit(undefined, 5)).toBe(5);
    expect(normalizeStepLimit(0, 5)).toBe(0);
    expect(normalizeStepLimit(10.7, 5)).toBe(10);
  });

  it('resolves extra listings by platform', () => {
    const list = resolveExtraListings('simple', { extraListings: ['a.lst'] });
    expect(list).toEqual(['a.lst']);
    expect(resolveExtraListings('tec1')).toEqual([]);
  });

  it('skips assembly when disabled', () => {
    const args = { assemble: false } as LaunchRequestArguments;
    expect(() =>
      assembleIfRequested({
        args,
        asmPath: 'a.asm',
        hexPath: 'a.hex',
        listingPath: 'a.lst',
        platform: 'simple',
        sendEvent: () => undefined,
      })
    ).not.toThrow();
  });
});
