/**
 * @file Launch pipeline helpers tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { assembleIfRequested, normalizeStepLimit, resolveExtraListings } from '../../src/debug/launch-pipeline';
import type { LaunchRequestArguments } from '../../src/debug/types';
import * as assembler from '../../src/debug/assembler';

vi.mock('../../src/debug/assembler', () => ({
  runAssembler: vi.fn(() => ({ success: true })),
  runAssemblerBin: vi.fn(() => ({ success: true })),
}));

describe('launch-pipeline', () => {
  beforeEach(() => {
    vi.mocked(assembler.runAssembler).mockReturnValue({ success: true });
    vi.mocked(assembler.runAssemblerBin).mockReturnValue({ success: true });
  });

  it('normalizes step limits', () => {
    expect(normalizeStepLimit(undefined, 5)).toBe(5);
    expect(normalizeStepLimit(0, 5)).toBe(0);
    expect(normalizeStepLimit(10.7, 5)).toBe(10);
    expect(normalizeStepLimit(Number.NaN, 5)).toBe(5);
    expect(normalizeStepLimit(-2, 5)).toBe(0);
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

  it('throws when assembler fails', () => {
    vi.mocked(assembler.runAssembler).mockReturnValue({
      success: false,
      error: 'bad asm',
    });
    const args = {} as LaunchRequestArguments;
    expect(() =>
      assembleIfRequested({
        args,
        asmPath: 'a.asm',
        hexPath: 'a.hex',
        listingPath: 'a.lst',
        platform: 'simple',
        sendEvent: () => undefined,
      })
    ).toThrow('bad asm');
  });

  it('invokes binary assembly for simple platform', () => {
    const args = {} as LaunchRequestArguments;
    expect(() =>
      assembleIfRequested({
        args,
        asmPath: 'a.asm',
        hexPath: 'a.hex',
        listingPath: 'a.lst',
        platform: 'simple',
        simpleConfig: { binFrom: 0x900, binTo: 0xffff, regions: [] },
        sendEvent: () => undefined,
      })
    ).not.toThrow();
    expect(assembler.runAssemblerBin).toHaveBeenCalled();
  });

  it('throws when binary assembly fails', () => {
    vi.mocked(assembler.runAssembler).mockReturnValue({ success: true });
    vi.mocked(assembler.runAssemblerBin).mockReturnValue({
      success: false,
      error: 'bad bin',
    });
    const args = {} as LaunchRequestArguments;
    expect(() =>
      assembleIfRequested({
        args,
        asmPath: 'a.asm',
        hexPath: 'a.hex',
        listingPath: 'a.lst',
        platform: 'simple',
        simpleConfig: { binFrom: 0x900, binTo: 0xffff, regions: [] },
        sendEvent: () => undefined,
      })
    ).toThrow('bad bin');
  });
});
