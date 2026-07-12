import type { RegisterContractsRoutine } from './types.js';

export function resolveRoutineIdentity(
  target: string,
  sourceUnit: string | undefined,
  routines: readonly RegisterContractsRoutine[],
): string | undefined {
  const candidates = routines.filter((routine) => routine.entryLabels.includes(target));
  const sameUnit = candidates.find(
    (routine) => routine.span.sourceUnit !== undefined && routine.span.sourceUnit === sourceUnit,
  );
  if (sameUnit !== undefined) return sameUnit.identity ?? sameUnit.name;
  const visible = candidates.filter(
    (routine) =>
      routine.span.sourceUnitRelation !== 'import' ||
      routine.exportedEntryLabels?.includes(target) === true,
  );
  return visible.length === 1 ? (visible[0]!.identity ?? visible[0]!.name) : undefined;
}
