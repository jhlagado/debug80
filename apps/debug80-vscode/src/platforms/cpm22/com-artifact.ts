/**
 * @file CP/M .COM extraction and artifact publication for Debug80 projects.
 */

import * as fs from 'fs';
import * as path from 'path';

import {
  CPM22_COM_LIMIT_ADDRESS,
  CPM22_COM_LOAD_ADDRESS,
  CPM22_COM_MAX_BYTES,
  parseCpm22Filename,
} from '@jhlagado/debug80-runtime/platforms/cpm22/filesystem';
import { parseIntelHex, type HexProgram } from '@jhlagado/debug80-runtime/z80/loaders';

export interface Cpm22ComArtifact {
  bytes: Uint8Array;
  hostPath: string;
  programName: string;
}

function fail(message: string): never {
  throw new Error(`Debug80 CP/M .COM: ${message}`);
}

/** Resolves and validates the user-0 .COM filename installed in drive A. */
export function resolveCpm22ProgramName(
  configuredName: string | undefined,
  hexPath: string
): string {
  const fallback = `${path.basename(hexPath, path.extname(hexPath))}.COM`;
  const parsed = parseCpm22Filename(configuredName ?? fallback);
  if (parsed.extension.trimEnd() !== 'COM') {
    fail(`${parsed.canonical} must use the .COM extension`);
  }
  return parsed.canonical;
}

/** Extracts the exact initialized range from $0100 through the last emitted byte. */
export function extractCpm22Com(program: HexProgram): Uint8Array {
  const ranges = program.writeRanges ?? [];
  if (ranges.length === 0) {
    fail('the program contains no initialized bytes');
  }
  let first = CPM22_COM_LIMIT_ADDRESS;
  let end = CPM22_COM_LOAD_ADDRESS;
  for (const range of ranges) {
    if (
      !Number.isInteger(range.start) ||
      !Number.isInteger(range.end) ||
      range.start < 0 ||
      range.end <= range.start ||
      range.end > program.memory.length
    ) {
      fail(`invalid initialized range ${range.start}..${range.end}`);
    }
    if (range.start < CPM22_COM_LOAD_ADDRESS || range.end > CPM22_COM_LIMIT_ADDRESS) {
      fail(
        `initialized range $${range.start.toString(16).padStart(4, '0')}..$${(range.end - 1)
          .toString(16)
          .padStart(4, '0')} lies outside the transient program area $0100..$e3ff`
      );
    }
    first = Math.min(first, range.start);
    end = Math.max(end, range.end);
  }
  if (first !== CPM22_COM_LOAD_ADDRESS) {
    fail(
      `the first initialized byte must be at $0100, got $${first.toString(16).padStart(4, '0')}`
    );
  }
  const length = end - CPM22_COM_LOAD_ADDRESS;
  if (length <= 0 || length > CPM22_COM_MAX_BYTES) {
    fail(`program length ${length} is outside 1..${CPM22_COM_MAX_BYTES} bytes`);
  }
  return program.memory.slice(CPM22_COM_LOAD_ADDRESS, end);
}

export function resolveCpm22ComHostPath(hexPath: string): string {
  const parsed = path.parse(hexPath);
  return path.join(parsed.dir, `${parsed.name}.com`);
}

/** Validates a HEX artifact and atomically publishes its matching host .com file. */
export function materializeCpm22ComArtifact(
  hexPath: string,
  configuredName?: string
): Cpm22ComArtifact {
  const program = parseIntelHex(fs.readFileSync(hexPath, 'utf8'));
  const bytes = extractCpm22Com(program);
  const programName = resolveCpm22ProgramName(configuredName, hexPath);
  const hostPath = resolveCpm22ComHostPath(hexPath);
  const temporaryPath = `${hostPath}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(temporaryPath, bytes);
    fs.renameSync(temporaryPath, hostPath);
  } finally {
    if (fs.existsSync(temporaryPath)) {
      fs.unlinkSync(temporaryPath);
    }
  }
  return { bytes, hostPath, programName };
}
