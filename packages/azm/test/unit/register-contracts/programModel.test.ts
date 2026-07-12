import { describe, expect, it } from 'vitest';

import { loadProgram } from '../../../src/index.js';
import { instructionHead } from '../../../src/register-contracts/instruction-head.js';
import { instructionOperandCount } from '../../../src/register-contracts/instruction-operands.js';
import { buildRegisterContractsProgramModel } from '../../../src/register-contracts/programModel.js';
import { inferRoutineSummary } from '../../../src/register-contracts/summary.js';
import type { RegisterContractsProgramModel } from '../../../src/register-contracts/types.js';
import type { SourceItem } from '../../../src/model/source-item.js';
import { withTempSource } from '../../helpers/temp_source.js';
import {
  parseRegisterContractsItems,
  parseRegisterContractsItemsFromSources,
} from './parse-helpers.js';

function directCallTargets(model: RegisterContractsProgramModel): string[] {
  return [...new Set(model.directCalls.map((c) => c.target))].sort();
}

function sourceOwnedProgramItems(): SourceItem[] {
  return [
    {
      kind: 'routine',
      contract: { in: [], out: [], maybeOut: [], clobbers: [], preserves: [] },
      span: {
        sourceName: '/tmp/include.asm',
        line: 1,
        column: 1,
        sourceUnit: '/tmp/main.asm',
        sourceRelation: 'include',
        sourceUnitRelation: 'entry',
      },
    },
    {
      kind: 'label',
      name: 'START',
      span: {
        sourceName: '/tmp/include.asm',
        line: 1,
        column: 1,
        sourceUnit: '/tmp/main.asm',
        sourceRelation: 'include',
        sourceUnitRelation: 'entry',
      },
    },
    {
      kind: 'instruction',
      instruction: {
        mnemonic: 'call',
        expression: { kind: 'symbol', name: 'HELPER' },
      },
      span: {
        sourceName: '/tmp/include.asm',
        line: 2,
        column: 5,
        sourceUnit: '/tmp/main.asm',
        sourceRelation: 'include',
        sourceUnitRelation: 'entry',
      },
    },
    {
      kind: 'instruction',
      instruction: { mnemonic: 'ret' },
      span: {
        sourceName: '/tmp/include.asm',
        line: 3,
        column: 5,
        sourceUnit: '/tmp/main.asm',
        sourceRelation: 'include',
        sourceUnitRelation: 'entry',
      },
    },
  ];
}

describe('register-contracts program model', () => {
  it('collects labels, instructions, and direct call targets', () => {
    const items = parseRegisterContractsItems(
      '/tmp/main.z80',
      [
        '.routine',
        'START:',
        '    call HELPER',
        '    ret',
        '.routine',
        'HELPER:',
        '    ld a,1',
        '    ret',
        '.end',
      ].join('\n'),
    );

    const model = buildRegisterContractsProgramModel(items);

    expect(directCallTargets(model)).toEqual(['HELPER']);
    expect(model.routines.map((r) => r.name)).toEqual(['START', 'HELPER']);
    expect(
      model.routines.find((r) => r.name === 'HELPER')?.instructions.map(instructionHead),
    ).toEqual(['ld', 'ret']);
  });

  it('preserves source ownership metadata on instructions, routine spans, and direct calls', () => {
    const model = buildRegisterContractsProgramModel(sourceOwnedProgramItems());

    const routine = model.routines[0];
    const instruction = routine?.instructions[0];
    const directCall = model.directCalls[0];

    expect(routine?.span).toMatchObject({
      file: '/tmp/include.asm',
      sourceUnit: '/tmp/main.asm',
      sourceRelation: 'include',
      sourceUnitRelation: 'entry',
    });
    expect(instruction).toMatchObject({
      file: '/tmp/include.asm',
      sourceUnit: '/tmp/main.asm',
      sourceRelation: 'include',
      sourceUnitRelation: 'entry',
    });
    expect(directCall).toMatchObject({
      file: '/tmp/include.asm',
      sourceUnit: '/tmp/main.asm',
      sourceRelation: 'include',
      sourceUnitRelation: 'entry',
    });
  });

  it('preserves source ownership metadata on tail-jump direct boundaries', () => {
    const items: SourceItem[] = [
      {
        kind: 'routine',
        contract: { in: [], out: [], maybeOut: [], clobbers: [], preserves: [] },
        span: {
          sourceName: '/tmp/imported.asm',
          line: 1,
          column: 1,
          sourceUnit: '/tmp/imported.asm',
          sourceRelation: 'import',
          sourceUnitRelation: 'import',
        },
      },
      {
        kind: 'label',
        name: 'START',
        isExported: true,
        span: {
          sourceName: '/tmp/imported.asm',
          line: 1,
          column: 1,
          sourceUnit: '/tmp/imported.asm',
          sourceRelation: 'import',
          sourceUnitRelation: 'import',
        },
      },
      {
        kind: 'instruction',
        instruction: {
          mnemonic: 'jp',
          expression: { kind: 'symbol', name: 'HELPER' },
        },
        span: {
          sourceName: '/tmp/imported.asm',
          line: 2,
          column: 5,
          sourceUnit: '/tmp/imported.asm',
          sourceRelation: 'import',
          sourceUnitRelation: 'import',
        },
      },
      {
        kind: 'routine',
        contract: { in: [], out: [], maybeOut: [], clobbers: [], preserves: [] },
        span: {
          sourceName: '/tmp/imported.asm',
          line: 3,
          column: 1,
          sourceUnit: '/tmp/imported.asm',
          sourceRelation: 'import',
          sourceUnitRelation: 'import',
        },
      },
      {
        kind: 'label',
        name: 'HELPER',
        isExported: true,
        span: {
          sourceName: '/tmp/imported.asm',
          line: 3,
          column: 1,
          sourceUnit: '/tmp/imported.asm',
          sourceRelation: 'import',
          sourceUnitRelation: 'import',
        },
      },
      {
        kind: 'instruction',
        instruction: {
          mnemonic: 'call',
          expression: { kind: 'symbol', name: 'HELPER' },
        },
        span: {
          sourceName: '/tmp/imported.asm',
          line: 4,
          column: 5,
          sourceUnit: '/tmp/imported.asm',
          sourceRelation: 'import',
          sourceUnitRelation: 'import',
        },
      },
      {
        kind: 'instruction',
        instruction: { mnemonic: 'ret' },
        span: {
          sourceName: '/tmp/imported.asm',
          line: 5,
          column: 5,
          sourceUnit: '/tmp/imported.asm',
          sourceRelation: 'import',
          sourceUnitRelation: 'import',
        },
      },
    ];

    const model = buildRegisterContractsProgramModel(items);

    const tailBoundary = model.directBoundaries.find(
      (boundary) => boundary.subject === 'JP HELPER',
    );
    expect(tailBoundary).toMatchObject({
      subject: 'JP HELPER',
      sourceUnit: '/tmp/imported.asm',
      sourceRelation: 'import',
      sourceUnitRelation: 'import',
    });
    const helper = model.routines.find((routine) => routine.name === 'HELPER');
    expect(helper?.instructions[0]?.resolvedTarget).toBe(helper?.identity);
  });

  it('keeps internal labels inside a routine body', () => {
    const items = parseRegisterContractsItems(
      '/tmp/main.z80',
      [
        '.routine',
        'START:',
        '    call LOOP_ROUTINE',
        '    ret',
        '.routine',
        'LOOP_ROUTINE:',
        '_loop:',
        '    djnz _loop',
        '    ret',
        '.end',
      ].join('\n'),
    );

    const model = buildRegisterContractsProgramModel(items);

    const routine = model.routines.find((r) => r.name === 'LOOP_ROUTINE');
    expect(routine?.labels).toContain('_loop');
    expect(routine?.instructions.map(instructionHead)).toEqual(['djnz', 'ret']);
  });

  it('coalesces consecutive global labels before the first instruction as aliases', () => {
    const items = parseRegisterContractsItems(
      '/tmp/main.z80',
      [
        '.routine',
        'ALIAS:',
        'HELPER:',
        '    ld de,$2000',
        '    ret',
        '.routine',
        'START:',
        '    call ALIAS',
        '    inc de',
        '    ret',
        '.end',
      ].join('\n'),
    );

    const model = buildRegisterContractsProgramModel(items);

    const alias = model.routines.find((r) => r.name === 'ALIAS');
    expect(model.routines.map((r) => r.name)).toEqual(['ALIAS', 'START']);
    expect(alias?.labels).toEqual(['ALIAS', 'HELPER']);
    expect(alias?.instructions.map(instructionHead)).toEqual(['ld', 'ret']);
  });

  it('keeps export markers independent from explicit routine declarations', () => {
    const items = parseRegisterContractsItems(
      '/tmp/main.z80',
      [
        '.routine',
        '@CheckCollAtDe:',
        '    push bc',
        '    ld b,4',
        '_checkCollRow:',
        '    djnz _checkCollRow',
        '_collExitOk:',
        '    pop bc',
        '    ret',
        '.routine',
        '@RotateTestDone:',
        '    call CheckCollAtDe',
        '_rotateAccept:',
        '    ret',
        '.end',
      ].join('\n'),
    );

    const model = buildRegisterContractsProgramModel(items);

    expect(model.routines.map((routine) => routine.name)).toEqual([
      'CheckCollAtDe',
      'RotateTestDone',
    ]);
    expect(model.routines.find((routine) => routine.name === 'CheckCollAtDe')?.labels).toEqual([
      'CheckCollAtDe',
      '_checkCollRow',
      '_collExitOk',
    ]);
    expect(
      model.routines
        .find((routine) => routine.name === 'CheckCollAtDe')
        ?.instructions.map((item) => instructionHead(item)),
    ).toEqual(['push', 'ld', 'djnz', 'pop', 'ret']);
  });

  it('treats jumps to declared routines as tail-call boundaries', () => {
    const items = parseRegisterContractsItems(
      '/tmp/main.z80',
      [
        '.routine',
        '@START:',
        '    jp _internal',
        '    jp nz,HELPER',
        '    jr nz,HELPER',
        '_internal:',
        '    jp HELPER',
        '    jr HELPER',
        '.routine',
        '@HELPER:',
        '    ret',
        '.end',
      ].join('\n'),
    );

    const model = buildRegisterContractsProgramModel(items);

    expect(model.directBoundaries.map((boundary) => boundary.subject)).toEqual([
      'JP HELPER',
      'JR HELPER',
      'JP HELPER',
      'JR HELPER',
    ]);
  });

  it('does not expose self JP or JR jumps as direct routine boundaries', () => {
    const items = parseRegisterContractsItems(
      '/tmp/main.z80',
      [
        '.routine',
        'SELF:',
        '    jp nz,SELF',
        '    jr nz,SELF',
        '    jp SELF',
        '    jr SELF',
        '.end',
      ].join('\n'),
    );

    const model = buildRegisterContractsProgramModel(items);

    expect(model.directBoundaries).toEqual([]);
    expect(
      model.routines[0]?.instructions.every((instruction) => !instruction.resolvedTarget),
    ).toBe(true);
  });

  it('uses owned routine occurrences for repeated include tail jumps', () => {
    const includedSpan = {
      sourceName: '/tmp/repeated.asm',
      line: 1,
      column: 5,
      sourceUnit: '/tmp/main.asm',
      sourceRelation: 'include' as const,
      sourceUnitRelation: 'entry' as const,
    };
    const routine = (line: number): SourceItem => ({
      kind: 'routine',
      contract: { in: [], out: [], maybeOut: [], clobbers: [], preserves: [] },
      span: { sourceName: '/tmp/main.asm', line, column: 1, sourceUnit: '/tmp/main.asm' },
    });
    const label = (name: string, line: number): SourceItem => ({
      kind: 'label',
      name,
      span: { sourceName: '/tmp/main.asm', line, column: 1, sourceUnit: '/tmp/main.asm' },
    });
    const jump = (): SourceItem => ({
      kind: 'instruction',
      instruction: { mnemonic: 'jr', expression: { kind: 'symbol', name: 'First' } },
      span: includedSpan,
    });
    const model = buildRegisterContractsProgramModel([
      routine(1),
      label('First', 2),
      jump(),
      routine(3),
      label('Second', 4),
      jump(),
    ]);

    expect(model.directBoundaries).toEqual([
      expect.objectContaining({ subject: 'JR First', targetIdentity: 'First' }),
    ]);
  });

  it('collects JP and JR tail boundaries outside routine regions', () => {
    const items = parseRegisterContractsItems(
      '/tmp/main.z80',
      [
        '    jp HELPER',
        '    jr nz,HELPER',
        '.routine',
        'FIRST:',
        '    ret',
        'OUTSIDE:',
        '    jp HELPER',
        '    jr z,HELPER',
        '.routine',
        'HELPER:',
        '    ret',
        '.end',
      ].join('\n'),
    );

    const model = buildRegisterContractsProgramModel(items);

    expect(model.directBoundaries).toEqual([
      expect.objectContaining({ subject: 'JP HELPER', targetIdentity: 'HELPER', line: 1 }),
      expect.objectContaining({ subject: 'JR HELPER', targetIdentity: 'HELPER', line: 2 }),
      expect.objectContaining({ subject: 'JP HELPER', targetIdentity: 'HELPER', line: 7 }),
      expect.objectContaining({ subject: 'JR HELPER', targetIdentity: 'HELPER', line: 8 }),
    ]);
  });

  it('collects unresolved unconditional tails outside routines without guessing conditional tails', () => {
    const items = parseRegisterContractsItems(
      '/tmp/main.z80',
      [
        '    jp UNKNOWN_JP',
        '    jr UNKNOWN_JR',
        '    jp nz,UNKNOWN_CONDITIONAL_JP',
        '    jr nz,UNKNOWN_CONDITIONAL_JR',
        '.end',
      ].join('\n'),
    );

    const model = buildRegisterContractsProgramModel(items);

    expect(model.directBoundaries.map((boundary) => boundary.subject)).toEqual([
      'JP UNKNOWN_JP',
      'JR UNKNOWN_JR',
    ]);
  });

  it('keeps explicit routine declarations local to each source file', () => {
    const sharedText = ['.routine', '@LcdScript:', '    ret', '.end'].join('\n');
    const pacmoText = [
      '.routine',
      'LcdShowPacSplash:',
      '    ld hl,ScriptPacSplash',
      '    jp LcdScript',
      '.routine',
      'LcdShowPacOver:',
      '    ret',
      '.end',
    ].join('\n');
    const items = parseRegisterContractsItemsFromSources([
      { path: '/tmp/shared.asm', text: sharedText },
      { path: '/tmp/pacmo.asm', text: pacmoText },
    ]);

    const model = buildRegisterContractsProgramModel(items);

    expect(model.routines.map((r) => r.name)).toEqual([
      'LcdScript',
      'LcdShowPacSplash',
      'LcdShowPacOver',
    ]);
    expect(model.directBoundaries.map((boundary) => boundary.subject)).toContain('JP LcdScript');
  });

  it('includes conditional direct call targets', () => {
    const items = parseRegisterContractsItems(
      '/tmp/main.z80',
      [
        '.routine',
        'START:',
        '    call nz,HELPER',
        '    ret',
        '.routine',
        'HELPER:',
        '    ret',
        '.end',
      ].join('\n'),
    );

    const model = buildRegisterContractsProgramModel(items);

    expect(directCallTargets(model)).toEqual(['HELPER']);
    expect(model.routines.map((r) => r.name)).toEqual(['START', 'HELPER']);
  });

  it('sorts multiple direct call targets and collects each routine', () => {
    const items = parseRegisterContractsItems(
      '/tmp/main.z80',
      [
        '.routine',
        'START:',
        '    call ZED',
        '    call ALPHA',
        '    ret',
        '.routine',
        'ZED:',
        '    ret',
        '.routine',
        'ALPHA:',
        '    ret',
        '.end',
      ].join('\n'),
    );

    const model = buildRegisterContractsProgramModel(items);

    expect(directCallTargets(model)).toEqual(['ALPHA', 'ZED']);
    expect(model.routines.map((r) => r.name)).toEqual(['START', 'ZED', 'ALPHA']);
  });

  it('parses direct local labels and local djnz targets', () => {
    const items = parseRegisterContractsItems(
      '/tmp/main.z80',
      [
        '.routine',
        'START:',
        '    call LOOP_ROUTINE',
        '.routine',
        'LOOP_ROUTINE:',
        '_loop:',
        '    djnz _loop',
        '    ret',
      ].join('\n'),
    );

    const model = buildRegisterContractsProgramModel(items);

    const routine = model.routines.find((r) => r.name === 'LOOP_ROUTINE');
    expect(routine?.labels).toEqual(['LOOP_ROUTINE', '_loop']);
    const djnz = routine?.instructions[0]?.instruction;
    expect(djnz?.mnemonic).toBe('djnz');
    if (djnz?.mnemonic === 'djnz') {
      expect(djnz.expression).toMatchObject({ kind: 'symbol', name: '_loop' });
    }
  });

  it('models an explicitly declared entry routine without a synthetic caller', () => {
    const items = parseRegisterContractsItems(
      '/tmp/main.z80',
      [
        '.routine',
        'START:',
        '    ld de,$1000',
        '    call HELPER',
        '    inc de',
        '    ret',
        '.routine',
        'HELPER:',
        '    ret',
        '.end',
      ].join('\n'),
    );

    const model = buildRegisterContractsProgramModel(items);

    expect(model.routines.map((r) => r.name)).toEqual(['START', 'HELPER']);
    expect(
      model.routines.find((r) => r.name === 'START')?.instructions.map(instructionHead),
    ).toEqual(['ld', 'call', 'inc', 'ret']);
  });

  it('keeps conditional returns in the routine so later clobbers are summarized', () => {
    const items = parseRegisterContractsItems(
      '/tmp/main.z80',
      [
        '.routine',
        'START:',
        '    call HELPER',
        '    ret',
        '.routine',
        'HELPER:',
        '    ret z',
        '    ld de,$2000',
        '    ld (de),a',
        '    ret',
        '.end',
      ].join('\n'),
    );

    const model = buildRegisterContractsProgramModel(items);
    const helper = model.routines.find((r) => r.name === 'HELPER');
    if (!helper) throw new Error('missing HELPER routine');
    const summary = inferRoutineSummary(helper);

    expect(
      helper.instructions.map(
        (i) => `${instructionHead(i)} ${instructionOperandCount(i.instruction)}`,
      ),
    ).toEqual(['ret-cc 1', 'ld 2', 'ld 2', 'ret 0']);
    expect(summary.mayWrite).toEqual(expect.arrayContaining(['D', 'E']));
  });

  it('does not collect direct call targets from op declarations', async () => {
    await withTempSource(
      'azm-regcontracts-program-op-',
      'asm',
      ['op macro_call()', '  call HELPER', 'end', ''].join('\n'),
      async (entry) => {
        const loaded = await loadProgram({ entryFile: entry });
        expect(loaded.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
        if (!loaded.loadedProgram) throw new Error('expected loaded program');

        const model = buildRegisterContractsProgramModel(
          loaded.loadedProgram.program.files[0].items,
        );

        expect(directCallTargets(model)).toEqual([]);
        expect(model.routines).toEqual([]);
      },
    );
  });

  it('collects routines and call targets from labels', () => {
    const items = parseRegisterContractsItems(
      '/tmp/main.asm',
      ['.routine', 'typed_call:', '  call HELPER', ''].join('\n'),
    );

    const model = buildRegisterContractsProgramModel(items);

    expect(directCallTargets(model)).toEqual(['HELPER']);
    expect(model.routines.map((routine) => routine.name)).toEqual(['typed_call']);
    expect(model.routines[0]?.instructions.map((item) => instructionHead(item))).toEqual(['call']);
  });
});
