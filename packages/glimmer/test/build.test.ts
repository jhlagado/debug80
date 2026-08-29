import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { D8Map } from '../src/build.js';

function copyExample(dir: string, name: string): string {
  const target = path.join(dir, name);
  writeFileSync(target, readFileSync(path.join(import.meta.dirname, '../examples', name)));
  return target;
}

function readMap(dir: string, name: string): D8Map {
  return JSON.parse(readFileSync(path.join(dir, name), 'utf8')) as D8Map;
}

function segmentsOf(map: D8Map, file: string): Array<{ line?: number; start?: number }> {
  return (map.files?.[file]?.segments ?? []) as Array<{ line?: number; start?: number }>;
}

describe('glimmer build (d8 map rewrite)', () => {
  it('attributes block-body segments to the .glim source', async () => {
    const { main } = await import('../src/cli.js');
    const dir = mkdtempSync(path.join(os.tmpdir(), 'glimmer-build-'));
    const entry = copyExample(dir, 'dot.glim');

    const status = await main(['build', entry]);
    expect(status).toBe(0);

    const map = readMap(dir, 'dot.main.d8.json');
    expect(map.fileList).toContain('dot.glim');
    expect(map.fileList).toContain('dot.main.asm');

    const glimSegments = segmentsOf(map, 'dot.glim');
    expect(glimSegments.length).toBeGreaterThan(0);

    // Every Glimmer-attributed segment points to a real body line. The Atom
    // projection may rename labels to satisfy Atom's eight-character limit,
    // so source-map attribution—not repeated source text—is the contract.
    const glimSource = readFileSync(entry, 'utf8').split('\n');
    for (const segment of glimSegments) {
      const text = glimSource[(segment.line ?? 0) - 1] ?? '';
      expect(segment.start).toBeTypeOf('number');
      expect(text.trim()).not.toBe('');
    }

    // Generated glue stays on the generated asm.
    expect(segmentsOf(map, 'dot.main.asm').length).toBeGreaterThan(0);
  });

  it('attributes part-declared blocks to the part file', async () => {
    const { main } = await import('../src/cli.js');
    const dir = mkdtempSync(path.join(os.tmpdir(), 'glimmer-build-snake-'));
    const entry = copyExample(dir, 'snake.glim');
    copyExample(dir, 'snake-rules.glim');
    copyExample(dir, 'snake-lib.asm');

    const status = await main(['build', entry]);
    expect(status).toBe(0);

    const map = readMap(dir, 'snake.main.d8.json');
    expect(map.fileList).toContain('snake-rules.glim');

    // All snake blocks live in the part; the imported hand-written
    // library keeps its own attribution untouched.
    expect(segmentsOf(map, 'snake-rules.glim').length).toBeGreaterThan(0);
    expect(segmentsOf(map, 'snake-lib.asm').length).toBeGreaterThan(0);

    const rulesSource = readFileSync(path.join(dir, 'snake-rules.glim'), 'utf8').split('\n');
    const segment = segmentsOf(map, 'snake-rules.glim')[0]!;
    expect((rulesSource[(segment.line ?? 0) - 1] ?? '').trim()).not.toBe('');
  });

  it('rejects --no-check with build', async () => {
    const { main } = await import('../src/cli.js');
    const dir = mkdtempSync(path.join(os.tmpdir(), 'glimmer-build-nocheck-'));
    const entry = copyExample(dir, 'dot.glim');
    expect(await main(['build', '--no-check', entry])).toBe(1);
  });
});

describe('computeBlockMappings', () => {
  it('maps every body line at its exact generated-asm line', async () => {
    const { computeBlockMappings } = await import('../src/build.js');
    const body = ['    ld a,1', '    call Helper', '    ld (X),a', '_done:', '    nop'];
    const asm = [
      '; header',
      '.routine',
      'Glim_E:',
      '    ld a,1',
      '    call Helper',
      '    ld (X),a',
      '_done:',
      '    nop',
      '        ret',
    ].join(String.fromCharCode(10));
    const { mappings, warnings } = computeBlockMappings(
      asm,
      [{ label: 'Glim_E', name: 'E', body, bodyLine: 10 }],
      'prog.glim',
    );
    expect(warnings).toEqual([]);
    expect(mappings.map((m) => [m.asmLine, m.glimLine])).toEqual([
      [4, 10],
      [5, 11],
      [6, 12],
      [7, 13],
      [8, 14],
    ]);
  });
});

describe('buildGlimmerProgram (programmatic API)', () => {
  it('builds in process and returns artifact paths, no printing needed', async () => {
    const { buildGlimmerProgram } = await import('../src/build.js');
    const dir = mkdtempSync(path.join(os.tmpdir(), 'glimmer-api-'));
    const entry = copyExample(dir, 'dot.glim');

    const result = await buildGlimmerProgram(entry);
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.artifacts).toBeDefined();
    expect(result.artifacts!.asm).toBe(path.join(dir, 'dot.main.asm'));
    expect(result.artifacts!.hex).toBe(path.join(dir, 'dot.main.hex'));
    expect(result.artifacts!.bin).toBe(path.join(dir, 'dot.main.bin'));
    expect(result.artifacts!.d8).toBe(path.join(dir, 'dot.main.d8.json'));
    expect(result.mappedSegments).toBeGreaterThan(0);

    // The default artifact is Atom source. Contract metadata remains in the
    // separately checked compatibility projection rather than leaking here.
    const asm = readFileSync(result.artifacts!.asm, 'utf8');
    expect(asm).toMatch(/^\s*ORG\s+\$4000/m);
    expect(asm).not.toMatch(/^\s*\.contracts\b/im);
    expect(asm).not.toMatch(/^\s*\.routine\b/im);
    expect(asm).not.toContain(';!');
    const map = readMap(dir, 'dot.main.d8.json');
    expect(map.fileList).toContain('dot.glim');
    expect(map).toMatchObject({ generator: { name: 'atom' } });
  });

  it('uses the shared assembler-flavour aliases on the programmatic API', async () => {
    const { buildGlimmerProgram } = await import('../src/build.js');
    const dir = mkdtempSync(path.join(os.tmpdir(), 'glimmer-api-assembler-alias-'));
    const entry = copyExample(dir, 'dot.glim');

    const atomAlias = await buildGlimmerProgram(entry, {
      assembler: 'ATOM-Z80',
      outputPath: path.join(dir, 'dot.atom-alias.asm'),
    });
    expect(atomAlias.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual(
      [],
    );
    expect(readMap(dir, 'dot.atom-alias.d8.json')).toMatchObject({
      generator: { name: 'atom' },
    });

    const azmAlias = await buildGlimmerProgram(entry, {
      assembler: 'ASM80',
      outputPath: path.join(dir, 'dot.azm-alias.asm'),
    });
    expect(azmAlias.diagnostics.filter((diagnostic) => diagnostic.severity === 'error')).toEqual(
      [],
    );
    expect(readMap(dir, 'dot.azm-alias.d8.json')).toMatchObject({
      generator: { name: 'azm' },
    });
  }, 90_000);

  it('stops at generation for stage generate', async () => {
    const { buildGlimmerProgram } = await import('../src/build.js');
    const dir = mkdtempSync(path.join(os.tmpdir(), 'glimmer-api-gen-'));
    const entry = copyExample(dir, 'dot.glim');

    const result = await buildGlimmerProgram(entry, { stage: 'generate' });
    expect(result.artifacts).toEqual({ asm: path.join(dir, 'dot.main.asm') });
    // No assembler ran: only the default Atom source projection exists.
    const asm = readFileSync(path.join(dir, 'dot.main.asm'), 'utf8');
    expect(asm).toMatch(/^\s*ORG\s+\$4000/m);
    expect(asm).not.toMatch(/^\s*\.routine\b/im);
    expect(existsSync(path.join(dir, 'dot.main.hex'))).toBe(false);
    expect(existsSync(path.join(dir, 'dot.main.d8.json'))).toBe(false);
  });

  it('reports contract violations at the .glim line that caused them', async () => {
    const { buildGlimmerProgram } = await import('../src/build.js');
    const dir = mkdtempSync(path.join(os.tmpdir(), 'glimmer-diag-glim-'));
    const entry = path.join(dir, 'clobber.glim');
    // B is destroyed by _random; reading it after the RST is the classic
    // register-collision bug the contract check exists to catch.
    writeFileSync(
      entry,
      [
        'program Clobber',
        'platform tec1g-mon3',
        'display matrix8x8',
        'state X : byte',
        'pulse Go',
        'bind key KEY_1 rising -> Go',
        'effect Bad',
        '    on Go',
        '    updates X',
        'begin',
        '    ld b,5',
        '    ld c,ApiRandom',
        '    rst $10',
        '    ld a,b',
        '    ld (X),a',
        'end',
      ].join('\n'),
    );

    const result = await buildGlimmerProgram(entry);
    const errors = result.diagnostics.filter((d) => d.severity === 'error');
    expect(errors.length).toBeGreaterThan(0);
    const mapped = errors.find((d) => d.sourceName.endsWith('.glim'));
    expect(mapped).toBeDefined();
    // The body spans clobber.glim lines 11..15.
    expect(mapped!.sourceName).toBe(entry);
    expect(mapped!.line).toBeGreaterThanOrEqual(11);
    expect(mapped!.line).toBeLessThanOrEqual(15);
  });

  it('checks imported units at build stage, same strength as check', async () => {
    // Regression: the single-pass build must still contract-check
    // imported libraries (files without their own .contracts directive).
    // Stripping a .routine declaration makes every call to that routine
    // unprovable — both stages must report it.
    const { buildGlimmerProgram } = await import('../src/build.js');
    const dir = mkdtempSync(path.join(os.tmpdir(), 'glimmer-libcheck-'));
    const entry = copyExample(dir, 'snake.glim');
    copyExample(dir, 'snake-rules.glim');
    const lib = copyExample(dir, 'snake-lib.asm');
    const stripped = readFileSync(lib, 'utf8').replace(/\.routine[^\n]*\n(@BodyContains:)/, '$1');
    expect(stripped).not.toBe(readFileSync(lib, 'utf8'));
    writeFileSync(lib, stripped);

    for (const stage of ['check', 'build'] as const) {
      const result = await buildGlimmerProgram(entry, { stage });
      const errors = result.diagnostics.filter((d) => d.severity === 'error');
      expect(errors.length, `stage ${stage}`).toBeGreaterThan(0);
    }
  });

  it('reports parse failures as AZM-shaped diagnostics', async () => {
    const { buildGlimmerProgram } = await import('../src/build.js');
    const dir = mkdtempSync(path.join(os.tmpdir(), 'glimmer-api-diag-'));
    const entry = path.join(dir, 'bad.glim');
    writeFileSync(entry, 'program Bad\nstate X : nonsense\n');

    const result = await buildGlimmerProgram(entry);
    expect(result.artifacts).toBeUndefined();
    expect(result.diagnostics.length).toBeGreaterThan(0);
    const diagnostic = result.diagnostics[0]!;
    expect(diagnostic.severity).toBe('error');
    expect(path.isAbsolute(diagnostic.sourceName)).toBe(true);
    expect(diagnostic.line).toBeGreaterThan(0);
  });

  it('preserves parser warnings through the programmatic build API', async () => {
    const { buildGlimmerProgram } = await import('../src/build.js');
    const dir = mkdtempSync(path.join(os.tmpdir(), 'glimmer-api-warning-'));
    const entry = path.join(dir, 'warning.glim');
    writeFileSync(
      entry,
      [
        'program Warning',
        'state Score : byte',
        'pulse Fire',
        'effect Add',
        'on Fire',
        'updates Score',
        'begin',
        '    inc (Score)',
        'end',
        'effect Reset',
        'on Fire',
        'updates Score',
        'begin',
        '    ld (Score),a',
        'end',
      ].join('\n'),
    );

    const result = await buildGlimmerProgram(entry, { stage: 'generate' });
    expect(result.artifacts?.asm).toBeDefined();
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        sourceName: entry,
        message: expect.stringContaining('Potential same-frame write overlap'),
      }),
    );

    const overflowEntry = path.join(dir, 'overflow.glim');
    const overflowStates = [
      'state Score : byte',
      ...Array.from({ length: 32 }, (_, index) => `state S${index} : byte`),
    ].join('\n');
    writeFileSync(
      overflowEntry,
      readFileSync(entry, 'utf8').replace('state Score : byte', overflowStates),
    );
    const failed = await buildGlimmerProgram(overflowEntry, { stage: 'generate' });
    expect(failed.artifacts).toBeUndefined();
    expect(failed.diagnostics.map((diagnostic) => diagnostic.message).join('\n')).toContain(
      'Potential same-frame write overlap',
    );
    expect(failed.diagnostics.map((diagnostic) => diagnostic.message).join('\n')).toContain(
      'Change flags are full',
    );
  });
});
