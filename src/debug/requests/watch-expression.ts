import type { DebugProtocol } from '@vscode/debugprotocol';
import type { SourceMapDebugSymbol } from '../session/session-state';
import type { Z80Runtime } from '../../z80/runtime';
import type { Flags } from '../../z80/types';

type TokenKind =
  | 'number'
  | 'identifier'
  | 'operator'
  | 'leftParen'
  | 'rightParen'
  | 'leftBracket'
  | 'rightBracket'
  | 'end';

interface Token {
  kind: TokenKind;
  text: string;
  value?: number;
}

type Expr =
  | { kind: 'number'; value: number }
  | { kind: 'identifier'; name: string }
  | { kind: 'memory'; address: Expr }
  | { kind: 'unary'; operator: '+' | '-' | '~' | 'not'; expression: Expr }
  | { kind: 'binary'; operator: string; left: Expr; right: Expr };

interface WatchValue {
  value: number;
  preferred: 'number' | 'boolean';
}

export interface WatchEvaluationContext {
  runtime: Z80Runtime | undefined;
  symbols: SourceMapDebugSymbol[];
}

export interface WatchEvaluationResult {
  result: string;
  type: string;
}

const REGISTER_NAMES = new Set([
  'A',
  'F',
  'AF',
  'B',
  'C',
  'BC',
  'D',
  'E',
  'DE',
  'H',
  'L',
  'HL',
  'IX',
  'IXH',
  'IXL',
  'IY',
  'IYH',
  'IYL',
  'SP',
  'SPH',
  'SPL',
  'PC',
  'I',
  'R',
  "A'",
  "F'",
  "AF'",
  "B'",
  "C'",
  "BC'",
  "D'",
  "E'",
  "DE'",
  "H'",
  "L'",
  "HL'",
]);

const FLAG_NAMES = new Map<string, keyof Flags>([
  ['carry', 'C'],
  ['zero', 'Z'],
  ['sign', 'S'],
  ['parity', 'P'],
  ['halfcarry', 'H'],
]);

export function evaluateWatchExpression(
  expression: string,
  context: WatchEvaluationContext
): WatchEvaluationResult {
  if (context.runtime === undefined) {
    throw new Error('No active Debug80 runtime.');
  }
  const ast = new WatchExpressionParser(tokenize(expression)).parse();
  const value = evaluate(ast, context);
  return {
    result:
      value.preferred === 'boolean'
        ? value.value === 0
          ? 'false'
          : 'true'
        : formatWatchNumber(value.value),
    type: value.preferred === 'boolean' ? 'boolean' : 'number',
  };
}

export function evaluateWatchExpressionTruthy(
  expression: string,
  context: WatchEvaluationContext
): boolean {
  if (context.runtime === undefined) {
    throw new Error('No active Debug80 runtime.');
  }
  const ast = new WatchExpressionParser(tokenize(expression)).parse();
  return evaluate(ast, context).value !== 0;
}

export function buildEvaluateResponseBody(
  expression: string,
  context: WatchEvaluationContext
): DebugProtocol.EvaluateResponse['body'] {
  const value = evaluateWatchExpression(expression, context);
  return {
    result: value.result,
    type: value.type,
    variablesReference: 0,
  };
}

class WatchExpressionParser {
  private index = 0;

  public constructor(private readonly tokens: Token[]) {}

  public parse(): Expr {
    const expression = this.parseLogicalOr();
    if (this.peek().kind !== 'end') {
      throw new Error(`Unexpected token "${this.peek().text}".`);
    }
    return expression;
  }

  private parseLogicalOr(): Expr {
    let left = this.parseLogicalAnd();
    while (this.matchKeyword('or')) {
      left = { kind: 'binary', operator: 'or', left, right: this.parseLogicalAnd() };
    }
    return left;
  }

  private parseLogicalAnd(): Expr {
    let left = this.parseComparison();
    while (this.matchKeyword('and')) {
      left = { kind: 'binary', operator: 'and', left, right: this.parseComparison() };
    }
    return left;
  }

  private parseComparison(): Expr {
    let left = this.parseBitwiseOr();
    const token = this.peek();
    if (token.kind === 'identifier' && isComparisonKeyword(token.text)) {
      this.index += 1;
      left = {
        kind: 'binary',
        operator: token.text.toLowerCase(),
        left,
        right: this.parseBitwiseOr(),
      };
    }
    return left;
  }

  private parseBitwiseOr(): Expr {
    let left = this.parseBitwiseXor();
    while (this.matchOperator('|')) {
      left = { kind: 'binary', operator: '|', left, right: this.parseBitwiseXor() };
    }
    return left;
  }

  private parseBitwiseXor(): Expr {
    let left = this.parseBitwiseAnd();
    while (this.matchOperator('^')) {
      left = { kind: 'binary', operator: '^', left, right: this.parseBitwiseAnd() };
    }
    return left;
  }

  private parseBitwiseAnd(): Expr {
    let left = this.parseAdditive();
    while (this.matchOperator('&')) {
      left = { kind: 'binary', operator: '&', left, right: this.parseAdditive() };
    }
    return left;
  }

  private parseAdditive(): Expr {
    let left = this.parseMultiplicative();
    let matched = true;
    while (matched) {
      matched = false;
      if (this.matchOperator('+')) {
        left = { kind: 'binary', operator: '+', left, right: this.parseMultiplicative() };
        matched = true;
      } else if (this.matchOperator('-')) {
        left = { kind: 'binary', operator: '-', left, right: this.parseMultiplicative() };
        matched = true;
      }
    }
    return left;
  }

  private parseMultiplicative(): Expr {
    let left = this.parseUnary();
    let matched = true;
    while (matched) {
      matched = false;
      if (this.matchOperator('*')) {
        left = { kind: 'binary', operator: '*', left, right: this.parseUnary() };
        matched = true;
      } else if (this.matchOperator('/')) {
        left = { kind: 'binary', operator: '/', left, right: this.parseUnary() };
        matched = true;
      } else if (this.matchOperator('%')) {
        left = { kind: 'binary', operator: '%', left, right: this.parseUnary() };
        matched = true;
      }
    }
    return left;
  }

  private parseUnary(): Expr {
    if (this.matchKeyword('not')) {
      return { kind: 'unary', operator: 'not', expression: this.parseUnary() };
    }
    if (this.matchOperator('+')) {
      return { kind: 'unary', operator: '+', expression: this.parseUnary() };
    }
    if (this.matchOperator('-')) {
      return { kind: 'unary', operator: '-', expression: this.parseUnary() };
    }
    if (this.matchOperator('~')) {
      return { kind: 'unary', operator: '~', expression: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Expr {
    const token = this.peek();
    if (token.kind === 'number') {
      this.index += 1;
      return { kind: 'number', value: token.value ?? 0 };
    }
    if (token.kind === 'identifier') {
      this.index += 1;
      return { kind: 'identifier', name: token.text };
    }
    if (token.kind === 'leftParen') {
      this.index += 1;
      const expression = this.parseLogicalOr();
      this.expect('rightParen', ')');
      return expression;
    }
    if (token.kind === 'leftBracket') {
      this.index += 1;
      const address = this.parseLogicalOr();
      this.expect('rightBracket', ']');
      return { kind: 'memory', address };
    }
    throw new Error(`Unexpected token "${token.text}".`);
  }

  private matchOperator(operator: string): boolean {
    if (this.peek().kind === 'operator' && this.peek().text === operator) {
      this.index += 1;
      return true;
    }
    return false;
  }

  private matchKeyword(keyword: string): boolean {
    if (this.peek().kind === 'identifier' && this.peek().text.toLowerCase() === keyword) {
      this.index += 1;
      return true;
    }
    return false;
  }

  private expect(kind: TokenKind, text: string): void {
    if (this.peek().kind !== kind) {
      throw new Error(`Expected "${text}".`);
    }
    this.index += 1;
  }

  private peek(): Token {
    return this.tokens[this.index] ?? { kind: 'end', text: '' };
  }
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < input.length) {
    const rest = input.slice(index);
    const char = input[index] ?? '';
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    const number = scanNumber(rest);
    if (number !== undefined) {
      tokens.push({ kind: 'number', text: rest.slice(0, number.length), value: number.value });
      index += number.length;
      continue;
    }
    const identifier = /^(?:[A-Za-z_.@$?][A-Za-z0-9_.@$?]*'?)/.exec(rest);
    if (identifier) {
      tokens.push({ kind: 'identifier', text: identifier[0] });
      index += identifier[0].length;
      continue;
    }
    if (char === '(') {
      tokens.push({ kind: 'leftParen', text: char });
      index += 1;
      continue;
    }
    if (char === ')') {
      tokens.push({ kind: 'rightParen', text: char });
      index += 1;
      continue;
    }
    if (char === '[') {
      tokens.push({ kind: 'leftBracket', text: char });
      index += 1;
      continue;
    }
    if (char === ']') {
      tokens.push({ kind: 'rightBracket', text: char });
      index += 1;
      continue;
    }
    if ('+-*/%&|^~'.includes(char)) {
      tokens.push({ kind: 'operator', text: char });
      index += 1;
      continue;
    }
    throw new Error(`Unexpected character "${char}".`);
  }
  tokens.push({ kind: 'end', text: '' });
  return tokens;
}

function scanNumber(text: string): { value: number; length: number } | undefined {
  const prefixedHex = /^\$[0-9A-Fa-f]+/.exec(text);
  if (prefixedHex) {
    return { value: Number.parseInt(prefixedHex[0].slice(1), 16), length: prefixedHex[0].length };
  }
  const trailingHex = /^[0-9][0-9A-Fa-f]*[Hh]\b/.exec(text);
  if (trailingHex) {
    return {
      value: Number.parseInt(trailingHex[0].slice(0, -1), 16),
      length: trailingHex[0].length,
    };
  }
  const percentBinary = /^%[01]+/.exec(text);
  if (percentBinary) {
    return {
      value: Number.parseInt(percentBinary[0].slice(1), 2),
      length: percentBinary[0].length,
    };
  }
  const prefixedBinary = /^0b[01]+/i.exec(text);
  if (prefixedBinary) {
    return {
      value: Number.parseInt(prefixedBinary[0].slice(2), 2),
      length: prefixedBinary[0].length,
    };
  }
  const cStyleHex = /^0x[0-9A-Fa-f]+/i.exec(text);
  if (cStyleHex) {
    return { value: Number.parseInt(cStyleHex[0].slice(2), 16), length: cStyleHex[0].length };
  }
  const decimal = /^[0-9]+/.exec(text);
  if (decimal) {
    return { value: Number.parseInt(decimal[0], 10), length: decimal[0].length };
  }
  return undefined;
}

function isComparisonKeyword(text: string): boolean {
  return ['eq', 'ne', 'lt', 'le', 'gt', 'ge'].includes(text.toLowerCase());
}

function evaluate(expression: Expr, context: WatchEvaluationContext): WatchValue {
  switch (expression.kind) {
    case 'number':
      return numberValue(expression.value);
    case 'identifier':
      return resolveIdentifier(expression.name, context);
    case 'memory': {
      const address = evaluate(expression.address, context).value;
      return numberValue(readByte(context.runtime!, address));
    }
    case 'unary': {
      const value = evaluate(expression.expression, context).value;
      if (expression.operator === 'not') {
        return booleanValue(value === 0);
      }
      if (expression.operator === '-') {
        return numberValue(-value);
      }
      if (expression.operator === '~') {
        return numberValue(~value);
      }
      return numberValue(value);
    }
    case 'binary':
      return evaluateBinary(expression.operator, evaluate(expression.left, context), () =>
        evaluate(expression.right, context)
      );
  }
}

function evaluateBinary(operator: string, left: WatchValue, rightThunk: () => WatchValue): WatchValue {
  if (operator === 'and') {
    return left.value === 0 ? booleanValue(false) : booleanValue(rightThunk().value !== 0);
  }
  if (operator === 'or') {
    return left.value !== 0 ? booleanValue(true) : booleanValue(rightThunk().value !== 0);
  }
  const right = rightThunk();
  switch (operator) {
    case 'eq':
      return booleanValue(left.value === right.value);
    case 'ne':
      return booleanValue(left.value !== right.value);
    case 'lt':
      return booleanValue(left.value < right.value);
    case 'le':
      return booleanValue(left.value <= right.value);
    case 'gt':
      return booleanValue(left.value > right.value);
    case 'ge':
      return booleanValue(left.value >= right.value);
    case '+':
      return numberValue(left.value + right.value);
    case '-':
      return numberValue(left.value - right.value);
    case '*':
      return numberValue(left.value * right.value);
    case '/':
      if (right.value === 0) {
        throw new Error('Division by zero.');
      }
      return numberValue(Math.trunc(left.value / right.value));
    case '%':
      if (right.value === 0) {
        throw new Error('Modulo by zero.');
      }
      return numberValue(left.value % right.value);
    case '&':
      return numberValue(left.value & right.value);
    case '|':
      return numberValue(left.value | right.value);
    case '^':
      return numberValue(left.value ^ right.value);
    default:
      throw new Error(`Unsupported operator "${operator}".`);
  }
}

function resolveIdentifier(name: string, context: WatchEvaluationContext): WatchValue {
  const lower = name.toLowerCase();
  const flag = FLAG_NAMES.get(lower);
  if (flag !== undefined) {
    return { value: context.runtime!.getRegisters().flags[flag] ? 1 : 0, preferred: 'boolean' };
  }
  const registerValue = readRegister(name, context.runtime!);
  if (registerValue !== undefined) {
    return numberValue(registerValue);
  }
  const symbol = findSymbol(name, context.symbols);
  if (symbol !== undefined) {
    return numberValue(symbol.address ?? symbol.value ?? 0);
  }
  throw new Error(`Unknown Debug80 expression name "${name}".`);
}

function readRegister(name: string, runtime: Z80Runtime): number | undefined {
  const regs = runtime.getRegisters();
  const upper = name.toUpperCase();
  if (!REGISTER_NAMES.has(upper)) {
    return undefined;
  }
  const flags = flagsToByte(regs.flags);
  const flagsPrime = flagsToByte(regs.flags_prime);
  switch (upper) {
    case 'A':
      return regs.a & 0xff;
    case 'F':
      return flags;
    case 'AF':
      return word(regs.a, flags);
    case 'B':
      return regs.b & 0xff;
    case 'C':
      return regs.c & 0xff;
    case 'BC':
      return word(regs.b, regs.c);
    case 'D':
      return regs.d & 0xff;
    case 'E':
      return regs.e & 0xff;
    case 'DE':
      return word(regs.d, regs.e);
    case 'H':
      return regs.h & 0xff;
    case 'L':
      return regs.l & 0xff;
    case 'HL':
      return word(regs.h, regs.l);
    case 'IX':
      return regs.ix & 0xffff;
    case 'IXH':
      return (regs.ix >>> 8) & 0xff;
    case 'IXL':
      return regs.ix & 0xff;
    case 'IY':
      return regs.iy & 0xffff;
    case 'IYH':
      return (regs.iy >>> 8) & 0xff;
    case 'IYL':
      return regs.iy & 0xff;
    case 'SP':
      return regs.sp & 0xffff;
    case 'SPH':
      return (regs.sp >>> 8) & 0xff;
    case 'SPL':
      return regs.sp & 0xff;
    case 'PC':
      return runtime.getPC() & 0xffff;
    case 'I':
      return regs.i & 0xff;
    case 'R':
      return regs.r & 0xff;
    case "A'":
      return regs.a_prime & 0xff;
    case "F'":
      return flagsPrime;
    case "AF'":
      return word(regs.a_prime, flagsPrime);
    case "B'":
      return regs.b_prime & 0xff;
    case "C'":
      return regs.c_prime & 0xff;
    case "BC'":
      return word(regs.b_prime, regs.c_prime);
    case "D'":
      return regs.d_prime & 0xff;
    case "E'":
      return regs.e_prime & 0xff;
    case "DE'":
      return word(regs.d_prime, regs.e_prime);
    case "H'":
      return regs.h_prime & 0xff;
    case "L'":
      return regs.l_prime & 0xff;
    case "HL'":
      return word(regs.h_prime, regs.l_prime);
    default:
      return undefined;
  }
}

function findSymbol(name: string, symbols: SourceMapDebugSymbol[]): SourceMapDebugSymbol | undefined {
  return (
    symbols.find((symbol) => symbol.name === name) ??
    symbols.find((symbol) => symbol.name.toLowerCase() === name.toLowerCase())
  );
}

function readByte(runtime: Z80Runtime, address: number): number {
  const masked = address & 0xffff;
  if (runtime.hardware.memRead) {
    return runtime.hardware.memRead(masked) & 0xff;
  }
  return runtime.hardware.memory[masked] ?? 0;
}

function flagsToByte(flags: Flags): number {
  return (
    (flags.S << 7) |
    (flags.Z << 6) |
    (flags.Y << 5) |
    (flags.H << 4) |
    (flags.X << 3) |
    (flags.P << 2) |
    (flags.N << 1) |
    flags.C
  );
}

function word(high: number, low: number): number {
  return ((high & 0xff) << 8) | (low & 0xff);
}

function numberValue(value: number): WatchValue {
  return { value: value & 0xffff, preferred: 'number' };
}

function booleanValue(value: boolean): WatchValue {
  return { value: value ? 1 : 0, preferred: 'boolean' };
}

function formatWatchNumber(value: number): string {
  const masked = value & 0xffff;
  return `0x${masked.toString(16).padStart(masked <= 0xff ? 2 : 4, '0')} / ${masked}`;
}
