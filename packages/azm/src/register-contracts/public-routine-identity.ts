import { dirname, relative } from 'node:path';

import type {
  RegisterContractsOutputCandidate,
  RegisterContractsRoutine,
  RoutineSummary,
} from './types.js';

export function publicRoutineIdentity(
  entryFile: string,
  routine: RegisterContractsRoutine,
): string {
  const path = relative(dirname(entryFile), routine.span.file).replace(/\\/g, '/') || '.';
  return `routine:${path}:${routine.span.start.line}:${routine.span.start.column}:${routine.name}`;
}

export function withPublicSummaryIdentity(
  summary: RoutineSummary,
  identities: ReadonlyMap<string, string>,
): RoutineSummary {
  const internalIdentity = summary.identity ?? summary.name;
  return { ...summary, identity: identities.get(internalIdentity) ?? internalIdentity };
}

export function withPublicCandidateIdentity(
  candidate: RegisterContractsOutputCandidate,
  identities: ReadonlyMap<string, string>,
): RegisterContractsOutputCandidate {
  if (candidate.routineIdentity === undefined) return candidate;
  return {
    ...candidate,
    routineIdentity: identities.get(candidate.routineIdentity) ?? candidate.routineIdentity,
  };
}

export function withPublicRoutineIdentity<T extends { routineIdentity?: string }>(
  value: T,
  identities: ReadonlyMap<string, string>,
): T {
  if (value.routineIdentity === undefined) return value;
  return {
    ...value,
    routineIdentity: identities.get(value.routineIdentity) ?? value.routineIdentity,
  };
}
