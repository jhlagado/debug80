/**
 * @file Launch pipeline helpers tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AssemblerBackend } from '../../src/debug/launch/assembler-backend';
import { assembleIfRequested, normalizeStepLimit, resolveExtraListings } from '../../src/debug/launch/launch-pipeline';
import type { LaunchRequestArguments } from '../../src/debug/session/types';

describe('launch-pipeline', () => {
  let backend: AssemblerBackend & {
    assemble: ReturnType<typeof vi.fn>;
    assembleBin: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    backend = {
      id: 'mock-asm',
      assemble: vi.fn(() => Promise.resolve({ success: true })),
      assembleBin: vi.fn(() => Promise.resolve({ success: true })),
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


  it('skips assembly when disabled', async () => {
    const args = { assemble: false } as LaunchRequestArguments;
    await expect(
      assembleIfRequested({
        backend,
        args,
        asmPath: 'a.asm',
        hexPath: 'a.hex',
        listingPath: 'a.lst',
        platform: 'simple',
        sendEvent: () => undefined,
      })
    ).resolves.toBeUndefined();
  });

  it('throws when assembler fails', async () => {
    backend.assemble.mockResolvedValue({
      success: false,
      error: 'bad asm',
    });
    const args = {} as LaunchRequestArguments;
    await expect(
      assembleIfRequested({
        backend,
        args,
        asmPath: 'a.asm',
        hexPath: 'a.hex',
        listingPath: 'a.lst',
        platform: 'simple',
        sendEvent: () => undefined,
      })
    ).rejects.toThrow('bad asm');
  });

  it('invokes binary assembly for simple platform', async () => {
    const args = {} as LaunchRequestArguments;
    await expect(
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
    ).resolves.toBeUndefined();
    expect(backend.assemble).toHaveBeenCalled();
    expect(backend.assembleBin).toHaveBeenCalled();
  });

  it('throws when binary assembly fails', async () => {
    backend.assemble.mockResolvedValue({ success: true });
    backend.assembleBin.mockResolvedValue({
      success: false,
      error: 'bad bin',
    });
    const args = {} as LaunchRequestArguments;
    await expect(
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
    ).rejects.toThrow('bad bin');
  });

  it('skips binary assembly when backend does not support it', async () => {
    const noBinBackend: AssemblerBackend = {
      id: backend.id,
      assemble: backend.assemble,
    };
    const args = {} as LaunchRequestArguments;

    await expect(
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
    ).resolves.toBeUndefined();
  });

  it('uses the backend id in fallback error messages', async () => {
    backend.assemble.mockResolvedValue({ success: false });
    const args = {} as LaunchRequestArguments;

    await expect(
      assembleIfRequested({
        backend,
        args,
        asmPath: 'a.asm',
        hexPath: 'a.hex',
        listingPath: 'a.lst',
        platform: 'simple',
        sendEvent: () => undefined,
      })
    ).rejects.toThrow('mock-asm failed to assemble');
  });
});
