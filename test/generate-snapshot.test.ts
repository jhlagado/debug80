import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { generateAzm } from '../src/generate.js';
import { loadGlimmerProgram } from '../src/load.js';

/**
 * The profile-seam refactor gate: generator output for every example is
 * snapshotted byte-for-byte. A structural refactor must not change a
 * single byte; a deliberate generator change updates the snapshots in
 * the same commit, making the output diff part of the review.
 */
const EXAMPLES = ['counter', 'dot', 'slide', 'trail', 'snake', 'tetro'];

describe('generated output snapshots', () => {
  for (const name of EXAMPLES) {
    it(`${name}.glim generates byte-identical output`, () => {
      const entry = path.join(import.meta.dirname, `../examples/${name}.glim`);
      const { program, diagnostics } = loadGlimmerProgram(entry);
      expect(diagnostics).toEqual([]);
      const generated = generateAzm(program!);
      expect(generated.diagnostics).toEqual([]);
      expect(generated.source).toMatchSnapshot();
    });
  }
});
