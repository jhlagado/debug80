/**
 * @file Launch pipeline helpers tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AssemblerBackend } from '../../src/debug/assembler-backend';
import { assembleIfRequested, normalizeStepLimit, resolveExtraListings } from '../../src/debug/launch-pipeline';
import type { LaunchRequestArguments } from '../../src/debug/types';

describe('launch-pipeline', () => {
  let backend: AssemblerBackend & {
    assemble: ReturnType<typeof vi.fn>;
    assembleBin: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    backend = {
      id: 'mock-asm',
      assemble: vi.fn(() => ({ success: true })),
      assembleBin: vi.fn(() => ({ success: true })),
    };
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

  it('infers tec1g listing from romHex when extraListings is missing', () => {
    const list = resolveExtraListings('tec1g', undefined, undefined, {
      regions: [],
      romRanges: [],
      appStart: 0,
      entry: 0,
      updateMs: 16,
      yieldMs: 0,
      romHex: 'roms/tec1g/mon-3/mon-3.bin',
      gimpSignal: false,
      expansionBankHi: false,
      matrixMode: false,
      protectOnReset: false,
      rtcEnabled: false,
      sdEnabled: false,
      sdHighCapacity: false,
    });
    expect(list).toContain('roms/tec1g/mon-3/mon-3.lst');
    expect(list).toContain('roms/tec1g/mon-3/mon3.lst');
  });

  it('skips assembly when disabled', () => {
    const args = { assemble: false } as LaunchRequestArguments;
    expect(() =>
      assembleIfRequested({
        backend,
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
    backend.assemble.mockReturnValue({
      success: false,
      error: 'bad asm',
    });
    const args = {} as LaunchRequestArguments;
    expect(() =>
      assembleIfRequested({
        backend,
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
        backend,
        args,
        asmPath: 'a.asm',
        hexPath: 'a.hex',
        listingPath: 'a.lst',
        platform: 'simple',
        simpleConfig: { binFrom: 0x900, binTo: 0xffff, regions: [] },
        sendEvent: () => undefined,
      })
    ).not.toThrow();
    expect(backend.assemble).toHaveBeenCalled();
    expect(backend.assembleBin).toHaveBeenCalled();
  });

  it('throws when binary assembly fails', () => {
    backend.assemble.mockReturnValue({ success: true });
    backend.assembleBin.mockReturnValue({
      success: false,
      error: 'bad bin',
    });
    const args = {} as LaunchRequestArguments;
    expect(() =>
      assembleIfRequested({
        backend,
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

  it('skips binary assembly when backend does not support it', () => {
    const noBinBackend: AssemblerBackend = {
      id: backend.id,
      assemble: backend.assemble,
    };
    const args = {} as LaunchRequestArguments;

    expect(() =>
      assembleIfRequested({
        backend: noBinBackend,
        args,
        asmPath: 'a.asm',
        hexPath: 'a.hex',
        listingPath: 'a.lst',
        platform: 'simple',
        simpleConfig: { binFrom: 0x900, binTo: 0xffff, regions: [] },
        sendEvent: () => undefined,
      })
    ).not.toThrow();
  });

  it('uses the backend id in fallback error messages', () => {
    backend.assemble.mockReturnValue({ success: false });
    const args = {} as LaunchRequestArguments;

    expect(() =>
      assembleIfRequested({
        backend,
        args,
        asmPath: 'a.asm',
        hexPath: 'a.hex',
        listingPath: 'a.lst',
        platform: 'simple',
        sendEvent: () => undefined,
      })
    ).toThrow('mock-asm failed to assemble');
  });
});
