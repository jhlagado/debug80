import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  binaryFromListingRange,
  copySourceRoot,
  defineAsm80CorpusAcceptance,
  findAsm80Executable,
  parseListingWrittenRange,
  runAsm80Reference,
} from '../helpers/index.js';

const manifest = {
  source: process.env.TETRO_SOURCE ?? '/Users/johnhardy/Documents/projects/tetro/src/tetro.asm',
};

const asm80 = findAsm80Executable();
const tetroFilesAvailable = existsSync(manifest.source);
const runTetroAcceptance = process.env.AZM_RUN_TETRO_ACCEPTANCE === '1';

function buildAsm80Reference(source: string): Buffer {
  return runAsm80Reference({
    asm80,
    source,
    tempPrefix: 'azm-tetro-asm80-reference-',
    outputName: 'tetro-reference.bin',
    prepareSourceTree: copySourceRoot,
    transformOutput: (bytes, outDir) =>
      binaryFromListingRange(bytes, parseListingWrittenRange(join(outDir, 'tetro-reference.lst'))),
  });
}

defineAsm80CorpusAcceptance({
  name: 'Tetro',
  source: manifest.source,
  sourceAvailable: tetroFilesAvailable,
  asm80,
  runAcceptance: runTetroAcceptance,
  buildReference: buildAsm80Reference,
  optInHint: 'set AZM_RUN_TETRO_ACCEPTANCE=1 to run the local Tetro acceptance check',
});
