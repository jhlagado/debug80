import { cpSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

import {
  binaryFromListingRange,
  defineAsm80CorpusAcceptance,
  findAsm80Executable,
  parseListingWrittenRange,
  runAsm80Reference,
} from '../helpers/index.js';

const manifest = {
  source: process.env.PACMO_SOURCE ?? '/Users/johnhardy/projects/tetro/src/pacmo/pacmo.z80',
};

const asm80 = findAsm80Executable();
const pacmoFilesAvailable = existsSync(manifest.source);
const runPacmoAcceptance = process.env.AZM_RUN_PACMO_ACCEPTANCE === '1';

function copyPacmoSourceTree(source: string, outDir: string): void {
  const sourceDir = dirname(source);
  const sourceRoot = dirname(sourceDir);
  cpSync(sourceDir, outDir, { recursive: true });
  cpSync(join(sourceRoot, 'shared'), join(dirname(outDir), 'shared'), { recursive: true });
}

function buildAsm80Reference(source: string): Buffer {
  return runAsm80Reference({
    asm80,
    source,
    tempPrefix: 'azm-pacmo-asm80-reference-',
    outputName: 'pacmo-reference.bin',
    prepareSourceTree: copyPacmoSourceTree,
    transformOutput: (bytes, outDir) =>
      binaryFromListingRange(bytes, parseListingWrittenRange(join(outDir, 'pacmo-reference.lst'))),
  });
}

defineAsm80CorpusAcceptance({
  name: 'Pacmo',
  source: manifest.source,
  sourceAvailable: pacmoFilesAvailable,
  asm80,
  runAcceptance: runPacmoAcceptance,
  buildReference: buildAsm80Reference,
  optInHint: 'set AZM_RUN_PACMO_ACCEPTANCE=1 to run the local Pacmo acceptance check',
});
