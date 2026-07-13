import { annotateRegisterContractsContracts } from './annotate.js';
import { applyExpectOutFixesToSource, findExpectOutFixesForCandidates } from './fix.js';
import { withAcceptedOutputs } from './summaries.js';
import type {
  RegisterContractsAnnotationFile,
  RegisterContractsOutputCandidate,
  RegisterContractsRoutine,
  RoutineSummary,
} from './types.js';

export function buildAnnotations(
  loaded: {
    sourceTexts: ReadonlyMap<string, string>;
  },
  programRoutines: readonly RegisterContractsRoutine[],
  summariesByName: ReadonlyMap<string, RoutineSummary>,
  outputCandidates: readonly RegisterContractsOutputCandidate[],
  options: {
    fixOutputCandidates: boolean;
    fixCandidates?: readonly RegisterContractsOutputCandidate[];
  },
): readonly RegisterContractsAnnotationFile[] {
  let routines = programRoutines
    .filter((routine) => summariesByName.has(routine.identity ?? routine.name))
    .map((routine) => ({
      routine,
      summary: summariesByName.get(routine.identity ?? routine.name)!,
    }));

  const fixes = options.fixOutputCandidates
    ? findExpectOutFixesForCandidates(
        [...programRoutines],
        [...(options.fixCandidates ?? outputCandidates)],
      )
    : [];
  if (fixes.length > 0) {
    const accepted = new Map<string, RegisterContractsOutputCandidate['carriers']>();
    for (const fix of fixes) {
      const key = fix.routineIdentity ?? fix.routine;
      const carriers = accepted.get(key) ?? [];
      for (const carrier of fix.carriers) {
        if (!carriers.includes(carrier)) carriers.push(carrier);
      }
      accepted.set(key, carriers);
    }
    const promoted = new Map(
      withAcceptedOutputs(
        routines.map((item) => item.summary),
        accepted,
      ).map((summary) => [summary.identity ?? summary.name, summary]),
    );
    routines = routines.map((item) => ({
      ...item,
      summary: promoted.get(item.summary.identity ?? item.summary.name) ?? item.summary,
    }));
  }

  const annotated = annotateRegisterContractsContracts(loaded.sourceTexts, routines);
  if (!options.fixOutputCandidates) {
    return annotated.map((file) => ({ path: file.path, text: file.text }));
  }

  if (fixes.length === 0) {
    return annotated.map((file) => ({ path: file.path, text: file.text }));
  }

  const workingTexts = new Map(loaded.sourceTexts);
  for (const file of annotated) {
    workingTexts.set(file.path, file.text);
  }

  const out: RegisterContractsAnnotationFile[] = [];
  const fixesByFile = new Map<string, ReturnType<typeof findExpectOutFixesForCandidates>>();
  for (const fix of fixes) {
    const items = fixesByFile.get(fix.file) ?? [];
    items.push(fix);
    fixesByFile.set(fix.file, items);
  }

  for (const [path, text] of workingTexts) {
    const reference = loaded.sourceTexts.get(path);
    if (reference === undefined) continue;
    const fileFixes = fixesByFile.get(path) ?? [];
    const nextText =
      fileFixes.length > 0 ? applyExpectOutFixesToSource(text, fileFixes, reference) : text;
    if (nextText !== reference) {
      out.push({ path, text: nextText });
    }
  }

  return out.sort((left, right) => left.path.localeCompare(right.path));
}
