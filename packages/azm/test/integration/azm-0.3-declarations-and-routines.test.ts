import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  analyzeProgramNext,
  compile,
  compileNext,
  defaultFormatWriters,
  loadProgramNext,
  type CompileNextFunctionOptions,
  type CompileResult,
} from '../../src/index.js';
import type {
  RegisterContractsAnnotationsArtifact,
  RegisterContractsReportArtifact,
} from '../../src/outputs/types.js';

const noEmitOptions = {
  emitBin: false,
  emitHex: false,
  emitD8m: false,
} satisfies CompileNextFunctionOptions;

async function withTempDir<T>(prefix: string, callback: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  try {
    return await callback(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function compileFixture(
  entry: string,
  source: string,
  options: CompileNextFunctionOptions = {},
): Promise<CompileResult> {
  await writeFile(entry, source, 'utf8');
  return compile(entry, { ...noEmitOptions, ...options }, { formats: defaultFormatWriters });
}

function reportArtifact(result: CompileResult): RegisterContractsReportArtifact | undefined {
  return result.artifacts.find(
    (artifact): artifact is RegisterContractsReportArtifact =>
      artifact.kind === 'register-contracts-report',
  );
}

function annotationsArtifact(
  result: CompileResult,
): RegisterContractsAnnotationsArtifact | undefined {
  return result.artifacts.find(
    (artifact): artifact is RegisterContractsAnnotationsArtifact =>
      artifact.kind === 'register-contracts-annotations',
  );
}

function errorDiagnostics<T extends { severity: string }>(result: {
  diagnostics: readonly T[];
}): T[] {
  return result.diagnostics.filter((diagnostic) => diagnostic.severity === 'error');
}

describe('AZM 0.3 declarations and routines', () => {
  it('binds a one-line .routine contract to the next non-local label', async () => {
    await withTempDir('azm-03-routine-contract-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const source = [
        '.routine in A,HL out carry maybe-out zero clobbers B preserves DE',
        '; The directive may be separated from its label by comments and blank lines.',
        '',
        '@CheckTile:',
        '    ret',
        '.end',
        '',
      ].join('\n');
      await writeFile(entry, source, 'utf8');

      const loaded = await loadProgramNext({ entryFile: entry });
      expect(errorDiagnostics(loaded)).toEqual([]);
      expect(loaded.loadedProgram?.program.files[0].items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'routine',
            contract: {
              in: ['A', 'H', 'L'],
              out: ['carry'],
              maybeOut: ['zero'],
              clobbers: ['B'],
              preserves: ['D', 'E'],
            },
          }),
          expect.objectContaining({
            kind: 'label',
            name: 'CheckTile',
            isExported: true,
          }),
        ]),
      );

      const compiled = await compile(
        entry,
        {
          ...noEmitOptions,
          registerContracts: 'audit',
          emitRegisterReport: true,
          registerContractsReportFormat: 'json',
        },
        { formats: defaultFormatWriters },
      );
      expect(errorDiagnostics(compiled)).toEqual([]);
      expect(reportArtifact(compiled)?.json?.summaries.map((summary) => summary.name)).toEqual([
        'CheckTile',
      ]);
    });
  });

  it('accepts a bare .routine and lets the next normal label close it', async () => {
    await withTempDir('azm-03-bare-routine-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const result = await compileFixture(
        entry,
        [
          '.routine',
          'Worker:',
          '    ld a,1',
          '    ret',
          'OrdinaryCode:',
          '    ld hl,$1234',
          '    ret',
          '.end',
          '',
        ].join('\n'),
        {
          registerContracts: 'audit',
          emitRegisterReport: true,
          registerContractsReportFormat: 'json',
        },
      );

      expect(errorDiagnostics(result)).toEqual([]);
      const summaries = reportArtifact(result)?.json?.summaries;
      expect(summaries?.map((summary) => summary.name)).toEqual(['Worker']);
      expect(summaries?.[0]?.valueRelations).toEqual([]);
      expect(summaries?.[0]?.mayWrite).toEqual(expect.arrayContaining(['A']));
      expect(summaries?.[0]?.mayOutput).toEqual(expect.arrayContaining(['A']));
      expect(summaries?.[0]?.mayWrite).not.toEqual(expect.arrayContaining(['H', 'L']));
    });
  });

  it('qualifies underscore locals by their owner and permits reuse', () => {
    const result = compileNext(`
        .org $0100
First:
_loop:
        djnz _loop
Second:
_loop:
        djnz _loop
`);

    expect(result.diagnostics).toEqual([]);
    expect(Array.from(result.bytes)).toEqual([0x10, 0xfe, 0x10, 0xfe]);
    expect(result.symbols).toMatchObject({
      First: 0x0100,
      'First._loop': 0x0100,
      Second: 0x0102,
      'Second._loop': 0x0102,
    });
    expect(result.symbols._loop).toBeUndefined();
  });

  it('rejects a local declaration before any non-local owner', () => {
    const result = compileNext(`
_orphan:
        nop
Owner:
        ret
`);

    expect(errorDiagnostics(result)).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringMatching(/_orphan.*(?:non-local|owner)/i),
      }),
    ]);
  });

  it('treats @ labels as exports without creating routines', async () => {
    await withTempDir('azm-03-exported-labels-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const result = await compileFixture(
        entry,
        ['@PublicData:', '    .db 1', '@CallableLooking:', '    ret', '.end', ''].join('\n'),
        {
          registerContracts: 'audit',
          emitRegisterReport: true,
          registerContractsReportFormat: 'json',
        },
      );

      expect(errorDiagnostics(result)).toEqual([]);
      expect(reportArtifact(result)?.json?.summaries).toEqual([]);
    });
  });

  it('rejects declarations that combine export and local prefixes', () => {
    const result = compileNext(`
Owner:
@_hidden:
        ret
`);

    expect(errorDiagnostics(result)).toEqual([
      expect.objectContaining({
        severity: 'error',
        message: expect.stringMatching(/@_hidden.*(?:invalid|export|local)/i),
      }),
    ]);
  });

  it('keeps plain imported labels private while exposing @ labels', async () => {
    await withTempDir('azm-03-import-label-visibility-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const module = join(dir, 'lib.asm');
      await writeFile(
        entry,
        ['.import "lib.asm"', 'Main:', '    .dw Public', '    .dw Private', ''].join('\n'),
        'utf8',
      );
      await writeFile(
        module,
        ['Private:', '    nop', '@Public:', '    ret', ''].join('\n'),
        'utf8',
      );

      const loaded = await loadProgramNext({ entryFile: entry });
      expect(errorDiagnostics(loaded)).toEqual([]);
      const analysis = analyzeProgramNext(loaded.loadedProgram!);

      expect(errorDiagnostics(analysis)).toEqual([
        expect.objectContaining({
          severity: 'error',
          sourceName: entry,
          message: expect.stringMatching(/Private.*private.*lib\.asm/i),
        }),
      ]);
    });
  });

  it('exports imported equates and enum declarations as units', async () => {
    await withTempDir('azm-03-import-declaration-visibility-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const module = join(dir, 'constants.asm');
      await writeFile(
        entry,
        ['.import "constants.asm"', 'Main:', '    .db PORT,Colour.Red,Colour.Green', ''].join('\n'),
        'utf8',
      );
      await writeFile(
        module,
        ['@PORT .equ $84', '@Colour .enum Red, Green', ''].join('\n'),
        'utf8',
      );

      const loaded = await loadProgramNext({ entryFile: entry });
      expect(errorDiagnostics(loaded)).toEqual([]);
      const analysis = analyzeProgramNext(loaded.loadedProgram!);
      expect(errorDiagnostics(analysis)).toEqual([]);
      expect(analysis.env.symbols).toMatchObject({
        PORT: 0x84,
        'Colour.Red': 0,
        'Colour.Green': 1,
      });
    });
  });

  it('keeps unexported imported declarations private', async () => {
    await withTempDir('azm-03-private-import-declaration-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const module = join(dir, 'constants.asm');
      await writeFile(
        entry,
        ['.import "constants.asm"', 'Main:', '    .db PRIVATE_PORT', ''].join('\n'),
      );
      await writeFile(module, ['PRIVATE_PORT .equ $84', ''].join('\n'));

      const loaded = await loadProgramNext({ entryFile: entry });
      expect(errorDiagnostics(loaded)).toEqual([]);
      const analysis = analyzeProgramNext(loaded.loadedProgram!);
      expect(errorDiagnostics(analysis)).toEqual([
        expect.objectContaining({
          sourceName: entry,
          message: expect.stringMatching(/PRIVATE_PORT.*private.*constants\.asm/i),
        }),
      ]);
    });
  });

  it('enforces imported type visibility in sizeof, offset, and layout casts', async () => {
    await withTempDir('azm-03-private-import-type-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const module = join(dir, 'layouts.asm');
      await writeFile(
        entry,
        [
          '.import "layouts.asm"',
          '.org $4000',
          'BASE .equ $4100',
          'Main:',
          '    .db sizeof(PublicRecord),offset(PublicRecord,value)',
          '    .db sizeof(PrivateRecord),sizeof(PrivateRecord[2]),offset(PrivateRecord,value)',
          '    ld a,(<PrivateRecord>BASE.value)',
          '.end',
          '',
        ].join('\n'),
      );
      await writeFile(
        module,
        [
          'PrivateRecord .type',
          'value .byte',
          '.endtype',
          '@PublicRecord .type',
          'value .byte',
          '.endtype',
          '',
        ].join('\n'),
      );

      const loaded = await loadProgramNext({ entryFile: entry });
      expect(errorDiagnostics(loaded)).toEqual([]);
      const analysis = analyzeProgramNext(loaded.loadedProgram!);
      expect(
        errorDiagnostics(analysis).filter((diagnostic) =>
          diagnostic.message.includes('PrivateRecord'),
        ),
      ).toHaveLength(4);
      expect(
        errorDiagnostics(analysis).some((diagnostic) =>
          diagnostic.message.includes('PublicRecord'),
        ),
      ).toBe(false);
    });
  });

  it('rejects leading underscore syntax on non-label declarations and ops', async () => {
    await withTempDir('azm-03-underscore-declarations-', async (dir) => {
      const equResult = compileNext('_VALUE .equ 1\nOwner:\n_local:\n    ret\n');
      expect(errorDiagnostics(equResult)).toEqual([
        expect.objectContaining({ message: expect.stringMatching(/only for labels.*_VALUE/) }),
      ]);

      const entry = join(dir, 'main.asm');
      await writeFile(
        entry,
        ['op _helper()', 'end', 'Owner:', '_local:', '    ret', ''].join('\n'),
      );

      const loaded = await loadProgramNext({ entryFile: entry });
      expect(errorDiagnostics(loaded)).toEqual([
        expect.objectContaining({ message: expect.stringMatching(/only for labels.*_helper/) }),
      ]);
    });
  });

  it('requires imported ops to be exported', async () => {
    await withTempDir('azm-03-private-import-op-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const module = join(dir, 'ops.asm');
      await writeFile(entry, ['.import "ops.asm"', 'Main:', '    clearA', ''].join('\n'));
      await writeFile(module, ['op clearA()', '    xor a', 'end', ''].join('\n'));

      const loaded = await loadProgramNext({ entryFile: entry });
      expect(errorDiagnostics(loaded)).toEqual([
        expect.objectContaining({
          sourceName: entry,
          message: 'op "clearA" is private to another source unit',
        }),
      ]);
    });
  });

  it('lets exported ops use private helpers from their own source unit', async () => {
    await withTempDir('azm-03-exported-op-private-helper-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const moduleA = join(dir, 'a.asm');
      const moduleB = join(dir, 'b.asm');
      await writeFile(
        entry,
        [
          '.import "a.asm"',
          '.import "b.asm"',
          '.org $4000',
          'Main:',
          '    fromA',
          '    fromB',
          '',
        ].join('\n'),
      );
      await writeFile(
        moduleA,
        ['op helper()', '    xor a', 'end', 'op @fromA()', '    helper', 'end', ''].join('\n'),
      );
      await writeFile(
        moduleB,
        ['op helper()', '    inc a', 'end', 'op @fromB()', '    helper', 'end', ''].join('\n'),
      );

      const result = await compile(entry, {}, { formats: defaultFormatWriters });
      expect(errorDiagnostics(result)).toEqual([]);
      const bin = result.artifacts.find((artifact) => artifact.kind === 'bin');
      expect(bin?.kind === 'bin' ? [...bin.bytes] : []).toEqual([0xaf, 0x3c]);
    });
  });

  it('rejects contradictory and reserved op declaration names', async () => {
    await withTempDir('azm-03-invalid-op-names-', async (dir) => {
      const entry = join(dir, 'main.asm');
      await writeFile(entry, ['op @_private()', 'end', 'op __reserved()', 'end', ''].join('\n'));

      const loaded = await loadProgramNext({ entryFile: entry });
      expect(errorDiagnostics(loaded)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ message: expect.stringContaining('cannot use the local "_"') }),
          expect.objectContaining({ message: expect.stringContaining('reserved "__"') }),
        ]),
      );
    });
  });

  it('diagnoses retired semantic comments and trailing named outputs', async () => {
    await withTempDir('azm-03-legacy-contract-diagnostics-', async (dir) => {
      const entry = join(dir, 'main.asm');
      await writeFile(
        entry,
        [
          ';! out A',
          '.routine out {A,carry} scanKeys',
          'Helper:',
          '    ret',
          '; expects out A',
          '.end',
          '',
        ].join('\n'),
      );

      const loaded = await loadProgramNext({ entryFile: entry });
      expect(errorDiagnostics(loaded)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ message: expect.stringContaining('legacy ;!') }),
          expect.objectContaining({ message: expect.stringContaining('invalid .routine out') }),
          expect.objectContaining({ message: expect.stringContaining('legacy ; expects out') }),
        ]),
      );
    });
  });

  it('leaves unrelated bang comments as ordinary comments', async () => {
    await withTempDir('azm-03-bang-comment-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const result = await compileFixture(
        entry,
        [';!important implementation note', '.org $4000', 'Main:', '    RET', '.end', ''].join(
          '\n',
        ),
      );

      expect(errorDiagnostics(result)).toEqual([]);
    });
  });

  it('honours source strict policy even when the compile option is off', async () => {
    await withTempDir('azm-03-source-policy-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const result = await compileFixture(
        entry,
        [
          '.contracts strict',
          '.org $4000',
          'Start:',
          '    call MissingContract',
          '    ret',
          '.end',
          '',
        ].join('\n'),
      );

      expect(errorDiagnostics(result)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ message: expect.stringContaining('MissingContract') }),
        ]),
      );
      expect(result.artifacts).toEqual([]);
    });
  });

  it('filters off-file findings and summaries from policy-controlled reports', async () => {
    await withTempDir('azm-03-policy-report-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const module = join(dir, 'legacy.asm');
      await writeFile(
        entry,
        [
          '.contracts strict',
          '.import "legacy.asm"',
          '.routine',
          'Start:',
          '    ret',
          '.end',
          '',
        ].join('\n'),
      );
      await writeFile(
        module,
        [
          '.contracts off',
          '.routine',
          '@Legacy:',
          '    call LegacyHelper',
          '    ld c,a',
          '    ret',
          '.routine',
          'LegacyHelper:',
          '    ld a,1',
          '    ret',
          '',
        ].join('\n'),
      );

      const result = await compileFixture(entry, await readFile(entry, 'utf8'), {
        registerContracts: 'off',
        emitRegisterReport: true,
        registerContractsReportFormat: 'json',
      });
      expect(errorDiagnostics(result)).toEqual([]);
      const report = reportArtifact(result)?.json;
      expect(report?.mode).toBe('off');
      expect(report?.filePolicies).toMatchObject({ [entry]: 'strict', [module]: 'off' });
      expect(report?.summaries.map((summary) => summary.name)).toContain('Start');
      expect(report?.summaries.map((summary) => summary.name)).not.toContain('Legacy');
      expect(report?.findings).toEqual([]);
      expect(report?.unknownCalls).toEqual([]);

      const baseline = join(dir, 'baseline.json');
      await writeFile(
        baseline,
        JSON.stringify({
          format: 'azm-register-contracts-report',
          version: 1,
          entryFile: entry,
          mode: 'strict',
          summaries: [],
          findings: [
            {
              kind: 'missing_callee_contract',
              location: { file: module, line: 4, column: 5 },
              message: 'legacy baseline finding',
              callTarget: 'MissingLegacy',
              subject: 'CALL MissingLegacy',
              remediation: { category: 'add_contract', hint: 'legacy' },
            },
          ],
          unknownCalls: ['MissingLegacy'],
        }),
      );
      const ratcheted = await compile(
        entry,
        {
          ...noEmitOptions,
          registerContracts: 'off',
          emitRegisterReport: true,
          registerContractsReportFormat: 'json',
          registerContractsBaseline: baseline,
          registerContractsRatchet: true,
        },
        { formats: defaultFormatWriters },
      );
      expect(errorDiagnostics(ratcheted)).toEqual([]);
      expect(reportArtifact(ratcheted)?.json?.ratchet).toMatchObject({
        newFindings: [],
        removedFindings: [],
        changedFindings: [],
      });
    });
  });

  it('lets project policy override source policy in reports and ratchets', async () => {
    await withTempDir('azm-03-policy-override-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const source = [
        '.contracts strict',
        '.routine',
        'Start:',
        '    call Helper',
        '    ld c,a',
        '    ret',
        '.routine',
        'Helper:',
        '    ld a,1',
        '    ret',
        '.end',
        '',
      ].join('\n');
      const result = await compileFixture(entry, source, {
        registerContracts: 'off',
        registerContractsPolicy: { off: [entry] },
        emitRegisterReport: true,
        registerContractsReportFormat: 'json',
      });

      expect(errorDiagnostics(result)).toEqual([]);
      expect(reportArtifact(result)?.json?.filePolicies).toMatchObject({ [entry]: 'off' });
      expect(reportArtifact(result)?.json?.summaries).toEqual([]);
      expect(reportArtifact(result)?.json?.findings).toEqual([]);
    });
  });

  it('uses public identities when analyzed callers reference off-file routines', async () => {
    await withTempDir('azm-03-off-target-identity-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const module = join(dir, 'legacy.asm');
      await writeFile(
        entry,
        [
          '.contracts strict',
          '.import "legacy.asm"',
          '.routine',
          'Start:',
          '    call LegacyValue',
          '    ld d,a',
          '    ret',
          '.end',
          '',
        ].join('\n'),
      );
      await writeFile(
        module,
        ['.contracts off', '.routine out A', '@LegacyValue:', '    ld a,1', '    ret', ''].join(
          '\n',
        ),
      );

      const result = await compile(
        entry,
        {
          ...noEmitOptions,
          registerContracts: 'off',
          emitRegisterReport: true,
          registerContractsReportFormat: 'json',
        },
        { formats: defaultFormatWriters },
      );
      expect(errorDiagnostics(result)).toEqual([]);
      const candidate = reportArtifact(result)?.json?.findings.find(
        (finding) => finding.kind === 'unacknowledged_output',
      );
      expect(candidate?.routineIdentity).toContain('routine:legacy.asm:');
      expect(candidate?.routineIdentity).not.toContain(dir);
      expect(candidate?.routineIdentity).not.toContain('\0');
    });
  });

  it('emits a useful register interface without an explicit analysis mode', async () => {
    await withTempDir('azm-03-interface-fallback-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const result = await compileFixture(
        entry,
        ['.routine out A', 'ReadValue:', '    ld a,1', '    ret', '.end', ''].join('\n'),
        { emitRegisterInterface: true },
      );

      expect(errorDiagnostics(result)).toEqual([]);
      const artifact = result.artifacts.find(
        (candidate) => candidate.kind === 'register-contracts-interface',
      );
      expect(artifact?.kind === 'register-contracts-interface' ? artifact.text : '').toContain(
        'extern ReadValue',
      );
    });
  });

  it('attaches expectout and rcignore to imported op-expanded call sites', async () => {
    await withTempDir('azm-03-op-directive-attachment-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const ops = join(dir, 'ops.asm');
      await writeFile(
        entry,
        [
          '.contracts audit',
          '.import "ops.asm"',
          '.routine',
          'Start:',
          '.expectout A',
          '    callKnown',
          '    ld d,a',
          '.rcignore unacknowledged_output "reviewed op output"',
          '    callKnownAgain',
          '    ld e,a',
          '    ret',
          '.routine out A',
          'Known:',
          '    ld a,1',
          '    ret',
          '.end',
          '',
        ].join('\n'),
      );
      await writeFile(
        ops,
        [
          'op @callKnown()',
          '    call Known',
          'end',
          'op @callKnownAgain()',
          '    call Known',
          'end',
          '',
        ].join('\n'),
      );

      const result = await compile(
        entry,
        {
          ...noEmitOptions,
          registerContracts: 'off',
          emitRegisterReport: true,
          registerContractsReportFormat: 'json',
        },
        { formats: defaultFormatWriters },
      );
      expect(errorDiagnostics(result)).toEqual([]);
      expect(result.diagnostics.map((diagnostic) => diagnostic.message).join('\n')).not.toMatch(
        /stale|must be followed/,
      );
      expect(reportArtifact(result)?.json?.suppressedFindings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            finding: expect.objectContaining({ kind: 'unacknowledged_output' }),
          }),
        ]),
      );
    });
  });

  it('keeps equates and ops case-sensitive while Z80 mnemonics remain case-insensitive', async () => {
    await withTempDir('azm-03-case-sensitive-symbols-', async (dir) => {
      const entry = join(dir, 'main.asm');
      await writeFile(
        entry,
        [
          'Value .equ 1',
          'op setValue()',
          '    LD A,Value',
          'end',
          '.org $4000',
          'Main:',
          '    setValue',
          '    RET',
          '.end',
          '',
        ].join('\n'),
      );
      const valid = await compile(entry, {}, { formats: defaultFormatWriters });
      expect(errorDiagnostics(valid)).toEqual([]);

      await writeFile(
        entry,
        [
          'Value .equ 1',
          'op setValue()',
          '    ld a,Value',
          'end',
          '.org $4000',
          'Main:',
          '    setvalue',
          '    .db value',
          '.end',
          '',
        ].join('\n'),
      );
      const invalid = await compile(entry, {}, { formats: defaultFormatWriters });
      expect(invalid.diagnostics.map((diagnostic) => diagnostic.message).join('\n')).toMatch(
        /setvalue|value/,
      );
    });
  });

  it('reports an unconsumed .rcignore as stale', async () => {
    await withTempDir('azm-03-stale-rcignore-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const result = await compileFixture(
        entry,
        [
          '.routine',
          'Start:',
          '.rcignore output_candidate "candidate already resolved"',
          '    call Helper',
          '    ret',
          '.routine',
          'Helper:',
          '    ret',
          '.end',
          '',
        ].join('\n'),
        { registerContracts: 'audit' },
      );

      expect(result.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: 'warning',
            sourceName: entry,
            message: expect.stringContaining('stale .rcignore'),
          }),
        ]),
      );
    });
  });

  it('keeps same-named private routines distinct across imported units', async () => {
    await withTempDir('azm-03-private-routine-identity-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const moduleA = join(dir, 'a.asm');
      const moduleB = join(dir, 'b.asm');
      await writeFile(
        entry,
        [
          '.import "a.asm"',
          '.import "b.asm"',
          '.routine',
          'Start:',
          '    call WrapperA',
          '    call WrapperB',
          '    ret',
          '.end',
          '',
        ].join('\n'),
      );
      await writeFile(
        moduleA,
        [
          '.routine',
          'Helper:',
          '    ld de,$1000',
          '    ret',
          '.routine',
          '@WrapperA:',
          '    call Helper',
          '    ret',
          '',
        ].join('\n'),
      );
      await writeFile(
        moduleB,
        [
          '.routine',
          'Helper:',
          '    ld hl,$2000',
          '    ret',
          '.routine',
          '@WrapperB:',
          '    call Helper',
          '    ret',
          '',
        ].join('\n'),
      );

      const result = await compile(
        entry,
        {
          ...noEmitOptions,
          registerContracts: 'audit',
          emitRegisterReport: true,
          registerContractsReportFormat: 'json',
          emitRegisterInference: true,
        },
        { formats: defaultFormatWriters },
      );
      expect(errorDiagnostics(result)).toEqual([]);
      const summaries = reportArtifact(result)?.json?.summaries ?? [];
      const wrapperAWrites =
        summaries.find((summary) => summary.name === 'WrapperA')?.mayWrite ?? [];
      const wrapperBWrites =
        summaries.find((summary) => summary.name === 'WrapperB')?.mayWrite ?? [];
      expect(wrapperAWrites).toEqual(expect.arrayContaining(['D', 'E']));
      expect(wrapperAWrites).not.toEqual(expect.arrayContaining(['H', 'L']));
      expect(wrapperBWrites).toEqual(expect.arrayContaining(['H', 'L']));
      const helperSummaries = summaries.filter((summary) => summary.name === 'Helper');
      expect(helperSummaries).toHaveLength(2);
      expect(new Set(helperSummaries.map((summary) => summary.identity)).size).toBe(2);
      expect(JSON.stringify(helperSummaries)).not.toContain('\\u0000');
      expect(JSON.stringify(helperSummaries)).not.toContain(dir);

      const inference = result.artifacts.find(
        (artifact) => artifact.kind === 'register-contracts-inference',
      );
      if (inference?.kind !== 'register-contracts-inference') {
        throw new Error('missing register-contracts inference artifact');
      }
      expect(inference.json?.routines.filter((routine) => routine.name === 'Helper')).toHaveLength(
        2,
      );
    });
  });

  it('rewrites a .routine directive for annotations and never emits ;!', async () => {
    await withTempDir('azm-03-routine-annotations-', async (dir) => {
      const entry = join(dir, 'main.asm');
      const result = await compileFixture(
        entry,
        ['.routine', 'Helper:', '    ld hl,$1000', '    ret', '.end', ''].join('\n'),
        {
          registerContracts: 'audit',
          emitRegisterAnnotations: true,
        },
      );

      expect(errorDiagnostics(result)).toEqual([]);
      const annotated = annotationsArtifact(result)?.files.find(
        (file) => file.path === entry,
      )?.text;
      expect(annotated).toBeDefined();
      if (annotated === undefined) return;
      expect(annotated).toContain(['.routine maybe-out HL clobbers HL', 'Helper:'].join('\n'));
      expect(annotated).not.toContain(';!');
    });
  });
});
