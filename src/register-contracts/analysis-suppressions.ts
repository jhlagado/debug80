import type { Diagnostic } from '../model/diagnostic.js';
import type { SourceItem } from '../model/source-item.js';
import { registerContractsPolicyModeForFile } from './policy.js';
import type {
  AnalyzeRegisterContractsOptions,
  LocatedSmartComment,
  RegisterContractsFinding,
  RegisterContractsOutputCandidate,
  RegisterContractsPolicyMode,
  RegisterContractsSuppressedFinding,
  RegisterContractsSuppression,
} from './types.js';

export function findingKey(finding: {
  file: string;
  line: number;
  column: number;
  kind?: string;
}): string {
  return `${finding.kind ?? ''}:${finding.file}:${finding.line}:${finding.column}`;
}

export function matchOutputCandidateSuppressions(
  candidates: readonly RegisterContractsOutputCandidate[],
  suppressions: readonly RegisterContractsSuppression[],
  consumed: Set<RegisterContractsSuppression>,
): ReadonlyMap<string, RegisterContractsSuppression> {
  const matches = new Map<string, RegisterContractsSuppression>();
  for (const candidate of candidates) {
    const suppression = suppressions.find(
      (item) =>
        !consumed.has(item) &&
        item.file === candidate.file &&
        item.line === candidate.line &&
        item.column === candidate.column &&
        item.findingKind === 'output_candidate',
    );
    if (suppression === undefined) continue;
    consumed.add(suppression);
    matches.set(findingKey({ ...candidate, kind: 'output_candidate' }), suppression);
  }
  return matches;
}

export function registerContractsDirectiveComments(
  items: readonly SourceItem[],
): LocatedSmartComment[] {
  const out: LocatedSmartComment[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    if (item.kind !== 'expect-out') continue;
    const instruction = nextAttachedInstruction(items, index, item.span.sourceName);
    if (instruction === undefined) continue;
    const span = effectiveInstructionSpan(instruction);
    out.push({
      file: item.span.sourceName,
      line: item.span.line,
      targetLine: span.line,
      targetColumn: span.column,
      comment: { kind: 'expectOut', carriers: [...item.carriers] },
    });
  }
  return out;
}

export function registerContractsDirectiveSuppressions(
  items: readonly SourceItem[],
): RegisterContractsSuppression[] {
  const out: RegisterContractsSuppression[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]!;
    if (item.kind !== 'rc-ignore') continue;
    const instruction = nextAttachedInstruction(items, index, item.span.sourceName);
    if (instruction === undefined) continue;
    const span = effectiveInstructionSpan(instruction);
    out.push({
      file: span.sourceName,
      line: span.line,
      column: span.column,
      findingKind: item.findingKind as RegisterContractsSuppression['findingKind'],
      reason: item.reason,
      directiveLine: item.span.line,
      directiveColumn: item.span.column,
    });
  }
  return out;
}

function nextAttachedInstruction(
  items: readonly SourceItem[],
  index: number,
  sourceName: string,
): Extract<SourceItem, { readonly kind: 'instruction' }> | undefined {
  for (let next = index + 1; next < items.length; next += 1) {
    const candidate = items[next]!;
    if (
      candidate.kind === 'comment' ||
      candidate.kind === 'rc-ignore' ||
      candidate.kind === 'expect-out'
    )
      continue;
    return candidate.kind === 'instruction' &&
      effectiveInstructionSpan(candidate).sourceName === sourceName
      ? candidate
      : undefined;
  }
  return undefined;
}

function effectiveInstructionSpan(
  instruction: Extract<SourceItem, { readonly kind: 'instruction' }>,
): Extract<SourceItem, { readonly kind: 'instruction' }>['span'] {
  return instruction.emittedSource?.span ?? instruction.span;
}

export function applyRegisterContractsSuppressions(
  findings: readonly RegisterContractsFinding[],
  suppressions: readonly RegisterContractsSuppression[],
  consumed: Set<RegisterContractsSuppression>,
): {
  activeFindings: RegisterContractsFinding[];
  suppressedFindings: RegisterContractsSuppressedFinding[];
} {
  const suppressedFindings: RegisterContractsSuppressedFinding[] = [];
  const activeFindings: RegisterContractsFinding[] = [];
  for (const finding of findings) {
    const suppression = suppressions.find(
      (item) =>
        !consumed.has(item) &&
        item.file === finding.file &&
        item.line === finding.line &&
        item.column === finding.column &&
        item.findingKind === finding.kind,
    );
    if (suppression === undefined) activeFindings.push(finding);
    else {
      consumed.add(suppression);
      suppressedFindings.push({ finding, suppression });
    }
  }
  return { activeFindings, suppressedFindings };
}

export function staleSuppressionDiagnostics(
  suppressions: readonly RegisterContractsSuppression[],
  options: AnalyzeRegisterContractsOptions,
  sourcePolicy: ReadonlyMap<string, RegisterContractsPolicyMode>,
): Diagnostic[] {
  return suppressions.map((suppression) => {
    const mode = registerContractsPolicyModeForFile(
      suppression.file,
      options.policy ?? {},
      options.mode,
      sourcePolicy.get(suppression.file),
    );
    return {
      severity: mode === 'strict' ? 'error' : 'warning',
      code: 'AZMN_REGISTER_CONTRACTS',
      sourceName: suppression.file,
      line: suppression.directiveLine ?? suppression.line,
      column: suppression.directiveColumn ?? suppression.column,
      message: `stale .rcignore for ${suppression.findingKind}: no matching finding was produced`,
    };
  });
}
