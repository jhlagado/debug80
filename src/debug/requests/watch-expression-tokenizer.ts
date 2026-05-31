import type { WatchExpressionToken } from './watch-expression-types';

export function tokenizeWatchExpression(input: string): WatchExpressionToken[] {
  const tokens: WatchExpressionToken[] = [];
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
    const twoCharOperator = scanTwoCharOperator(rest);
    if (twoCharOperator !== undefined) {
      tokens.push({ kind: 'operator', text: twoCharOperator });
      index += twoCharOperator.length;
      continue;
    }
    if ('+-*/%&|^~=<>'.includes(char)) {
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

function scanTwoCharOperator(text: string): string | undefined {
  return ['==', '<>', '!=', '<=', '>='].find((operator) => text.startsWith(operator));
}
