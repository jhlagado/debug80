/**
 * @file Glimmer backend integration: a .glim target builds to hex/bin/d8
 * with the debug map attributed to .glim source.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  extensions: { getExtension: vi.fn() },
}));

import { GlimmerBackend } from '../../src/debug/launch/glimmer-backend';

const GLIM_SOURCE = [
  'program Probe',
  'platform tec1g-mon3',
  'display matrix8x8',
  'state DotY : byte = 3 changed',
  'pulse Up',
  'bind key KEY_2 rising -> Up',
  'effect MoveUp',
  '    on Up',
  '    updates DotY',
  'begin',
  '    ld a,(DotY)',
  '    or a',
  '    jr z,_stop',
  '    dec a',
  '    ld (DotY),a',
  '_stop:',
  'end',
  'render Draw',
  '    on DotY',
  'begin',
  '    ld a,(DotY)',
  'end',
].join('\n');

describe('glimmer-backend', () => {
  it('builds a .glim source into hex/bin/d8 with .glim map attribution', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd80-glim-'));
    const srcDir = path.join(dir, 'src');
    const buildDir = path.join(dir, 'build');
    fs.mkdirSync(srcDir, { recursive: true });
    const entry = path.join(srcDir, 'probe.glim');
    fs.writeFileSync(entry, GLIM_SOURCE);

    const backend = new GlimmerBackend();
    const output: string[] = [];
    const result = await backend.assemble({
      asmPath: entry,
      hexPath: path.join(buildDir, 'probe.hex'),
      onOutput: (message) => output.push(message),
    });

    expect(result.success, output.join('')).toBe(true);
    expect(fs.existsSync(path.join(buildDir, 'probe.hex'))).toBe(true);
    expect(fs.existsSync(path.join(buildDir, 'probe.bin'))).toBe(true);
    expect(fs.existsSync(path.join(buildDir, 'probe.asm'))).toBe(true);

    const map = JSON.parse(fs.readFileSync(path.join(buildDir, 'probe.d8.json'), 'utf-8')) as {
      files?: Record<string, unknown>;
      fileList?: string[];
    };
    const keys = Object.keys(map.files ?? {});
    expect(keys.some((key) => key.endsWith('probe.glim'))).toBe(true);
    expect(keys).toContain('probe.asm');
  });

  it('reports a contract violation at the .glim line', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd80-glim-err-'));
    const entry = path.join(dir, 'bad.glim');
    fs.writeFileSync(
      entry,
      [
        'program Bad',
        'platform tec1g-mon3',
        'display matrix8x8',
        'state X : byte',
        'pulse Go',
        'bind key KEY_1 rising -> Go',
        'effect Clobber',
        '    on Go',
        '    updates X',
        'begin',
        '    ld b,5',
        '    ld c,ApiRandom',
        '    rst $10',
        '    ld a,b',
        '    ld (X),a',
        'end',
      ].join('\n')
    );

    const backend = new GlimmerBackend();
    const result = await backend.assemble({
      asmPath: entry,
      hexPath: path.join(dir, 'build', 'bad.hex'),
    });

    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.diagnostic?.path).toBe(entry);
      expect(result.diagnostic?.line).toBeGreaterThanOrEqual(11);
      expect(result.diagnostic?.line).toBeLessThanOrEqual(15);
      expect(result.diagnostic?.sourceLine).toBeDefined();
    }
  });
});
