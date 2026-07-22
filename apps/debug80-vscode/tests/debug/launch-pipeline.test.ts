/**
 * @file Launch pipeline helpers tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AssemblerBackend } from '../../src/debug/launch/assembler-backend';
import { assembleIfRequested, normalizeStepLimit } from '../../src/debug/launch/launch-pipeline';
import type { LaunchRequestArguments } from '../../src/debug/session/types';
import { normalizeSimpleConfig } from '@jhlagado/debug80-runtime/platforms/simple/runtime';
import type { SimplePlatformConfigNormalized } from '@jhlagado/debug80-runtime/platforms/types';

type AssembleOptions = Parameters<typeof assembleIfRequested>[0];

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

  it('skips assembly when disabled', async () => {
    const args = { assemble: false } as LaunchRequestArguments;
    await expect(assemble({ args })).resolves.toBeUndefined();
  });

  it('throws when assembler fails', async () => {
    backend.assemble.mockResolvedValue({
      success: false,
      error: 'bad asm',
    });
    await expect(assemble()).rejects.toThrow('bad asm');
  });

  it('forwards assembler output without requiring a debug event sink', async () => {
    const onOutput = vi.fn();

    await expect(assemble({ sendEvent: undefined, onOutput })).resolves.toBeUndefined();

    const assembleOptions = backend.assemble.mock.calls[0]?.[0] as
      { onOutput?: (message: string) => void } | undefined;
    assembleOptions?.onOutput?.('assembler output\n');
    expect(onOutput).toHaveBeenCalledWith('assembler output\n');
  });

  it('invokes binary assembly for simple platform', async () => {
    await expect(
      assemble({
        sourceRoot: '/project',
        simpleConfig: simpleBinaryConfig(),
      })
    ).resolves.toBeUndefined();
    expect(backend.assemble).toHaveBeenCalledWith(
      expect.objectContaining({ sourceRoot: '/project' })
    );
    expect(backend.assembleBin).toHaveBeenCalledWith(
      expect.objectContaining({ sourceRoot: '/project' })
    );
  });

  it('throws when binary assembly fails', async () => {
    backend.assemble.mockResolvedValue({ success: true });
    backend.assembleBin.mockResolvedValue({
      success: false,
      error: 'bad bin',
    });
    await expect(
      assemble({
        simpleConfig: simpleBinaryConfig(),
      })
    ).rejects.toThrow('bad bin');
  });

  it('rejects ranged binaries when the backend does not support them', async () => {
    const noBinBackend: AssemblerBackend = {
      id: 'glimmer',
      assemble: backend.assemble,
    };

    await expect(
      assemble({
        backend: noBinBackend,
        simpleConfig: simpleBinaryConfig(),
      })
    ).rejects.toThrow(
      'glimmer does not support simple.binFrom/simple.binTo; ranged Simple binaries currently require the AZM backend.'
    );
    expect(backend.assemble).not.toHaveBeenCalled();
  });

  it('uses the backend id in fallback error messages', async () => {
    backend.assemble.mockResolvedValue({ success: false });

    await expect(assemble()).rejects.toThrow('mock-asm failed to assemble');
  });

  function assemble(
    options: Partial<AssembleOptions> = {}
  ): ReturnType<typeof assembleIfRequested> {
    return assembleIfRequested({
      backend,
      args: {} as LaunchRequestArguments,
      asmPath: 'a.asm',
      hexPath: 'a.hex',
      platform: 'simple',
      sendEvent: () => undefined,
      ...options,
    });
  }
});

function simpleBinaryConfig(): SimplePlatformConfigNormalized {
  return normalizeSimpleConfig({ binFrom: 0x900, binTo: 0xffff });
}
