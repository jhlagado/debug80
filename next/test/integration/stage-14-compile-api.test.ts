import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { compile, defaultFormatWriters } from '../../src/index.js';

async function withTempDir<T>(prefix: string, callback: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  try {
    return await callback(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

describe('stage 14 register-care compile API slice', () => {
  it('returns an error diagnostic for .asmi interface extension mismatch', async () => {
    await withTempDir('azm-next-regcare-compile-ext-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const iface = join(dir, 'lib.asm');
      await writeFile(entry, 'start:\n  ret\n.end\n', 'utf8');
      await writeFile(iface, ['extern MON', 'clobbers A', 'end'].join('\n'), 'utf8');

      const result = await compile(entry, {
        registerCareInterfaces: [iface],
        emitRegisterReport: true,
      }, {
        formats: defaultFormatWriters,
      });

      expect(result.diagnostics).toEqual([
        {
          severity: 'error',
          code: 'AZMN_REGISTER_CARE',
          message: 'Register-care interface files must use the .asmi extension',
          sourceName: iface,
        },
      ]);
      expect(result.artifacts).toEqual([]);
    });
  });

  it('throws on malformed --accept-out values before assembly', async () => {
    await withTempDir('azm-next-regcare-compile-accept-', async (dir) => {
      const entry = join(dir, 'main.asm');
      await writeFile(entry, 'start:\n  ret\n.end\n', 'utf8');

      await expect(
        compile(
          entry,
          {
            acceptRegisterOutputCandidates: ['MASK:A,'],
            registerCare: 'audit',
          },
          { formats: defaultFormatWriters },
        ),
      ).rejects.toThrow('Invalid --accept-out value "MASK:A,"');
    });
  });

  it('throws on malformed interface contract lines', async () => {
    await withTempDir('azm-next-regcare-compile-interface-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const iface = join(dir, 'lib.asmi');
      await writeFile(entry, 'start:\n  ret\n.end\n', 'utf8');
      await writeFile(iface, ['extern MON', 'clobbers A, Q', 'end'].join('\n'), 'utf8');

      await expect(
        compile(
          entry,
          {
            registerCare: 'audit',
            registerCareInterfaces: [iface],
            emitRegisterInterface: true,
          },
          { formats: defaultFormatWriters },
        ),
      ).rejects.toThrow('invalid register-care interface line "clobbers A, Q"');
    });
  });
});
