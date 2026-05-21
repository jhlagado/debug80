import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { compile } from '../../src/compile.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import type { CompilerOptions, CompileResult } from '../../src/pipeline.js';

function writeTempSource(
  prefix: string,
  ext: string,
  source: string,
): { entry: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const entry = join(dir, `entry.${ext}`);
  writeFileSync(entry, source, 'utf8');
  return { entry, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

export async function compileTempSource(
  prefix: string,
  ext: string,
  source: string,
  options: CompilerOptions,
): Promise<CompileResult> {
  const { entry, cleanup } = writeTempSource(prefix, ext, source);
  try {
    return await compile(entry, options, { formats: defaultFormatWriters });
  } finally {
    cleanup();
  }
}
