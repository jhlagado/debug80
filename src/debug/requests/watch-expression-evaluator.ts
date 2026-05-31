import type { Flags } from '../../z80/types';
import type { Z80Runtime } from '../../z80/runtime';
import type { SourceMapDebugSymbol } from '../session/session-state';
import type {
  WatchEvaluationContext,
  WatchExpression,
  WatchValue,
} from './watch-expression-types';

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

export function evaluateParsedWatchExpression(
  expression: WatchExpression,
  context: WatchEvaluationContext
): WatchValue {
  switch (expression.kind) {
    case 'number':
      return numberValue(expression.value);
    case 'identifier':
      return resolveIdentifier(expression.name, context);
    case 'memory': {
      const address = evaluateParsedWatchExpression(expression.address, context).value;
      return numberValue(readByte(context.runtime!, address));
    }
    case 'unary': {
      const value = evaluateParsedWatchExpression(expression.expression, context).value;
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
      return evaluateBinary(expression.operator, evaluateParsedWatchExpression(expression.left, context), () =>
        evaluateParsedWatchExpression(expression.right, context)
      );
  }
}

export function formatWatchNumber(value: number): string {
  const masked = value & 0xffff;
  return `0x${masked.toString(16).padStart(masked <= 0xff ? 2 : 4, '0')} / ${masked}`;
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
