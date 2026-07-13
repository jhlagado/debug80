import type { Diagnostic } from '../model/diagnostic.js';
import { packageBuildCommit, packageVersion } from '../package-identity.js';
import { autoFixableCandidateKeys } from './fix.js';
import {
  buildOutputCandidateFixability,
  buildProfileSummaryLookup,
  outputCandidateKey,
  routineNames,
  unknownCallList,
} from './summaries.js';
import {
  declarationContractMismatchUnits,
  hasExplicitDeclaredContract,
} from './summary-contract.js';
import type {
  AnalyzeRegisterContractsOptions,
  RegisterContractsDirectCall,
  RegisterContractsFinding,
  LocatedSmartComment,
  RegisterContractsOutputCandidate,
  RegisterContractsReportModel,
  RegisterContractsRoutine,
  RegisterContractsUnit,
  RoutineSummary,
} from './types.js';

function candidateMessageWithFixability(
  candidate: RegisterContractsOutputCandidate,
  autoFixable: boolean,
): string {
  const carriers = candidate.carriers.join(',');
  const expectation = candidate.carriers.length === 1 ? candidate.carriers[0]! : `{${carriers}}`;
  const base = `CALL ${candidate.routine} writes ${carriers} and caller reads it later, but ${candidate.routine} does not declare ${carriers} as output`;
  return autoFixable
    ? `${base}; add \`.expectout ${expectation}\` above the call to confirm the dependency and promote the callee output.`
    : `${base}; manual review required before adding \`.expectout ${expectation}\` because the later read is not a simple direct continuation.`;
}

export function knownRoutineNames(
  routines: readonly RegisterContractsRoutine[],
  contractNames: Iterable<string>,
  profile: AnalyzeRegisterContractsOptions['registerContractsProfile'],
): Set<string> {
  const known = new Set(routineNames(routines));
  for (const name of contractNames) known.add(name);
  for (const name of buildProfileSummaryLookup(profile).keys()) known.add(name);
  return known;
}

export function outputCandidatesWithFixability(
  routines: readonly RegisterContractsRoutine[],
  outputCandidates: readonly RegisterContractsOutputCandidate[],
): {
  outputCandidates: RegisterContractsOutputCandidate[];
  outputCandidateFixability: ReadonlyMap<string, boolean>;
} {
  const outputCandidateFixability = buildOutputCandidateFixability(
    routines,
    outputCandidates,
    autoFixableCandidateKeys,
  );
  return {
    outputCandidateFixability,
    outputCandidates: outputCandidates.map((candidate) => {
      const autoFixable =
        outputCandidateFixability.get(
          outputCandidateKey(candidate.file, candidate.line, candidate.column),
        ) ?? false;
      return {
        ...candidate,
        kind: 'output_candidate',
        autoFixable,
        message: candidateMessageWithFixability(candidate, autoFixable),
      };
    }),
  };
}

export function strictStackFindings(
  routines: readonly RegisterContractsRoutine[],
  summaries: readonly RoutineSummary[],
): RegisterContractsFinding[] {
  const routinesByName = new Map(
    routines.map((routine) => [routine.identity ?? routine.name, routine]),
  );
  const findings: RegisterContractsFinding[] = [];

  for (const summary of summaries) {
    const routine = routinesByName.get(summary.identity ?? summary.name);
    if (routine === undefined) continue;
    const stackIssues = strictStackIssueText(summary);
    if (stackIssues === undefined) continue;
    findings.push({
      kind: 'unknown_control_flow',
      routine: summary.name,
      ...(summary.identity !== undefined ? { routineIdentity: summary.identity } : {}),
      stackBalanced: summary.stackBalanced,
      ...(summary.hasUnknownStackEffect !== undefined
        ? { hasUnknownStackEffect: summary.hasUnknownStackEffect }
        : {}),
      file: routine.span.file,
      line: routine.span.start.line,
      column: routine.span.start.column,
      ...(routine.span.sourceUnit !== undefined ? { sourceUnit: routine.span.sourceUnit } : {}),
      ...(routine.span.sourceRelation !== undefined
        ? { sourceRelation: routine.span.sourceRelation }
        : {}),
      ...(routine.span.sourceUnitRelation !== undefined
        ? { sourceUnitRelation: routine.span.sourceUnitRelation }
        : {}),
      message: `Register contracts cannot prove stack discipline for ${summary.name}: ${stackIssues}. Keep PUSH/POP pairs and stack-changing exits inside one .routine boundary, or split the code into explicit callable routines.`,
    });
  }

  return findings;
}

export function unknownBoundaryFindings(
  directBoundaries: readonly RegisterContractsDirectCall[],
  knownRoutines: ReadonlySet<string>,
): RegisterContractsFinding[] {
  return directBoundaries
    .filter((boundary) => !knownRoutines.has(boundary.targetIdentity ?? boundary.target))
    .map((boundary) => ({
      kind: 'missing_callee_contract',
      callTarget: boundary.target,
      subject: boundary.subject,
      file: boundary.file,
      line: boundary.line,
      column: boundary.column,
      ...(boundary.sourceUnit !== undefined ? { sourceUnit: boundary.sourceUnit } : {}),
      ...(boundary.sourceRelation !== undefined ? { sourceRelation: boundary.sourceRelation } : {}),
      ...(boundary.sourceUnitRelation !== undefined
        ? { sourceUnitRelation: boundary.sourceUnitRelation }
        : {}),
      message: `Register contracts cannot prove ${boundary.subject}; add a routine body or .asmi extern contract.`,
    }));
}

export function declarationContractMismatchFindings(
  routines: readonly RegisterContractsRoutine[],
  bodyInferredSummariesByName: ReadonlyMap<string, RoutineSummary>,
): RegisterContractsFinding[] {
  const findings: RegisterContractsFinding[] = [];
  for (const routine of routines) {
    if (!hasExplicitDeclaredContract(routine.declaredContract)) continue;
    const inferred =
      bodyInferredSummariesByName.get(routine.identity ?? routine.name) ??
      bodyInferredSummariesByName.get(routine.name);
    if (inferred === undefined) continue;
    const carriers = declarationContractMismatchUnits(inferred, routine.declaredContract);
    if (carriers.length === 0) continue;
    const span = routine.directiveSpan ?? {
      sourceName: routine.span.file,
      line: routine.span.start.line,
      column: routine.span.start.column,
      sourceUnit: routine.span.sourceUnit,
      sourceRelation: routine.span.sourceRelation,
      sourceUnitRelation: routine.span.sourceUnitRelation,
    };
    findings.push({
      kind: 'declaration_contract_mismatch',
      routine: routine.name,
      ...(routine.identity !== undefined ? { routineIdentity: routine.identity } : {}),
      carriers,
      file: span.sourceName,
      line: span.line,
      column: span.column,
      ...(span.sourceUnit !== undefined ? { sourceUnit: span.sourceUnit } : {}),
      ...(span.sourceRelation !== undefined ? { sourceRelation: span.sourceRelation } : {}),
      ...(span.sourceUnitRelation !== undefined
        ? { sourceUnitRelation: span.sourceUnitRelation }
        : {}),
      message: declarationContractMismatchMessage(routine.name, carriers),
    });
  }
  return findings;
}

function declarationContractMismatchMessage(
  routine: string,
  carriers: readonly RegisterContractsUnit[],
): string {
  const list = carriers.join(',');
  return `Declared .routine contract for ${routine} treats ${list} as preserved, but the routine body may write ${list}. List ${list} under out, maybe-out, or clobbers, or stop writing ${list} in the body.`;
}

export function diagnosticsForFindings(
  findings: readonly RegisterContractsFinding[],
  mode: AnalyzeRegisterContractsOptions['mode'],
): Diagnostic[] {
  if (mode === 'audit') return [];
  return findings.map((finding) => ({
    severity: mode === 'error' || mode === 'strict' ? 'error' : 'warning',
    code: 'AZMN_REGISTER_CONTRACTS',
    sourceName: finding.file,
    line: finding.line,
    column: finding.column,
    message: finding.message,
  }));
}

function strictStackIssueText(summary: RoutineSummary): string | undefined {
  const issues: string[] = [];
  if (!summary.stackBalanced) issues.push('stack is unbalanced');
  if (summary.hasUnknownStackEffect === true) issues.push('stack effect is unknown');
  return issues.length > 0 ? issues.join('; ') : undefined;
}

export function summariesForAnnotations(
  summariesByName: ReadonlyMap<string, RoutineSummary>,
  outputCandidates: readonly RegisterContractsOutputCandidate[],
): Map<string, RoutineSummary> {
  const summariesForAnnotations = new Map(summariesByName);
  const outputCandidatesByRoutine = outputCandidateUnitsByRoutine(outputCandidates);
  for (const [name, summary] of summariesForAnnotations) {
    const candidates = outputCandidatesByRoutine.get(name) ?? [];
    summariesForAnnotations.set(name, { ...summary, outputCandidates: candidates });
  }
  return summariesForAnnotations;
}

function outputCandidateUnitsByRoutine(
  outputCandidates: readonly RegisterContractsOutputCandidate[],
): Map<string, RegisterContractsUnit[]> {
  const out = new Map<string, RegisterContractsUnit[]>();
  for (const candidate of outputCandidates) {
    const key = candidate.routineIdentity ?? candidate.routine;
    const existing = out.get(key) ?? [];
    for (const unit of candidate.carriers) {
      if (!existing.includes(unit)) existing.push(unit);
    }
    out.set(key, existing);
  }
  return out;
}

export function buildRegisterContractsReportModel(input: {
  entryFile: string;
  mode: AnalyzeRegisterContractsOptions['mode'];
  filePolicies?: Readonly<Record<string, import('./types.js').RegisterContractsPolicyMode>>;
  summaries: readonly RoutineSummary[];
  profileSummaries: readonly RoutineSummary[];
  findings: readonly RegisterContractsFinding[];
  suppressedFindings?: RegisterContractsReportModel['suppressedFindings'];
  conflicts: RegisterContractsReportModel['conflicts'];
  outputCandidates: readonly RegisterContractsOutputCandidate[];
  profile: AnalyzeRegisterContractsOptions['registerContractsProfile'];
  directBoundaries: Parameters<typeof unknownCallList>[0];
  knownRoutines: ReadonlySet<string>;
}): RegisterContractsReportModel {
  return {
    packageVersion,
    ...(packageBuildCommit !== undefined ? { buildCommit: packageBuildCommit } : {}),
    entryFile: input.entryFile,
    mode: input.mode,
    ...(input.filePolicies !== undefined ? { filePolicies: input.filePolicies } : {}),
    summaries: [...input.summaries, ...input.profileSummaries],
    findings: [...input.findings],
    ...(input.suppressedFindings !== undefined && input.suppressedFindings.length > 0
      ? { suppressedFindings: [...input.suppressedFindings] }
      : {}),
    conflicts: [...input.conflicts],
    outputCandidates: [...input.outputCandidates],
    ...(input.profile !== undefined ? { profile: input.profile } : {}),
    unknownCalls: unknownCallList(input.directBoundaries, input.knownRoutines),
  };
}

export function expectedOutputCandidateMap(
  directCalls: readonly RegisterContractsDirectCall[],
  comments: readonly LocatedSmartComment[],
): ReadonlyMap<string, RegisterContractsUnit[]> {
  const out = new Map<string, RegisterContractsUnit[]>();
  for (const call of directCalls) {
    const hint = comments.find(
      (comment) =>
        comment.comment.kind === 'expectOut' &&
        comment.file === call.file &&
        (comment.targetLine ?? comment.line + 1) === call.line &&
        (comment.targetColumn === undefined || comment.targetColumn === call.column),
    );
    if (hint?.comment.kind !== 'expectOut') continue;
    const key = call.targetIdentity ?? call.target;
    const carriers = out.get(key) ?? [];
    for (const carrier of hint.comment.carriers) {
      if (!carriers.includes(carrier)) carriers.push(carrier);
    }
    out.set(key, carriers);
  }
  return out;
}
