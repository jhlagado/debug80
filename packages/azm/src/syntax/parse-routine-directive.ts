import type { RoutineContractDeclaration } from '../model/register-contract.js';
import type { LogicalLine } from '../source/logical-lines.js';
import type { SourceSpan } from '../source/source-span.js';
import { expandCarrierList } from '../register-contracts/carriers.js';
import { parseLineError } from './parse-diagnostics.js';
import type { ParseLineResult } from './parse-line.js';

type ClauseKind = 'noreturn' | 'in' | 'out' | 'maybe-out' | 'clobbers' | 'preserves';

const CLAUSE_RE = /(?:^|\s)(noreturn|maybe-out|clobbers|preserves|in|out)(?=\s|$)/giu;

function emptyContract(): RoutineContractDeclaration {
  return { in: [], out: [], maybeOut: [], clobbers: [], preserves: [] };
}

function targetFor(
  contract: RoutineContractDeclaration,
  kind: Exclude<ClauseKind, 'noreturn'>,
): RoutineContractDeclaration[keyof RoutineContractDeclaration] {
  return kind === 'maybe-out' ? contract.maybeOut : contract[kind];
}

function carrierTokens(payload: string): readonly string[] | undefined {
  const trimmed = payload.trim();
  if (trimmed.length === 0) return undefined;
  if (trimmed.startsWith('{')) {
    const close = trimmed.indexOf('}');
    if (close < 2) return undefined;
    if (trimmed.slice(close + 1).trim().length > 0) return undefined;
    return trimmed
      .slice(1, close)
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }
  return trimmed
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export function parseContractCarriers(
  payload: string,
): NonNullable<ReturnType<typeof expandCarrierList>> | undefined {
  const tokens = carrierTokens(payload);
  return tokens === undefined ? undefined : expandCarrierList(tokens);
}

function appendUnique(
  target: RoutineContractDeclaration[keyof RoutineContractDeclaration],
  values: NonNullable<ReturnType<typeof expandCarrierList>>,
): void {
  const mutable = target as Array<(typeof values)[number]>;
  for (const value of values) {
    if (!mutable.includes(value)) mutable.push(value);
  }
}

export function parseRoutineDirective(
  line: LogicalLine,
  contractText: string,
  span: SourceSpan,
): ParseLineResult {
  const contract = emptyContract();
  const text = contractText.trim();
  if (text.length === 0) {
    return { items: [{ kind: 'routine', contract, span }], diagnostics: [] };
  }

  const matches = [...text.matchAll(CLAUSE_RE)];
  if (matches.length === 0 || text.slice(0, matches[0]!.index).trim().length > 0) {
    return {
      items: [],
      diagnostics: [parseLineError(line, `invalid .routine contract: ${contractText}`)],
    };
  }

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index]!;
    const kind = match[1]!.toLowerCase() as ClauseKind;
    const payloadStart = match.index + match[0].length;
    const payloadEnd = matches[index + 1]?.index ?? text.length;
    if (kind === 'noreturn') {
      if (text.slice(payloadStart, payloadEnd).trim().length > 0) {
        return {
          items: [],
          diagnostics: [parseLineError(line, 'invalid .routine noreturn clause')],
        };
      }
      (contract as { noreturn?: boolean }).noreturn = true;
      continue;
    }
    const carriers = parseContractCarriers(text.slice(payloadStart, payloadEnd));
    if (carriers === undefined || carriers.length === 0) {
      return {
        items: [],
        diagnostics: [parseLineError(line, `invalid .routine ${kind} carrier list`)],
      };
    }
    appendUnique(targetFor(contract, kind), carriers);
  }

  return { items: [{ kind: 'routine', contract, span }], diagnostics: [] };
}
