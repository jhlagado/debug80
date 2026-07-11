import type { Expression } from '../model/expression.js';
import type { SourceItem } from '../model/source-item.js';
import type { RegisterContractsDirectCall, RegisterContractsRoutine } from './types.js';
import { resolveRoutineIdentity } from './routine-identity.js';

type InstructionItem = Extract<SourceItem, { readonly kind: 'instruction' }>;

function routineNameFromExpression(expression: Expression): string | undefined {
  return expression.kind === 'symbol' ? expression.name : undefined;
}

export function instructionCallTarget(item: SourceItem): string | undefined {
  if (item.kind !== 'instruction') return undefined;
  const mnemonic = item.instruction.mnemonic;
  if (mnemonic === 'call' || mnemonic === 'call-cc') {
    return routineNameFromExpression(item.instruction.expression);
  }
  return undefined;
}

function instructionTailJumpTarget(
  instruction: RegisterContractsRoutine['instructions'][number],
  caller: RegisterContractsRoutine,
  routines: readonly RegisterContractsRoutine[],
  items: readonly SourceItem[],
): { target: string; targetIdentity?: string } | undefined {
  if (!isTailJumpInstruction(instruction.instruction)) return undefined;
  const target = routineNameFromExpression(instruction.instruction.expression);
  if (!isEligibleTailJumpTarget(target)) return undefined;
  const routineIdentity = resolveRoutineIdentity(target, instruction.sourceUnit, routines);
  if (routineIdentity !== undefined && routineIdentity === caller.identity) return undefined;
  if (
    instruction.instruction.mnemonic === 'jp-cc' ||
    instruction.instruction.mnemonic === 'jr-cc'
  ) {
    return routineIdentity === undefined ? undefined : { target, targetIdentity: routineIdentity };
  }
  if (routineIdentity !== undefined) return { target, targetIdentity: routineIdentity };
  return hasVisibleOrdinaryLabel(target, instruction.sourceUnit, instruction.file, items, routines)
    ? undefined
    : { target };
}

function hasVisibleOrdinaryLabel(
  target: string,
  callerSourceUnit: string | undefined,
  callerFile: string,
  items: readonly SourceItem[],
  routines: readonly RegisterContractsRoutine[],
): boolean {
  const routineLabels = new Set(routines.flatMap((routine) => routine.entryLabels));
  const callerUnit = callerSourceUnit ?? callerFile;
  return items.some((candidate) => {
    if (candidate.kind !== 'label' || candidate.name !== target) return false;
    if (routineLabels.has(candidate.name)) {
      const resolved = resolveRoutineIdentity(target, callerSourceUnit, routines);
      if (resolved !== undefined) return false;
    }
    const candidateUnit = candidate.span.sourceUnit ?? candidate.span.sourceName;
    if (candidateUnit === callerUnit) return true;
    if (candidate.span.sourceUnitRelation !== 'import') return true;
    return candidate.isExported === true;
  });
}

function isTailJumpInstruction(
  instruction: Extract<SourceItem, { readonly kind: 'instruction' }>['instruction'],
): instruction is Extract<
  Extract<SourceItem, { readonly kind: 'instruction' }>['instruction'],
  { readonly mnemonic: 'jp' | 'jp-cc' | 'jr' | 'jr-cc' }
> {
  return (
    instruction.mnemonic === 'jp' ||
    instruction.mnemonic === 'jp-cc' ||
    instruction.mnemonic === 'jr' ||
    instruction.mnemonic === 'jr-cc'
  );
}

function isEligibleTailJumpTarget(target: string | undefined): target is string {
  return target !== undefined && !target.startsWith('.') && !target.startsWith('_');
}

export function pushDirectBoundary(
  boundaries: RegisterContractsDirectCall[],
  target: string,
  subject: string,
  span: InstructionItem['span'],
): void {
  boundaries.push({
    target,
    subject,
    file: span.sourceName,
    line: span.line,
    column: span.column,
    ...(span.sourceUnit !== undefined ? { sourceUnit: span.sourceUnit } : {}),
    ...(span.sourceRelation !== undefined ? { sourceRelation: span.sourceRelation } : {}),
    ...(span.sourceUnitRelation !== undefined
      ? { sourceUnitRelation: span.sourceUnitRelation }
      : {}),
  });
}

export function collectDirectTailJumps(
  items: readonly SourceItem[],
  routines: readonly RegisterContractsRoutine[],
  ownedInstructionItems: ReadonlySet<InstructionItem>,
): RegisterContractsDirectCall[] {
  return [
    ...routineTailJumps(items, routines),
    ...unownedTailJumps(items, routines, ownedInstructionItems),
  ];
}

function effectiveInstructionSpan(item: InstructionItem): InstructionItem['span'] {
  return item.emittedSource?.span ?? item.span;
}

function routineTailJumps(
  items: readonly SourceItem[],
  routines: readonly RegisterContractsRoutine[],
): RegisterContractsDirectCall[] {
  return routines.flatMap((routine) =>
    routine.instructions.flatMap((instruction) => {
      const target = instructionTailJumpTarget(instruction, routine, routines, items);
      return target === undefined ? [] : [routineTailJumpBoundary(instruction, target)];
    }),
  );
}

function routineTailJumpBoundary(
  instruction: RegisterContractsRoutine['instructions'][number],
  target: { readonly target: string; readonly targetIdentity?: string },
): RegisterContractsDirectCall {
  return {
    target: target.target,
    ...(target.targetIdentity !== undefined ? { targetIdentity: target.targetIdentity } : {}),
    subject: tailJumpSubject(instruction.instruction.mnemonic, target.target),
    file: instruction.file,
    line: instruction.line,
    column: instruction.column,
    ...(instruction.sourceUnit !== undefined ? { sourceUnit: instruction.sourceUnit } : {}),
    ...(instruction.sourceRelation !== undefined ? { sourceRelation: instruction.sourceRelation } : {}),
    ...(instruction.sourceUnitRelation !== undefined
      ? { sourceUnitRelation: instruction.sourceUnitRelation }
      : {}),
  };
}

function unownedTailJumps(
  items: readonly SourceItem[],
  routines: readonly RegisterContractsRoutine[],
  ownedInstructionItems: ReadonlySet<InstructionItem>,
): RegisterContractsDirectCall[] {
  return items.flatMap((item) => {
    if (item.kind !== 'instruction' || ownedInstructionItems.has(item)) return [];
    const boundary = unownedTailJumpBoundary(item, routines, items);
    return boundary === undefined ? [] : [boundary];
  });
}

function unownedTailJumpBoundary(
  item: InstructionItem,
  routines: readonly RegisterContractsRoutine[],
  items: readonly SourceItem[],
): RegisterContractsDirectCall | undefined {
  if (!isTailJumpInstruction(item.instruction)) return undefined;
  const target = routineNameFromExpression(item.instruction.expression);
  if (!isEligibleTailJumpTarget(target)) return undefined;
  const span = effectiveInstructionSpan(item);
  const targetIdentity = resolveRoutineIdentity(target, span.sourceUnit, routines);
  if (isConditionalTailJump(item) && targetIdentity === undefined) return undefined;
  if (
    targetIdentity === undefined &&
    hasVisibleOrdinaryLabel(target, span.sourceUnit, span.sourceName, items, routines)
  ) {
    return undefined;
  }
  return {
    target,
    ...(targetIdentity !== undefined ? { targetIdentity } : {}),
    subject: tailJumpSubject(item.instruction.mnemonic, target),
    file: span.sourceName,
    line: span.line,
    column: span.column,
    ...(span.sourceUnit !== undefined ? { sourceUnit: span.sourceUnit } : {}),
    ...(span.sourceRelation !== undefined ? { sourceRelation: span.sourceRelation } : {}),
    ...(span.sourceUnitRelation !== undefined ? { sourceUnitRelation: span.sourceUnitRelation } : {}),
  };
}

function isConditionalTailJump(item: InstructionItem): boolean {
  return item.instruction.mnemonic === 'jp-cc' || item.instruction.mnemonic === 'jr-cc';
}

function tailJumpSubject(mnemonic: string, target: string): string {
  return `${mnemonic.startsWith('jr') ? 'JR' : 'JP'} ${target}`;
}
