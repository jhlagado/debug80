import type { SourceItem } from '../model/source-item.js';
import type { SourceSpan } from '../source/source-span.js';
import { privacyUnitKey, privacyUnitKeyFromSpan } from '../assembly/routine-label-scopes.js';
import { instructionCallTarget, pushDirectBoundary } from './programModel-boundaries.js';
import { resolveRoutineIdentity } from './routine-identity.js';
import type {
  RegisterContractsDirectCall,
  RegisterContractsInstruction,
  RegisterContractsRoutine,
} from './types.js';

type LabelItem = Extract<SourceItem, { kind: 'label' }>;
type RoutineItem = Extract<SourceItem, { kind: 'routine' }>;
type InstructionItem = Extract<SourceItem, { kind: 'instruction' }>;

interface RoutineBuildState {
  routineName: string;
  identity: string;
  isExported: boolean;
  exportedEntryLabels: string[];
  entryLabels: string[];
  labels: string[];
  sourceName: string;
  sourceUnit?: string;
  sourceRelation?: SourceSpan['sourceRelation'];
  sourceUnitRelation?: SourceSpan['sourceUnitRelation'];
  routineStartLine: number;
  routineStartColumn: number;
  directive: RoutineItem;
  instructions: RegisterContractsInstruction[];
}

interface UnitRoutineState {
  pending?: RoutineItem;
  active?: RoutineBuildState;
}

export interface RoutineBuildResult {
  routines: RegisterContractsRoutine[];
  directCalls: RegisterContractsDirectCall[];
  ownedInstructionItems: ReadonlySet<InstructionItem>;
}

function toInstruction(
  item: InstructionItem,
  labels: readonly string[],
  constants: ReadonlyMap<string, number>,
): RegisterContractsInstruction {
  const span = effectiveInstructionSpan(item);
  return {
    instruction: item.instruction,
    file: span.sourceName,
    line: span.line,
    column: span.column,
    ...(span.sourceUnit !== undefined ? { sourceUnit: span.sourceUnit } : {}),
    ...(span.sourceRelation !== undefined ? { sourceRelation: span.sourceRelation } : {}),
    ...(span.sourceUnitRelation !== undefined
      ? { sourceUnitRelation: span.sourceUnitRelation }
      : {}),
    labels: [...labels],
    constants,
  };
}

function effectiveInstructionSpan(item: InstructionItem): SourceSpan {
  return item.emittedSource?.span ?? item.span;
}

function startRoutine(item: LabelItem, directive: RoutineItem): RoutineBuildState {
  return {
    routineName: item.name,
    identity: routineIdentity(item),
    isExported: item.isExported === true,
    exportedEntryLabels: item.isExported === true ? [item.name] : [],
    entryLabels: [item.name],
    labels: [item.name],
    sourceName: item.span.sourceName,
    ...(item.span.sourceUnit !== undefined ? { sourceUnit: item.span.sourceUnit } : {}),
    ...(item.span.sourceRelation !== undefined ? { sourceRelation: item.span.sourceRelation } : {}),
    ...(item.span.sourceUnitRelation !== undefined
      ? { sourceUnitRelation: item.span.sourceUnitRelation }
      : {}),
    routineStartLine: item.span.line,
    routineStartColumn: item.span.column,
    directive,
    instructions: [],
  };
}

function routineIdentity(item: LabelItem): string {
  const sourceUnit = item.span.sourceUnit ?? item.span.sourceName;
  return item.span.sourceUnitRelation === 'import'
    ? `\0azm-routine\0${sourceUnit}\0${item.name}`
    : item.name;
}

function routineSpan(state: RoutineBuildState): RegisterContractsRoutine['span'] {
  const end = state.instructions[state.instructions.length - 1];
  return {
    file: state.sourceName,
    ...(state.sourceUnit !== undefined ? { sourceUnit: state.sourceUnit } : {}),
    ...(state.sourceRelation !== undefined ? { sourceRelation: state.sourceRelation } : {}),
    ...(state.sourceUnitRelation !== undefined
      ? { sourceUnitRelation: state.sourceUnitRelation }
      : {}),
    start: { line: state.routineStartLine, column: state.routineStartColumn },
    end: {
      line: end?.line ?? state.routineStartLine,
      column: end?.column ?? state.routineStartColumn,
    },
  };
}

function flushRoutine(
  routines: RegisterContractsRoutine[],
  state: UnitRoutineState,
  constants: ReadonlyMap<string, number>,
): void {
  const active = state.active;
  if (active === undefined) return;
  routines.push({
    name: active.routineName,
    identity: active.identity,
    ...(active.isExported ? { isExported: true } : {}),
    ...(active.exportedEntryLabels.length > 0
      ? { exportedEntryLabels: [...active.exportedEntryLabels] }
      : {}),
    labels: [...active.labels],
    entryLabels: [...active.entryLabels],
    declaredContract: active.directive.contract,
    directiveSpan: active.directive.span,
    instructions: [...active.instructions],
    constants,
    span: routineSpan(active),
  });
  delete state.active;
}

function appendDirectCall(directCalls: RegisterContractsDirectCall[], item: InstructionItem): void {
  const directTarget = instructionCallTarget(item);
  if (directTarget === undefined) return;
  pushDirectBoundary(
    directCalls,
    directTarget,
    `CALL ${directTarget}`,
    effectiveInstructionSpan(item),
  );
}

function modelUnitKey(item: SourceItem, currentUnitKey: string | undefined): string {
  if (item.kind === 'instruction') {
    return privacyUnitKeyFromSpan(effectiveInstructionSpan(item));
  }
  if (item.kind === 'label' && item.origin === 'generated' && currentUnitKey !== undefined) {
    return currentUnitKey;
  }
  return privacyUnitKey(item);
}

function handleLabel(
  item: LabelItem,
  state: UnitRoutineState,
  routines: RegisterContractsRoutine[],
  constants: ReadonlyMap<string, number>,
): void {
  if (item.name.startsWith('_')) {
    if (state.active !== undefined) state.active.labels.push(item.name);
    return;
  }

  if (
    state.active !== undefined &&
    state.active.instructions.length === 0 &&
    state.pending === undefined
  ) {
    state.active.labels.push(item.name);
    state.active.entryLabels.push(item.name);
    if (item.isExported === true) {
      state.active.isExported = true;
      state.active.exportedEntryLabels.push(item.name);
    }
    return;
  }

  flushRoutine(routines, state, constants);
  if (state.pending !== undefined) {
    state.active = startRoutine(item, state.pending);
    delete state.pending;
  }
}

export function buildRoutinesAndDirectCalls(
  items: readonly SourceItem[],
  constants: ReadonlyMap<string, number>,
): RoutineBuildResult {
  const routines: RegisterContractsRoutine[] = [];
  const directCalls: RegisterContractsDirectCall[] = [];
  const ownedInstructionItems = new Set<InstructionItem>();
  const states = new Map<string, UnitRoutineState>();
  let currentUnitKey: string | undefined;

  for (const item of items) {
    const unitKey = modelUnitKey(item, currentUnitKey);
    const state = states.get(unitKey) ?? {};
    states.set(unitKey, state);

    if (item.kind === 'routine') {
      currentUnitKey = unitKey;
      flushRoutine(routines, state, constants);
      state.pending = item;
      continue;
    }
    if (item.kind === 'label') {
      if (item.origin !== 'generated') currentUnitKey = unitKey;
      handleLabel(item, state, routines, constants);
      continue;
    }
    if (item.kind !== 'instruction') continue;
    currentUnitKey = unitKey;
    appendDirectCall(directCalls, item);
    if (state.active === undefined) continue;
    ownedInstructionItems.add(item);
    state.active.instructions.push(toInstruction(item, state.active.labels, constants));
  }

  for (const state of states.values()) flushRoutine(routines, state, constants);
  return resolveRoutineTargets(routines, directCalls, ownedInstructionItems);
}

function resolveRoutineTargets(
  routines: RegisterContractsRoutine[],
  directCalls: RegisterContractsDirectCall[],
  ownedInstructionItems: ReadonlySet<InstructionItem>,
): RoutineBuildResult {
  const resolvedRoutines = routines.map((routine) => ({
    ...routine,
    instructions: routine.instructions.map((instruction) => {
      const target = instructionCallTargetFromInstruction(instruction);
      const identity =
        target === undefined
          ? undefined
          : resolveRoutineIdentity(target, instruction.sourceUnit, routines);
      const mnemonic = instruction.instruction.mnemonic;
      const isJump =
        mnemonic === 'jp' || mnemonic === 'jp-cc' || mnemonic === 'jr' || mnemonic === 'jr-cc';
      return identity === undefined || (isJump && identity === routine.identity)
        ? instruction
        : { ...instruction, resolvedTarget: identity };
    }),
  }));
  const resolvedCalls = directCalls.map((call) => {
    const identity = resolveRoutineIdentity(call.target, call.sourceUnit, routines);
    return identity === undefined ? call : { ...call, targetIdentity: identity };
  });
  return { routines: resolvedRoutines, directCalls: resolvedCalls, ownedInstructionItems };
}

function instructionCallTargetFromInstruction(
  instruction: RegisterContractsInstruction,
): string | undefined {
  const mnemonic = instruction.instruction.mnemonic;
  if (
    mnemonic !== 'call' &&
    mnemonic !== 'call-cc' &&
    mnemonic !== 'jp' &&
    mnemonic !== 'jp-cc' &&
    mnemonic !== 'jr' &&
    mnemonic !== 'jr-cc'
  ) {
    return undefined;
  }
  return instruction.instruction.expression.kind === 'symbol'
    ? instruction.instruction.expression.name
    : undefined;
}
