import type { RoutineContractDeclaration } from '../model/register-contract.js';
import type {
  RegisterContractsUnit,
  RoutineContract,
  RoutineSummary,
  ValueRelation,
} from './types.js';
import {
  FLAG_UNIT_LIST,
  contractOutRelation,
  unique,
  withImpliedFlagUnits,
} from './summary-state.js';

function relationKey(relation: ValueRelation): string {
  return `${relation.out.join(',')}<- ${relation.from.join(',')}`;
}

function addContractRelation(out: ValueRelation[], relation: ValueRelation): void {
  if (relation.out.length === 0) return;
  const key = relationKey(relation);
  if (!out.some((existing) => relationKey(existing) === key)) out.push(relation);
}

export function hasExplicitDeclaredContract(
  declared: RoutineContractDeclaration | undefined,
): declared is RoutineContractDeclaration {
  if (declared === undefined) return false;
  return (
    declared.in.length > 0 ||
    declared.out.length > 0 ||
    declared.maybeOut.length > 0 ||
    declared.clobbers.length > 0 ||
    declared.preserves.length > 0
  );
}

/** Body-effect writes: inferred clobbers plus intentional outputs. */
export function bodyEffectWriteUnits(summary: RoutineSummary): RegisterContractsUnit[] {
  return withImpliedFlagUnits([
    ...summary.mayWrite,
    ...summary.valueRelations.flatMap((relation) => relation.out),
  ]);
}

/**
 * Units the declaration allows the body to write: `out`, `maybe-out`, and
 * `clobbers`. Everything else is treated as preserved for callers, including
 * registers listed under `preserves` and registers left unmentioned.
 */
export function declaredAllowedWriteUnits(
  declared: RoutineContractDeclaration,
): RegisterContractsUnit[] {
  return withImpliedFlagUnits([...declared.out, ...declared.maybeOut, ...declared.clobbers]);
}

/**
 * Body writes that contradict an explicit `.routine` declaration.
 * Bare `.routine` (no clauses) is not checked here.
 */
export function declarationContractMismatchUnits(
  inferred: RoutineSummary,
  declared: RoutineContractDeclaration,
): RegisterContractsUnit[] {
  const allowed = new Set(declaredAllowedWriteUnits(declared));
  return bodyEffectWriteUnits(inferred).filter((unit) => !allowed.has(unit));
}

export function applyRoutineContract(
  summary: RoutineSummary,
  contract: RoutineContract,
): RoutineSummary {
  const inferredOutputs = unique([
    ...(summary.mayOutput ?? []),
    ...summary.valueRelations.flatMap((relation) => relation.out),
  ]);
  const contractIn = withImpliedFlagUnits(contract.in);
  const contractOut = withImpliedFlagUnits(contract.out);
  const contractMaybeOut = withImpliedFlagUnits(contract.maybeOut ?? []);
  const contractClobbers = withImpliedFlagUnits(contract.clobbers);
  const contractPreserves = withImpliedFlagUnits(contract.preserves);
  const outputSet = new Set(contractOut);
  const clobberSet = new Set(contractClobbers);
  const preservedSet = new Set(contractPreserves);

  const inferredWrites = withImpliedFlagUnits([
    ...summary.mayWrite,
    ...summary.valueRelations.flatMap((relation) => relation.out),
  ]);
  const baseMayWrite = contract.complete
    ? inferredWrites.filter((unit) => FLAG_UNIT_LIST.includes(unit))
    : inferredWrites;
  const mayWrite = baseMayWrite.filter((unit) => !outputSet.has(unit) && !preservedSet.has(unit));
  appendContractClobbers(mayWrite, contractClobbers, outputSet, preservedSet);

  const mayWriteSet = new Set(withImpliedFlagUnits(mayWrite));
  const preserved = unique([...summary.preserved, ...contractPreserves]).filter(
    (unit) => !outputSet.has(unit) && !mayWriteSet.has(unit),
  );

  const valueRelations: ValueRelation[] = [];
  const relation = contractOutRelation(contractIn, contractOut);
  if (relation) addContractRelation(valueRelations, relation);

  const mayOutput = unique([...inferredOutputs, ...contractMaybeOut]).filter(
    (unit) => !outputSet.has(unit) && !clobberSet.has(unit) && !preservedSet.has(unit),
  );

  return {
    ...summary,
    ...(contract.noreturn === true ? { noreturn: true } : {}),
    mayRead: unique(contractIn),
    mayWrite,
    ...(mayOutput.length > 0 ? { mayOutput } : { mayOutput: [] }),
    outputCandidates: contractMaybeOut,
    preserved,
    valueRelations,
  };
}

/**
 * Convert body-level output inference into review metadata. A body write is not
 * a semantic return value until a source contract, --accept-out, or caller
 * .expectout explicitly confirms it.
 */
export function demoteInferredRoutineOutputs(summary: RoutineSummary): RoutineSummary {
  const inferredOutputs = unique([
    ...(summary.mayOutput ?? []),
    ...summary.valueRelations.flatMap((relation) => relation.out),
  ]);
  return {
    ...summary,
    mayWrite: unique([...summary.mayWrite, ...inferredOutputs]),
    mayOutput: inferredOutputs,
    outputCandidates: unique([...summary.mayWrite, ...inferredOutputs]),
    valueRelations: [],
  };
}

function appendContractClobbers(
  mayWrite: RegisterContractsUnit[],
  contractClobbers: readonly RegisterContractsUnit[],
  outputSet: ReadonlySet<RegisterContractsUnit>,
  preservedSet: ReadonlySet<RegisterContractsUnit>,
): void {
  for (const unit of contractClobbers) {
    if (!outputSet.has(unit) && !preservedSet.has(unit) && !mayWrite.includes(unit)) {
      mayWrite.push(unit);
    }
  }
}
