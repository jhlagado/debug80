import { cpSync, copyFileSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

import { compile } from '../../src/compile.js';
import type { Diagnostic } from '../../src/diagnosticTypes.js';
import { defaultFormatWriters } from '../../src/formats/index.js';
import type { BinArtifact } from '../../src/formats/types.js';

type ListingRange = {
  start: number;
  end: number;
};

type Asm80ReferenceOptions = {
  asm80: string | undefined;
  source: string;
  tempPrefix: string;
  outputName: string;
  prepareSourceTree: (source: string, outDir: string) => void;
  transformOutput?: (bytes: Buffer, outDir: string) => Buffer;
};

type Asm80CorpusAcceptanceOptions = {
  name: string;
  source: string;
  sourceAvailable: boolean;
  asm80: string | undefined;
  runAcceptance: boolean;
  buildReference: (source: string) => Buffer;
  blockedReason?: string | undefined;
  optInHint: string;
};

function normalizeExecutableCandidate(candidate: string): string {
  return candidate.includes('/') || candidate.includes('\\') ? resolve(candidate) : candidate;
}

export function findAsm80Executable(): string | undefined {
  const candidates = [
    process.env.ASM80,
    process.env.ASM80_PATH,
    '/Users/johnhardy/Documents/projects/debug80/node_modules/.bin/asm80',
    'asm80',
  ]
    .filter(
      (candidate): candidate is string => candidate !== undefined && candidate.trim().length > 0,
    )
    .map(normalizeExecutableCandidate);

  return candidates.find((candidate) => {
    const probe = spawnSync(candidate, ['-h'], { encoding: 'utf8' });
    return !probe.error;
  });
}

function byteHex(value: number | undefined): string {
  return value === undefined ? 'EOF' : `0x${value.toString(16).padStart(2, '0')}`;
}

function offsetHex(offset: number): string {
  return `0x${offset.toString(16).padStart(4, '0')}`;
}

function diagnosticLocation(diagnostic: Diagnostic): string {
  if (diagnostic.line === undefined || diagnostic.column === undefined) return diagnostic.file;
  return `${diagnostic.file}:${diagnostic.line}:${diagnostic.column}`;
}

export function summarizeDiagnostics(diagnostics: Diagnostic[], limit = 3): string {
  const preview = diagnostics
    .slice(0, limit)
    .map(
      (diagnostic) =>
        `${diagnosticLocation(diagnostic)}: ${diagnostic.severity} [${diagnostic.id}] ${
          diagnostic.message
        }`,
    );
  return [
    `Diagnostics preview (showing ${preview.length} of ${diagnostics.length}):`,
    ...preview,
  ].join('\n');
}

function findFirstMismatch(actual: Buffer, reference: Buffer): number {
  const maxLength = Math.max(actual.length, reference.length);
  for (let i = 0; i < maxLength; i++) {
    if (actual[i] !== reference[i]) return i;
  }
  return -1;
}

export function summarizeBinaryMismatch(actual: Buffer, reference: Buffer): string {
  const firstMismatch = findFirstMismatch(actual, reference);
  const lines = [`Binary length: actual=${actual.length} reference=${reference.length}`];
  if (firstMismatch >= 0) {
    lines.push(
      `First mismatch @${offsetHex(firstMismatch)}: actual=${byteHex(
        actual[firstMismatch],
      )} reference=${byteHex(reference[firstMismatch])}`,
    );
  } else {
    lines.push('First mismatch: none');
  }
  return lines.join('\n');
}

export function copyZ80Siblings(source: string, outDir: string): void {
  for (const entry of readdirSync(dirname(source))) {
    if (entry.toLowerCase().endsWith('.z80')) {
      copyFileSync(join(dirname(source), entry), join(outDir, entry));
    }
  }
}

export function copySourceRoot(source: string, outDir: string): void {
  cpSync(dirname(source), outDir, { recursive: true });
}

export function parseListingWrittenRange(listingPath: string): ListingRange {
  const text = readFileSync(listingPath, 'utf8');
  let start: number | undefined;
  let end = 0;
  for (const line of text.split(/\r?\n/)) {
    const match = /^([0-9A-Fa-f]{4})\s+/.exec(line);
    if (!match) continue;
    const address = Number.parseInt(match[1]!, 16);
    const bytes = line
      .slice(7, 31)
      .trim()
      .split(/\s+/)
      .filter((token) => /^[0-9A-Fa-f]{2}$/.test(token)).length;
    if (bytes === 0) continue;
    start = start === undefined ? address : Math.min(start, address);
    end = Math.max(end, address + bytes);
  }
  return { start: start ?? 0, end };
}

export function binaryFromListingRange(bytes: Buffer, range: ListingRange): Buffer {
  if (bytes.length !== 0x10000) return bytes;
  let end = range.end;
  for (let index = bytes.length - 1; index >= range.start; index--) {
    if (bytes[index] !== 0) {
      end = Math.max(end, index + 1);
      break;
    }
  }
  return bytes.subarray(range.start, end);
}

export function runAsm80Reference(options: Asm80ReferenceOptions): Buffer {
  if (!options.asm80) throw new Error('asm80 executable not found');
  const outDir = mkdtempSync(join(tmpdir(), options.tempPrefix));
  const outBin = join(outDir, options.outputName);
  try {
    options.prepareSourceTree(options.source, outDir);
    const result = spawnSync(
      options.asm80,
      ['-m', 'Z80', '-t', 'bin', '-o', options.outputName, basename(options.source)],
      {
        cwd: outDir,
        encoding: 'utf8',
      },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(
        [`asm80 failed with status ${result.status}`, result.stdout.trim(), result.stderr.trim()]
          .filter((part) => part.length > 0)
          .join('\n'),
      );
    }
    const bytes = readFileSync(outBin);
    return options.transformOutput ? options.transformOutput(bytes, outDir) : bytes;
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}

export function defineAsm80CorpusAcceptance(options: Asm80CorpusAcceptanceOptions): void {
  const describeCorpus =
    options.sourceAvailable && options.asm80 && options.runAcceptance && !options.blockedReason
      ? describe
      : describe.skip;

  describeCorpus(`ASM80 ${options.name} acceptance`, () => {
    it(`compiles ${options.name} and matches a fresh ASM80-built reference binary`, async () => {
      const res = await compile(
        options.source,
        { emitBin: true, emitHex: false, emitD8m: false, emitListing: false },
        { formats: defaultFormatWriters },
      );
      const errors = res.diagnostics.filter((d) => d.severity === 'error');
      if (errors.length > 0) throw new Error(summarizeDiagnostics(res.diagnostics));

      const bin = res.artifacts.find((a): a is BinArtifact => a.kind === 'bin');
      expect(bin).toBeDefined();
      if (!bin) throw new Error('missing bin artifact');

      const actual = Buffer.from(bin.bytes);
      const expected = options.buildReference(options.source);
      const binarySummary = summarizeBinaryMismatch(actual, expected);

      if (actual.length !== expected.length || findFirstMismatch(actual, expected) !== -1) {
        throw new Error(binarySummary);
      }
    });
  });

  if (options.runAcceptance && options.blockedReason) {
    const blockedReason = options.blockedReason;
    describe(`ASM80 ${options.name} acceptance`, () => {
      it.todo(blockedReason);
    });
  } else if (options.runAcceptance && !options.sourceAvailable) {
    describe(`ASM80 ${options.name} acceptance`, () => {
      it(`requires the local ${options.name} source when opt-in acceptance is enabled`, () => {
        throw new Error(`${options.name} source is unavailable: ${options.source}`);
      });
    });
  } else if (options.runAcceptance && !options.asm80) {
    describe(`ASM80 ${options.name} acceptance`, () => {
      it('requires asm80 when opt-in acceptance is enabled', () => {
        throw new Error('asm80 executable is unavailable. Set ASM80 or ASM80_PATH.');
      });
    });
  } else if (!options.sourceAvailable) {
    describe(`ASM80 ${options.name} acceptance`, () => {
      it.todo(`skipped: local ${options.name} source is unavailable`);
    });
  } else if (!options.asm80) {
    describe(`ASM80 ${options.name} acceptance`, () => {
      it.todo('skipped: asm80 executable is unavailable');
    });
  } else if (!options.runAcceptance) {
    describe(`ASM80 ${options.name} acceptance`, () => {
      it.todo(options.optInHint);
    });
  }
}
