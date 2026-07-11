import { renderRegisterContractsRoutineDirective } from './report.js';
import { joinSourceLines, splitSourceLines } from './sourceText.js';
import type { RegisterContractsRoutine, RoutineSummary } from './types.js';

interface RegisterContractsAnnotatedFile {
  path: string;
  text: string;
}

interface RegisterContractsAnnotationInput {
  routine: RegisterContractsRoutine;
  summary: RoutineSummary;
}

function rewriteRoutineDirective(line: string, directive: string): string {
  const indent = /^\s*/u.exec(line)?.[0] ?? '';
  const semicolon = line.indexOf(';');
  const trailingComment = semicolon >= 0 ? line.slice(semicolon).trimEnd() : '';
  return `${indent}${directive}${trailingComment.length > 0 ? ` ${trailingComment}` : ''}`;
}

function annotateFile(
  source: string,
  routines: readonly RegisterContractsAnnotationInput[],
): string {
  const sourceLines = splitSourceLines(source);
  const { lines } = sourceLines;
  for (const item of routines) {
    const span = item.routine.directiveSpan;
    if (span === undefined) continue;
    const index = span.line - 1;
    const existing = lines[index];
    if (existing === undefined || !/^\s*\.routine(?:\s|;|$)/iu.test(existing)) continue;
    lines[index] = rewriteRoutineDirective(
      existing,
      renderRegisterContractsRoutineDirective(item.summary, item.routine.declaredContract),
    );
  }
  return joinSourceLines(sourceLines);
}

export function annotateRegisterContractsContracts(
  sourceTexts: ReadonlyMap<string, string>,
  routines: readonly RegisterContractsAnnotationInput[],
): RegisterContractsAnnotatedFile[] {
  const byFile = new Map<string, RegisterContractsAnnotationInput[]>();
  for (const item of routines) {
    const file = item.routine.directiveSpan?.sourceName;
    if (file === undefined || !sourceTexts.has(file)) continue;
    const entries = byFile.get(file) ?? [];
    entries.push(item);
    byFile.set(file, entries);
  }

  const out: RegisterContractsAnnotatedFile[] = [];
  for (const [path, items] of byFile) {
    const source = sourceTexts.get(path);
    if (source === undefined) continue;
    const text = annotateFile(source, items);
    if (text !== source) out.push({ path, text });
  }
  return out.sort((left, right) => left.path.localeCompare(right.path));
}
