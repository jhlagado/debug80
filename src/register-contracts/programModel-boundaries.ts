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
  item: SourceItem,
  routines: readonly RegisterContractsRoutine[],
  items: readonly SourceItem[],
): string | undefined {
  if (item.kind !== 'instruction') return undefined;
  if (!isTailJumpInstruction(item.instruction)) return undefined;
  const target = routineNameFromExpression(item.instruction.expression);
  if (!isEligibleTailJumpTarget(target)) return undefined;
  const span = effectiveInstructionSpan(item);
  const routineIdentity = resolveRoutineIdentity(target, span.sourceUnit, routines);
  if (item.instruction.mnemonic === 'jp-cc') {
    return routineIdentity === undefined ? undefined : target;
  }
  return routineIdentity !== undefined || !hasVisibleOrdinaryLabel(target, span, items, routines)
    ? target
    : undefined;
}

function hasVisibleOrdinaryLabel(
  target: string,
  callerSpan: InstructionItem['span'],
  items: readonly SourceItem[],
  routines: readonly RegisterContractsRoutine[],
): boolean {
  const routineLabels = new Set(routines.flatMap((routine) => routine.entryLabels));
  const callerUnit = callerSpan.sourceUnit ?? callerSpan.sourceName;
  return items.some((candidate) => {
    if (candidate.kind !== 'label' || candidate.name !== target) return false;
    if (routineLabels.has(candidate.name)) {
      const resolved = resolveRoutineIdentity(target, callerSpan.sourceUnit, routines);
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
  { readonly mnemonic: 'jp' | 'jp-cc' }
> {
  return instruction.mnemonic === 'jp' || instruction.mnemonic === 'jp-cc';
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

function effectiveInstructionSpan(item: InstructionItem): InstructionItem['span'] {
  return item.emittedSource?.span ?? item.span;
}

export function collectDirectTailJumps(
  items: readonly SourceItem[],
  routines: readonly RegisterContractsRoutine[],
): RegisterContractsDirectCall[] {
  const directTailJumps: RegisterContractsDirectCall[] = [];

  for (const item of items) {
    if (item.kind !== 'instruction') continue;
    const target = instructionTailJumpTarget(item, routines, items);
    if (target === undefined) continue;
    pushDirectBoundary(directTailJumps, target, `JP ${target}`, effectiveInstructionSpan(item));
  }

  return directTailJumps.map((boundary) => {
    const identity = resolveRoutineIdentity(boundary.target, boundary.sourceUnit, routines);
    return identity === undefined ? boundary : { ...boundary, targetIdentity: identity };
  });
}
