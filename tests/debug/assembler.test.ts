/**
 * @file Assembler helpers tests.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  findAsm80Binary,
  formatAssemblyDiagnostic,
  parseAsm80Diagnostic,
  resolveAsm80Command,
  runAssembler,
  runAssemblerBin,
  shouldInvokeWithNode,
} from '../../src/debug/assembler';

const spawnSync = vi.hoisted(() => vi.fn());

vi.mock('child_process', () => ({
  spawnSync,
}));

const getExtension = vi.hoisted(() => vi.fn());

vi.mock('vscode', () => ({
  extensions: { getExtension },
}));

describe('assembler helpers', () => {
  let tmpDir: string;

  beforeEach(() => {
    spawnSync.mockReset();
    getExtension.mockReset();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'debug80-asm-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects node shebang for local scripts', () => {
    const scriptPath = path.join(tmpDir, 'asm80');
    fs.writeFileSync(scriptPath, '#!/usr/bin/env node\nconsole.log("hi")\n');
    expect(shouldInvokeWithNode(scriptPath)).toBe(true);
  });

  it('does not require node for bare commands', () => {
    expect(shouldInvokeWithNode('asm80')).toBe(false);
  });

  it('finds asm80 in local node_modules/.bin', () => {
    const binDir = path.join(tmpDir, 'node_modules', '.bin');
    fs.mkdirSync(binDir, { recursive: true });
    const binPath = path.join(binDir, 'asm80');
    fs.writeFileSync(binPath, '');
    expect(findAsm80Binary(tmpDir)).toBe(binPath);
  });

  it('resolves asm80 via node when shebang indicates node', () => {
    const binDir = path.join(tmpDir, 'node_modules', '.bin');
    fs.mkdirSync(binDir, { recursive: true });
    const binPath = path.join(binDir, 'asm80');
    fs.writeFileSync(binPath, '#!/usr/bin/env node\n');

    const resolved = resolveAsm80Command(tmpDir);
    expect(resolved.command).toBe(process.execPath);
    expect(resolved.argsPrefix).toEqual([binPath]);
  });

  it('runs the assembler and copies listings when needed', () => {
    const binDir = path.join(tmpDir, 'node_modules', '.bin');
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(path.join(binDir, 'asm80'), '');

    const asmPath = path.join(tmpDir, 'prog.asm');
    fs.writeFileSync(asmPath, 'NOP\n');

    const outDir = path.join(tmpDir, 'build');
    const hexPath = path.join(outDir, 'prog.hex');
    const listingPath = path.join(outDir, 'listings', 'prog.lst');
    const producedListing = path.join(outDir, 'prog.lst');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(producedListing, 'LISTING\n');

    spawnSync.mockReturnValue({ status: 0, stdout: 'ok', stderr: '' });

    const result = runAssembler(asmPath, hexPath, listingPath);

    expect(result.success).toBe(true);
    expect(result.stdout).toBe('ok');
    expect(fs.existsSync(listingPath)).toBe(true);
    expect(fs.readFileSync(listingPath, 'utf-8')).toBe('LISTING\n');
  });

  it('returns a helpful error when asm80 is missing', () => {
    const asmPath = path.join(tmpDir, 'prog.asm');
    fs.writeFileSync(asmPath, 'NOP\n');
    const hexPath = path.join(tmpDir, 'prog.hex');
    const listingPath = path.join(tmpDir, 'prog.lst');

    spawnSync.mockReturnValue({
      error: { code: 'ENOENT', message: 'not found' },
    });

    const result = runAssembler(asmPath, hexPath, listingPath);
    expect(result.success).toBe(false);
    expect(result.error).toContain('asm80 not found');
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

  it('returns concise asm80 errors instead of raw JSON dumps', () => {
    const asmPath = path.join(tmpDir, 'matrix-demo.asm');
    fs.writeFileSync(asmPath, 'NOP\n');
    const hexPath = path.join(tmpDir, 'matrix-demo.hex');
    const listingPath = path.join(tmpDir, 'matrix-demo.lst');

    spawnSync.mockReturnValue({
      status: 255,
      stdout:
        "Processing: /tmp/matrix-demo.asm\n{ msg: 'Unrecognized instruction LDX' }\nERROR  Unrecognized instruction LDX\nat line  19\n>>>  LDX: D,C\n",
      stderr: '',
    });

    const result = runAssembler(asmPath, hexPath, listingPath);

    expect(result.success).toBe(false);
    expect(result.error).toBe('matrix-demo.asm:19\nUnrecognized instruction LDX\nLDX: D,C');
    expect(result.diagnostic?.line).toBe(19);
  });

  it('cleans up BIN wrapper files after assembly', () => {
    const binDir = path.join(tmpDir, 'node_modules', '.bin');
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(path.join(binDir, 'asm80'), '');

    const asmPath = path.join(tmpDir, 'prog.asm');
    fs.writeFileSync(asmPath, 'NOP\n');
    const hexPath = path.join(tmpDir, 'prog.hex');

    spawnSync.mockReturnValue({ status: 0, stdout: '', stderr: '' });

    const result = runAssemblerBin(asmPath, hexPath, 0x4000, 0x4fff);
    expect(result.success).toBe(true);

    const wrapper = path.join(tmpDir, '.prog.bin.asm');
    expect(fs.existsSync(wrapper)).toBe(false);
  });
});
