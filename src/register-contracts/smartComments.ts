import type {
  LocatedSmartComment,
  RegisterContractsRoutine,
  RoutineContract,
  SmartComment,
} from './types.js';
import { parseSmartCommentLine, parseSmartCommentLines } from './smartCommentParsing.js';

export { parseSmartCommentLine, parseSmartCommentLines };

export function parseSmartComments(
  sourceLineComments: ReadonlyMap<string, ReadonlyMap<number, string>>,
): LocatedSmartComment[] {
  const out: LocatedSmartComment[] = [];
  for (const [file, comments] of sourceLineComments) {
    for (const [line, text] of comments) {
      for (const parsed of parseSmartCommentLines(`;${text}`)) {
        out.push({ file, line, comment: parsed });
      }
    }
  }

  return out.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file)));
}

function appendUnique<T>(items: T[], values: readonly T[]): void {
  for (const value of values) {
    if (!items.includes(value)) {
      items.push(value);
    }
  }
}

function applyContractComment(contract: RoutineContract, comment: SmartComment): void {
  if (comment.kind === 'in') appendUnique(contract.in, comment.carriers);
  if (comment.kind === 'out') appendUnique(contract.out, comment.carriers);
  if (comment.kind === 'clobbers') appendUnique(contract.clobbers, comment.carriers);
  if (comment.kind === 'preserves') appendUnique(contract.preserves, comment.carriers);
}

export function buildDeclaredRoutineContracts(
  routines: readonly RegisterContractsRoutine[],
): Map<string, RoutineContract> {
  const contracts = new Map<string, RoutineContract>();
  for (const routine of routines) {
    const declared = routine.declaredContract;
    if (
      declared !== undefined &&
      (declared.in.length > 0 ||
        declared.out.length > 0 ||
        declared.clobbers.length > 0 ||
        declared.preserves.length > 0)
    ) {
      const identity = routine.identity ?? routine.name;
      contracts.set(identity, {
        name: identity,
        in: [...declared.in],
        out: [...declared.out],
        clobbers: [...declared.clobbers],
        preserves: [...declared.preserves],
      });
    }
  }

  return contracts;
}

export function buildRoutineContracts(
  comments: LocatedSmartComment[],
): Map<string, RoutineContract> {
  const contracts = new Map<string, RoutineContract>();
  let current: RoutineContract | undefined;

  for (const item of comments) {
    if (item.comment.kind === 'extern') {
      current = {
        name: item.comment.name,
        in: [],
        out: [],
        clobbers: [],
        preserves: [],
      };
      contracts.set(item.comment.name, current);
      continue;
    }
    if (item.comment.kind === 'end') {
      current = undefined;
      continue;
    }
    if (current !== undefined) {
      applyContractComment(current, item.comment);
    }
  }

  return contracts;
}
