/**
 * @file Assembler helpers tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  formatAssemblyDiagnostic,
  parseAsm80Diagnostic,
  runAssembler,
  runAssemblerBin,
} from '../../src/debug/launch/assembler';

const getExtension = vi.hoisted(() => vi.fn());

vi.mock('vscode', () => ({
  extensions: { getExtension },
}));

describe('assembler helpers', () => {
  let tmpDir: string;

  beforeEach(() => {
    getExtension.mockReset();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-asm-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('assembles HEX and listing artifacts in-process', () => {
    const asmPath = path.join(tmpDir, 'prog.asm');
    fs.writeFileSync(asmPath, '.ORG 0x0800\nSTART: LD A,1\n RET\n');

    const outDir = path.join(tmpDir, 'build');
    const hexPath = path.join(outDir, 'prog.hex');
    const listingPath = path.join(outDir, 'listings', 'prog.lst');

    const result = runAssembler(asmPath, hexPath, listingPath);

    expect(result.success).toBe(true);
    expect(fs.readFileSync(hexPath, 'utf-8')).toContain(':030800003E01C9ED');
    expect([...fs.readFileSync(path.join(outDir, 'prog.bin'))]).toEqual([0x3e, 0x01, 0xc9]);
    expect(fs.readFileSync(listingPath, 'utf-8')).toContain('START:');
    expect(fs.readFileSync(listingPath, 'utf-8')).toContain('DEFINED AT LINE 2');
  });

  it('returns concise asm80 errors instead of raw JSON dumps', () => {
    const asmPath = path.join(tmpDir, 'prog.asm');
    fs.writeFileSync(asmPath, 'BADOP D,C\n');
    const hexPath = path.join(tmpDir, 'prog.hex');
    const listingPath = path.join(tmpDir, 'prog.lst');

    const result = runAssembler(asmPath, hexPath, listingPath);
    expect(result.success).toBe(false);
    expect(result.error).toBe('prog.asm:1\nUnrecognized instruction BADOP\nBADOP: D,C');
  });

  it('parses asm80 diagnostics into concise rebuild text', () => {
    const diagnostic = parseAsm80Diagnostic(
      `Processing: /tmp/matrix-demo.asm\nERROR  Unrecognized instruction LDX\nat line  19\n>>>  LDX: D,C\n`
    );

    expect(diagnostic).toEqual({
      path: '/tmp/matrix-demo.asm',
      line: 19,
      message: 'Unrecognized instruction LDX',
      sourceLine: 'LDX: D,C',
    });
    expect(formatAssemblyDiagnostic(diagnostic!)).toBe(
      'matrix-demo.asm:19\nUnrecognized instruction LDX\nLDX: D,C'
    );
  });

  it('writes BIN artifacts in-process without wrapper files', () => {
    const asmPath = path.join(tmpDir, 'prog.asm');
    fs.writeFileSync(asmPath, '.ORG 0x4000\nDB 1,2,3\n');
    const hexPath = path.join(tmpDir, 'build', 'prog.hex');

    const result = runAssemblerBin(asmPath, hexPath, 0x4000, 0x4002);
    expect(result.success).toBe(true);

    const wrapper = path.join(tmpDir, '.prog.bin.asm');
    expect(fs.existsSync(wrapper)).toBe(false);
    expect([...fs.readFileSync(path.join(tmpDir, 'build', 'prog.bin'))]).toEqual([1, 2, 3]);
  });

  it('uses binFrom and binTo as compact output bounds, not forced image size', () => {
    const asmPath = path.join(tmpDir, 'bounded.asm');
    fs.writeFileSync(asmPath, '.ORG 0x4000\nDB 1,2,3\n.ORG 0x5000\nDB 4,5\n');
    const hexPath = path.join(tmpDir, 'build', 'bounded.hex');

    const result = runAssemblerBin(asmPath, hexPath, 0x4001, 0x4fff);

    expect(result.success).toBe(true);
    expect([...fs.readFileSync(path.join(tmpDir, 'build', 'bounded.bin'))]).toEqual([2, 3]);
  });
});
