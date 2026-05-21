#!/usr/bin/env node
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { findAsm80 } from './asm80Tools.mjs';
import {
  copyAsm80SourceSiblings,
  findFirstMismatch,
  summarizeBinaryMismatch,
} from './binaryCompareTools.mjs';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(__filename), '..', '..');
const defaultSource = '/Users/johnhardy/Documents/projects/MON3/src/mon3.z80';

function usage() {
  return [
    'Usage: node scripts/dev/compare-mon3-binary.mjs [source.z80] [reference.bin]',
    '',
    `Default source: ${defaultSource}`,
    'Default reference: fresh asm80 build from the same source tree',
    'Set ASM80 or ASM80_PATH to choose the asm80 executable.',
  ].join('\n');
}

function diagnosticLocation(diagnostic) {
  if (diagnostic.line === undefined || diagnostic.column === undefined) return diagnostic.file;
  return `${diagnostic.file}:${diagnostic.line}:${diagnostic.column}`;
}

function summarizeDiagnostics(diagnostics, limit = 10) {
  const preview = diagnostics.slice(0, limit).map(
    (diagnostic) =>
      `${diagnosticLocation(diagnostic)}: ${diagnostic.severity} [${diagnostic.id}] ${diagnostic.message}`,
  );
  return [`Diagnostics preview (showing ${preview.length} of ${diagnostics.length}):`, ...preview].join(
    '\n',
  );
}

async function loadCompiler() {
  const compilePath = resolve(repoRoot, 'dist', 'src', 'compile.js');
  const formatsPath = resolve(repoRoot, 'dist', 'src', 'formats', 'index.js');
  if (!existsSync(compilePath) || !existsSync(formatsPath)) {
    throw new Error('Built compiler not found. Run `npm run build` before this script.');
  }

  const [{ compile }, { defaultFormatWriters }] = await Promise.all([
    import(pathToFileURL(compilePath).href),
    import(pathToFileURL(formatsPath).href),
  ]);
  return { compile, defaultFormatWriters };
}

function buildAsm80Reference(source, asm80) {
  const outDir = mkdtempSync(join(tmpdir(), 'azm-mon3-asm80-reference-'));
  const outName = 'mon3-reference.bin';
  const outBin = join(outDir, outName);
  try {
    copyAsm80SourceSiblings(source, outDir, /\.z80$/i);
    const result = spawnSync(
      asm80,
      ['-m', 'Z80', '-t', 'bin', '-o', outName, basename(source)],
      {
        cwd: outDir,
        encoding: 'utf8',
      },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(
        [
          `asm80 failed with status ${result.status}`,
          result.stdout.trim(),
          result.stderr.trim(),
        ].filter((part) => part.length > 0).join('\n'),
      );
    }
    return readFileSync(outBin);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

async function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage());
    return 0;
  }
  if (argv.length > 2) {
    console.error(usage());
    return 2;
  }

  const source = argv[0] ?? defaultSource;
  const referencePath = argv[1];
  if (!existsSync(source)) throw new Error(`MON3 source not found: ${source}`);
  if (referencePath !== undefined && !existsSync(referencePath)) {
    throw new Error(`Reference binary not found: ${referencePath}`);
  }

  const { compile, defaultFormatWriters } = await loadCompiler();
  const res = await compile(
    source,
    { emitBin: true, emitHex: false, emitD8m: false, emitListing: false },
    { formats: defaultFormatWriters },
  );

  if (res.diagnostics.length > 0) {
    console.error(summarizeDiagnostics(res.diagnostics));
  }

  const errors = res.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
  if (errors.length > 0) return 1;

  const bin = res.artifacts.find((artifact) => artifact.kind === 'bin');
  if (!bin) throw new Error('Compiler did not emit a bin artifact.');

  const actual = Buffer.from(bin.bytes);
  let reference;
  if (referencePath !== undefined) {
    reference = readFileSync(referencePath);
  } else {
    const asm80 = findAsm80();
    if (!asm80) throw new Error('asm80 executable not found. Set ASM80 or ASM80_PATH.');
    reference = buildAsm80Reference(source, asm80);
  }
  console.log(summarizeBinaryMismatch(actual, reference));
  return actual.length === reference.length && findFirstMismatch(actual, reference) === -1 ? 0 : 1;
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  });
