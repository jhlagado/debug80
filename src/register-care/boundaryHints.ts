import type { Expression } from '../model/expression.js';
import type { RegisterCareInstruction } from './types.js';

export function precedingCServiceName(
  item: RegisterCareInstruction | undefined,
): string | undefined {
  const instruction = item?.instruction;
  if (!instruction || instruction.mnemonic !== 'ld') return undefined;
  if (instruction.target?.kind !== 'reg8' || instruction.target.register !== 'c') return undefined;
  if (instruction.source.kind === 'imm' && instruction.source.expression.kind === 'symbol') {
    return instruction.source.expression.name;
  }
  return undefined;
}

function evaluateKnownConstant(
  expression: Expression,
  constants: ReadonlyMap<string, number>,
): number | undefined {
  switch (expression.kind) {
    case 'number':
      return expression.value;
    case 'symbol':
      return constants.get(expression.name);
    case 'unary': {
      const value = evaluateKnownConstant(expression.expression, constants);
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
      const left = evaluateKnownConstant(expression.left, constants);
      const right = evaluateKnownConstant(expression.right, constants);
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
    case 'byte-function': {
      const value = evaluateKnownConstant(expression.expression, constants);
      if (value === undefined) return undefined;
      return expression.function === 'LSB' ? value & 0xff : (value >> 8) & 0xff;
    }
    default:
      return undefined;
  }
}

export function precedingRegisterImmediateValue(
  item: RegisterCareInstruction | undefined,
  register: string,
): number | undefined {
  const instruction = item?.instruction;
  if (!instruction || instruction.mnemonic !== 'ld') return undefined;
  if (
    instruction.target?.kind !== 'reg8' ||
    instruction.target.register !== register.toLowerCase()
  ) {
    return undefined;
  }
  if (instruction.source.kind !== 'imm') return undefined;
  return evaluateKnownConstant(instruction.source.expression, item.constants ?? new Map());
}
