import type { Diagnostic } from '../model/diagnostic.js';
import type { Expression } from '../model/expression.js';
import type { SourceItem } from '../model/source-item.js';
import type {
  Z80AluMnemonic,
  Z80Instruction,
  Z80Operand,
  Z80Register16,
  Z80Register8,
} from '../z80/instruction.js';
import { parseLogicalLine } from '../syntax/parse-line.js';
import { parseExpression } from '../syntax/parse-expression.js';

type LogicalLineLike = {
  readonly sourceName: string;
  readonly line: number;
  readonly text: string;
};

type OpMatcher =
  | { readonly kind: 'reg8' }
  | { readonly kind: 'imm8' }
  | { readonly kind: 'fixed'; readonly token: string };

interface OpParam {
  readonly name: string;
  readonly matcher: OpMatcher;
}

type OpOperand =
  | { readonly kind: 'reg8'; readonly register: string; readonly text: string }
  | { readonly kind: 'reg16'; readonly register: string; readonly text: string }
  | { readonly kind: 'reg-indirect'; readonly register: 'hl'; readonly text: string }
  | { readonly kind: 'imm'; readonly expression: Expression; readonly text: string };

type OpTemplateOperand =
  | { readonly kind: 'param'; readonly name: string }
  | { readonly kind: 'literal'; readonly operand: OpOperand };

type OpTemplateItem =
  | { readonly kind: 'source-items'; readonly items: readonly SourceItem[] }
  | {
      readonly kind: 'instruction';
      readonly mnemonic: string;
      readonly operands: readonly OpTemplateOperand[];
    };

interface OpDecl {
  readonly name: string;
  readonly params: readonly OpParam[];
  readonly body: readonly OpTemplateItem[];
}

export function collectOps(
  lines: readonly LogicalLineLike[],
  diagnostics: Diagnostic[],
): {
  readonly ops: ReadonlyMap<string, readonly OpDecl[]>;
  readonly opLineIndexes: ReadonlySet<number>;
} {
  const ops = new Map<string, OpDecl[]>();
  const opLineIndexes = new Set<number>();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (isTopLevelEnd(line.text)) {
      break;
    }
    const opHeader = /^op\s+([A-Za-z_][A-Za-z0-9_]*)\s*\((.*)\)\s*$/i.exec(
      stripComment(line.text).trim(),
    );
    if (!opHeader) {
      continue;
    }

    const name = opHeader[1] ?? '';
    const params = parseOpParams(opHeader[2] ?? '', line, diagnostics);
    const paramNames = new Set(params.map((param) => param.name));
    const body: OpTemplateItem[] = [];
    let terminated = false;
    opLineIndexes.add(index);

    for (index += 1; index < lines.length; index += 1) {
      opLineIndexes.add(index);
      const bodyLine = lines[index]!;
      const bodyText = stripComment(bodyLine.text).trim();
      if (/^end\s*$/i.test(bodyText)) {
        terminated = true;
        break;
      }
      const template = parseOpBodyTemplate(bodyLine, paramNames, diagnostics);
      if (template) {
        body.push(template);
      }
    }

    if (!terminated) {
      diagnostics.push(parseDiagnostic(line, `op ${name} missing end`));
    }
    if (params.length > 0 || terminated) {
      const overloads = ops.get(name) ?? [];
      overloads.push({ name, params, body });
      ops.set(name, overloads);
    }
  }

  return { ops, opLineIndexes };
}

export function parseOpInvocation(
  line: LogicalLineLike,
): { readonly name: string; readonly operands: readonly OpOperand[] } | undefined {
  const text = stripComment(line.text).trim();
  const match = /^([A-Za-z_][A-Za-z0-9_]*)(?:\s+(.+))?$/.exec(text);
  if (!match) {
    return undefined;
  }
  const operandText = match[2] ?? '';
  const parts = operandText.trim().length === 0 ? [] : splitOperands(operandText);
  const operands = parts.map((operand) => parseOpOperand(operand));
  if (operands.some((operand) => operand === undefined)) {
    return undefined;
  }
  return { name: match[1] ?? '', operands: operands as OpOperand[] };
}

export function expandOpInvocation(
  overloads: readonly OpDecl[],
  operands: readonly OpOperand[],
  line: LogicalLineLike,
  diagnostics: Diagnostic[],
): readonly SourceItem[] {
  const selection = selectOpOverload(overloads, operands);
  if (selection.kind !== 'selected') {
    diagnostics.push(
      parseDiagnostic(line, formatOpSelectionDiagnostic(selection, overloads, operands)),
    );
    return [];
  }

  const bindings = new Map<string, OpOperand>();
  selection.overload.params.forEach((param, index) => {
    bindings.set(param.name, operands[index]!);
  });

  const expanded: SourceItem[] = [];
  for (const item of selection.overload.body) {
    if (item.kind === 'source-items') {
      expanded.push(...item.items);
      continue;
    }
    const instruction = instantiateTemplateInstruction(item, bindings);
    if (!instruction) {
      diagnostics.push(
        parseDiagnostic(line, `invalid op expansion in "${selection.overload.name}"`),
      );
      continue;
    }
    expanded.push({
      kind: 'instruction',
      instruction,
      span: { sourceName: line.sourceName, line: line.line, column: firstColumn(line.text) },
    });
  }
  return expanded;
}

function parseOpParams(text: string, line: LogicalLineLike, diagnostics: Diagnostic[]): OpParam[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return [];
  }
  const params: OpParam[] = [];
  for (const part of splitOperands(trimmed)) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z][A-Za-z0-9_]*)$/.exec(part.trim());
    if (!match) {
      diagnostics.push(parseDiagnostic(line, `invalid op parameter: ${part.trim()}`));
      continue;
    }
    const matcherText = match[2] ?? '';
    const matcher = parseOpMatcher(matcherText);
    if (!matcher) {
      diagnostics.push(parseDiagnostic(line, `unsupported op matcher: ${matcherText}`));
      continue;
    }
    params.push({ name: match[1] ?? '', matcher });
  }
  return params;
}

function parseOpMatcher(text: string): OpMatcher | undefined {
  if (/^reg8$/i.test(text)) {
    return { kind: 'reg8' };
  }
  if (/^imm8$/i.test(text)) {
    return { kind: 'imm8' };
  }
  if (/^[A-Za-z][A-Za-z0-9_]*$/.test(text)) {
    return { kind: 'fixed', token: text.toUpperCase() };
  }
  return undefined;
}

function parseOpBodyTemplate(
  line: LogicalLineLike,
  paramNames: ReadonlySet<string>,
  diagnostics: Diagnostic[],
): OpTemplateItem | undefined {
  const text = stripComment(line.text).trim();
  if (text.length === 0) {
    return undefined;
  }
  const instruction = /^([A-Za-z]+)(?:\s+(.+))?$/.exec(text);
  if (instruction) {
    const operandText = instruction[2] ?? '';
    const operands =
      operandText.trim().length === 0
        ? []
        : splitOperands(operandText).map((operand) => parseTemplateOperand(operand, paramNames));
    if (operands.every((operand) => operand !== undefined)) {
      if (!operands.some((operand) => operand?.kind === 'param')) {
        const result = parseLogicalLine(line);
        diagnostics.push(...result.diagnostics);
        return result.items.length > 0 ? { kind: 'source-items', items: result.items } : undefined;
      }
      return {
        kind: 'instruction',
        mnemonic: (instruction[1] ?? '').toLowerCase(),
        operands: operands as OpTemplateOperand[],
      };
    }
  }
  const result = parseLogicalLine(line);
  diagnostics.push(...result.diagnostics);
  return result.items.length > 0 ? { kind: 'source-items', items: result.items } : undefined;
}

function parseTemplateOperand(
  text: string,
  paramNames: ReadonlySet<string>,
): OpTemplateOperand | undefined {
  const trimmed = text.trim();
  if (paramNames.has(trimmed)) {
    return { kind: 'param', name: trimmed };
  }
  const operand = parseOpOperand(trimmed);
  return operand ? { kind: 'literal', operand } : undefined;
}

function parseOpOperand(text: string): OpOperand | undefined {
  const trimmed = text.trim();
  if (/^(A|B|C|D|E|H|L)$/i.test(trimmed)) {
    return { kind: 'reg8', register: trimmed.toLowerCase(), text: trimmed.toUpperCase() };
  }
  if (/^(BC|DE|HL|SP)$/i.test(trimmed)) {
    return { kind: 'reg16', register: trimmed.toLowerCase(), text: trimmed.toUpperCase() };
  }
  if (/^\(HL\)$/i.test(trimmed)) {
    return { kind: 'reg-indirect', register: 'hl', text: '(HL)' };
  }
  const expression = parseExpression(trimmed);
  return expression ? { kind: 'imm', expression, text: trimmed } : undefined;
}

type OpSelection =
  | { readonly kind: 'selected'; readonly overload: OpDecl }
  | { readonly kind: 'arity_mismatch' }
  | { readonly kind: 'no_match'; readonly candidates: readonly OpDecl[] }
  | { readonly kind: 'ambiguous'; readonly candidates: readonly OpDecl[] };

function selectOpOverload(
  overloads: readonly OpDecl[],
  operands: readonly OpOperand[],
): OpSelection {
  const arityMatches = overloads.filter((overload) => overload.params.length === operands.length);
  if (arityMatches.length === 0) {
    return { kind: 'arity_mismatch' };
  }
  const matches = arityMatches.filter((overload) =>
    overload.params.every((param, index) => matcherMatchesOperand(param.matcher, operands[index]!)),
  );
  if (matches.length === 0) {
    return { kind: 'no_match', candidates: arityMatches };
  }
  if (matches.length === 1) {
    return { kind: 'selected', overload: matches[0]! };
  }
  const selected = mostSpecificOverload(matches, operands);
  return selected
    ? { kind: 'selected', overload: selected }
    : { kind: 'ambiguous', candidates: matches };
}

function mostSpecificOverload(
  overloads: readonly OpDecl[],
  operands: readonly OpOperand[],
): OpDecl | undefined {
  for (const candidate of overloads) {
    let beatsAll = true;
    for (const other of overloads) {
      if (candidate === other) {
        continue;
      }
      if (compareOverloadSpecificity(candidate, other, operands) !== 'x') {
        beatsAll = false;
        break;
      }
    }
    if (beatsAll) {
      return candidate;
    }
  }
  return undefined;
}

function compareOverloadSpecificity(
  x: OpDecl,
  y: OpDecl,
  operands: readonly OpOperand[],
): 'x' | 'y' | 'equal' | 'incomparable' {
  let xBetter = 0;
  let yBetter = 0;
  for (let index = 0; index < operands.length; index += 1) {
    const comparison = compareMatcherSpecificity(
      x.params[index]!.matcher,
      y.params[index]!.matcher,
      operands[index]!,
    );
    if (comparison === 'x') {
      xBetter += 1;
    } else if (comparison === 'y') {
      yBetter += 1;
    }
  }
  if (xBetter > 0 && yBetter === 0) return 'x';
  if (yBetter > 0 && xBetter === 0) return 'y';
  if (xBetter === 0 && yBetter === 0) return 'equal';
  return 'incomparable';
}

function compareMatcherSpecificity(
  x: OpMatcher,
  y: OpMatcher,
  operand: OpOperand,
): 'x' | 'y' | 'equal' {
  if (x.kind === y.kind) return 'equal';
  if (x.kind === 'fixed' && fixedTokenBeatsMatcher(x, y, operand)) return 'x';
  if (y.kind === 'fixed' && fixedTokenBeatsMatcher(y, x, operand)) return 'y';
  return 'equal';
}

function fixedTokenBeatsMatcher(
  fixed: Extract<OpMatcher, { readonly kind: 'fixed' }>,
  other: OpMatcher,
  operand: OpOperand,
): boolean {
  return other.kind === 'reg8' && operand.kind === 'reg8' && operand.text === fixed.token;
}

function matcherMatchesOperand(matcher: OpMatcher, operand: OpOperand): boolean {
  switch (matcher.kind) {
    case 'reg8':
      return operand.kind === 'reg8';
    case 'imm8':
      return operand.kind === 'imm' && expressionFitsKnownImm8(operand.expression);
    case 'fixed':
      return operand.text.toUpperCase() === matcher.token;
  }
}

function formatOpSelectionDiagnostic(
  selection: Exclude<OpSelection, { readonly kind: 'selected' }>,
  overloads: readonly OpDecl[],
  operands: readonly OpOperand[],
): string {
  const name = overloads[0]?.name ?? '<unknown>';
  switch (selection.kind) {
    case 'arity_mismatch':
      return `No op overload of "${name}" accepts ${operands.length} operand(s). available overloads: ${overloads.map(formatOpSignature).join(', ')}`;
    case 'no_match': {
      const detail = selection.candidates
        .map((candidate) => firstMismatchReason(candidate, operands))
        .filter((reason) => reason !== undefined)
        .join('; ');
      return `No matching op overload for "${name}"; call-site operands: (${operands.map(formatOpOperand).join(', ')}); available overloads: ${selection.candidates.map(formatOpSignature).join(', ')}${detail ? `; ${detail}` : ''}`;
    }
    case 'ambiguous':
      return `Ambiguous op overload for "${name}"; equally specific candidates: ${selection.candidates.map(formatOpSignature).join(', ')}`;
  }
}

function firstMismatchReason(overload: OpDecl, operands: readonly OpOperand[]): string | undefined {
  for (let index = 0; index < overload.params.length; index += 1) {
    const param = overload.params[index]!;
    const operand = operands[index]!;
    if (!matcherMatchesOperand(param.matcher, operand)) {
      return `${param.name}: ${matcherMismatchReason(param.matcher, operand)}`;
    }
  }
  return undefined;
}

function matcherMismatchReason(matcher: OpMatcher, operand: OpOperand): string {
  switch (matcher.kind) {
    case 'reg8':
      return `expects reg8, got ${formatOpOperand(operand)}`;
    case 'imm8':
      return `expects imm8, got ${formatOpOperand(operand)}`;
    case 'fixed':
      return `expects ${matcher.token}, got ${formatOpOperand(operand)}`;
  }
}

function formatOpSignature(op: OpDecl): string {
  return `${op.name}(${op.params.map((param) => `${param.name} ${formatMatcher(param.matcher)}`).join(', ')})`;
}

function formatMatcher(matcher: OpMatcher): string {
  return matcher.kind === 'fixed' ? matcher.token : matcher.kind;
}

function formatOpOperand(operand: OpOperand): string {
  return operand.kind === 'imm' ? operand.text : operand.text.toUpperCase();
}

function instantiateTemplateInstruction(
  item: Extract<OpTemplateItem, { readonly kind: 'instruction' }>,
  bindings: ReadonlyMap<string, OpOperand>,
): Z80Instruction | undefined {
  const operands = item.operands.map((operand) =>
    operand.kind === 'param' ? bindings.get(operand.name) : operand.operand,
  );
  if (operands.some((operand) => operand === undefined)) {
    return undefined;
  }
  const concrete = operands as OpOperand[];
  const mnemonic = item.mnemonic;
  if (mnemonic === 'ld' && concrete.length === 2) {
    const target = toZ80Operand(concrete[0]!);
    const source = toZ80Operand(concrete[1]!);
    return target && source ? { mnemonic: 'ld', target, source } : undefined;
  }
  if (isAluMnemonic(mnemonic) && concrete.length === 1) {
    const source = toZ80Operand(concrete[0]!);
    return source ? { mnemonic, source } : undefined;
  }
  if (isAluMnemonic(mnemonic) && concrete.length === 2 && concrete[0]?.kind === 'reg8') {
    if (concrete[0].register !== 'a') {
      return undefined;
    }
    const source = toZ80Operand(concrete[1]!);
    return source ? { mnemonic, source } : undefined;
  }
  return undefined;
}

function toZ80Operand(operand: OpOperand): Z80Operand | undefined {
  switch (operand.kind) {
    case 'reg8':
      return { kind: 'reg8', register: operand.register as Z80Register8 };
    case 'reg16':
      return { kind: 'reg16', register: operand.register as Z80Register16 };
    case 'reg-indirect':
      return { kind: 'reg-indirect', register: operand.register };
    case 'imm':
      return { kind: 'imm', expression: operand.expression };
  }
}

function isAluMnemonic(mnemonic: string): mnemonic is Z80AluMnemonic {
  return /^(add|adc|sub|sbc|and|or|xor|cp)$/.test(mnemonic);
}

function expressionFitsKnownImm8(expression: Expression): boolean {
  const value = expressionConstantValue(expression);
  return value === undefined || (value >= -0x80 && value <= 0xff);
}

function expressionConstantValue(expression: Expression): number | undefined {
  switch (expression.kind) {
    case 'number':
      return expression.value;
    case 'unary': {
      const value = expressionConstantValue(expression.expression);
      if (value === undefined) return undefined;
      switch (expression.operator) {
        case '+':
          return value;
        case '-':
          return -value;
        case '~':
          return ~value;
      }
    }
    case 'binary': {
      const left = expressionConstantValue(expression.left);
      const right = expressionConstantValue(expression.right);
      if (left === undefined || right === undefined) return undefined;
      switch (expression.operator) {
        case '+':
          return left + right;
        case '-':
          return left - right;
        case '*':
          return left * right;
        case '/':
          return right === 0 ? undefined : Math.trunc(left / right);
        case '%':
          return right === 0 ? undefined : left % right;
        case '&':
          return left & right;
        case '^':
          return left ^ right;
        case '|':
          return left | right;
        case '<<':
          return left << right;
        case '>>':
          return left >> right;
      }
    }
    default:
      return undefined;
  }
}

function splitOperands(text: string): string[] {
  const values: string[] = [];
  let depth = 0;
  let quote: string | undefined;
  let escaped = false;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\' && quote) {
      escaped = true;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = quote === char ? undefined : (quote ?? char);
      continue;
    }
    if (quote) {
      continue;
    }
    if (char === '(') {
      depth += 1;
    } else if (char === ')') {
      depth -= 1;
    } else if (char === ',' && depth === 0) {
      values.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  values.push(text.slice(start).trim());
  return values;
}

function isTopLevelEnd(text: string): boolean {
  return /^(?:\.end|end)\s*$/i.test(stripComment(text).trim());
}

function stripComment(text: string): string {
  const comment = text.indexOf(';');
  return comment === -1 ? text : text.slice(0, comment);
}

function parseDiagnostic(line: LogicalLineLike, message: string): Diagnostic {
  return {
    severity: 'error',
    code: 'AZMN_PARSE',
    message,
    sourceName: line.sourceName,
    line: line.line,
    column: firstColumn(line.text),
  };
}

function firstColumn(text: string): number {
  const match = /\S/.exec(text);
  return match ? match.index + 1 : 1;
}
