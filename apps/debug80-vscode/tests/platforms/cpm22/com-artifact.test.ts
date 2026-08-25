import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { afterEach, describe, expect, it } from 'vitest';

import { CPM22_COM_MAX_BYTES } from '@jhlagado/debug80-runtime/platforms/cpm22/filesystem';
import type { HexProgram } from '@jhlagado/debug80-runtime/z80/loaders';
import {
  extractCpm22Com,
  materializeCpm22ComArtifact,
  resolveCpm22ComHostPath,
  resolveCpm22ProgramName,
} from '../../../src/platforms/cpm22/com-artifact';

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-cpm-com-'));
  temporaryDirectories.push(directory);
  return directory;
}

function program(ranges: Array<{ start: number; end: number }>): HexProgram {
  const memory = new Uint8Array(0x10000);
  for (const range of ranges) {
    for (let address = range.start; address < range.end && address < memory.length; address += 1) {
      memory[address] = address & 0xff;
    }
  }
  return { memory, startAddress: ranges[0]?.start ?? 0, writeRanges: ranges };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('CP/M .COM artifacts', () => {
  it('extracts from $0100 through the last initialized byte and preserves gaps', () => {
    const bytes = extractCpm22Com(
      program([
        { start: 0x0100, end: 0x0102 },
        { start: 0x0104, end: 0x0106 },
      ])
    );
    expect(bytes).toEqual(Uint8Array.from([0x00, 0x01, 0x00, 0x00, 0x04, 0x05]));
  });

  it('accepts the exact TPA capacity', () => {
    expect(extractCpm22Com(program([{ start: 0x0100, end: 0xe400 }]))).toHaveLength(
      CPM22_COM_MAX_BYTES
    );
  });

  it('rejects empty, wrong-origin, below-TPA, and first-over-capacity programs', () => {
    expect(() => extractCpm22Com(program([]))).toThrow(/no initialized bytes/);
    expect(() => extractCpm22Com(program([{ start: 0x0101, end: 0x0102 }]))).toThrow(
      /first initialized byte must be at \$0100.*source must begin with \.org \$0100/
    );
    expect(() => extractCpm22Com(program([{ start: 0x00ff, end: 0x0101 }]))).toThrow(
      /outside the transient program area/
    );
    expect(() => extractCpm22Com(program([{ start: 0x0100, end: 0xe401 }]))).toThrow(
      /outside the transient program area/
    );
  });

  it('requires a canonical .COM program name and derives one from the artifact', () => {
    expect(resolveCpm22ProgramName('hello.com', '/tmp/build/main.hex')).toBe('HELLO.COM');
    expect(resolveCpm22ProgramName(undefined, '/tmp/build/main.hex')).toBe('MAIN.COM');
    expect(() => resolveCpm22ProgramName('README.TXT', '/tmp/main.hex')).toThrow(
      /must use the \.COM extension/
    );
    expect(() => resolveCpm22ProgramName('TOO-LONG9.COM', '/tmp/main.hex')).toThrow(
      /invalid filename/
    );
  });

  it('publishes an exact host .com and preserves the previous artifact on rejection', () => {
    const directory = temporaryDirectory();
    const hexPath = path.join(directory, 'main.hex');
    fs.writeFileSync(hexPath, ':03010000C90000FF\n:00000001FF\n');

    const artifact = materializeCpm22ComArtifact(hexPath, 'START.COM');
    expect(artifact).toEqual({
      bytes: Uint8Array.from([0xc9, 0x00, 0x00]),
      hostPath: path.join(directory, 'main.com'),
      programName: 'START.COM',
    });
    expect(new Uint8Array(fs.readFileSync(artifact.hostPath))).toEqual(artifact.bytes);
    expect(resolveCpm22ComHostPath(hexPath)).toBe(artifact.hostPath);

    fs.writeFileSync(hexPath, ':01020000C9FF\n:00000001FF\n');
    expect(() => materializeCpm22ComArtifact(hexPath, 'START.COM')).toThrow(
      /first initialized byte must be at \$0100.*source must begin with \.org \$0100/
    );
    expect(new Uint8Array(fs.readFileSync(artifact.hostPath))).toEqual(
      Uint8Array.from([0xc9, 0x00, 0x00])
    );
  });
});
