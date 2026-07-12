import type {
  WatchExpression,
  WatchExpressionToken,
  WatchExpressionTokenKind,
} from './watch-expression-types';

export function parseWatchExpression(tokens: WatchExpressionToken[]): WatchExpression {
  return new WatchExpressionParser(tokens).parse();
}

class WatchExpressionParser {
  private index = 0;

  public constructor(private readonly tokens: WatchExpressionToken[]) {}

  public parse(): WatchExpression {
    const expression = this.parseLogicalOr();
    if (this.peek().kind !== 'end') {
      throw new Error(`Unexpected token "${this.peek().text}".`);
    }
    return expression;
  }

  private parseLogicalOr(): WatchExpression {
    let left = this.parseLogicalAnd();
    while (this.matchKeyword('or')) {
      left = { kind: 'binary', operator: 'or', left, right: this.parseLogicalAnd() };
    }
    return left;
  }

  private parseLogicalAnd(): WatchExpression {
    let left = this.parseComparison();
    while (this.matchKeyword('and')) {
      left = { kind: 'binary', operator: 'and', left, right: this.parseComparison() };
    }
    return left;
  }

  private parseComparison(): WatchExpression {
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
    const symbolicComparison = getSymbolicComparisonOperator(token.text);
    if (token.kind === 'operator' && symbolicComparison !== undefined) {
      this.index += 1;
      left = {
        kind: 'binary',
        operator: symbolicComparison,
        left,
        right: this.parseBitwiseOr(),
      };
    }
    return left;
  }

  private parseBitwiseOr(): WatchExpression {
    let left = this.parseBitwiseXor();
    while (this.matchOperator('|')) {
      left = { kind: 'binary', operator: '|', left, right: this.parseBitwiseXor() };
    }
    return left;
  }

  private parseBitwiseXor(): WatchExpression {
    let left = this.parseBitwiseAnd();
    while (this.matchOperator('^')) {
      left = { kind: 'binary', operator: '^', left, right: this.parseBitwiseAnd() };
    }
    return left;
  }

  private parseBitwiseAnd(): WatchExpression {
    let left = this.parseAdditive();
    while (this.matchOperator('&')) {
      left = { kind: 'binary', operator: '&', left, right: this.parseAdditive() };
    }
    return left;
  }

  private parseAdditive(): WatchExpression {
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

  private parseMultiplicative(): WatchExpression {
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

  private parseUnary(): WatchExpression {
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

  private parsePrimary(): WatchExpression {
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

  private expect(kind: WatchExpressionTokenKind, text: string): void {
    if (this.peek().kind !== kind) {
      throw new Error(`Expected "${text}".`);
    }
    this.index += 1;
  }

  private peek(): WatchExpressionToken {
    return this.tokens[this.index] ?? { kind: 'end', text: '' };
  }
}

function isComparisonKeyword(text: string): boolean {
  return ['eq', 'ne', 'lt', 'le', 'gt', 'ge'].includes(text.toLowerCase());
}

function getSymbolicComparisonOperator(operator: string): string | undefined {
  switch (operator) {
    case '=':
    case '==':
      return 'eq';
    case '<>':
    case '!=':
      return 'ne';
    case '<':
      return 'lt';
    case '<=':
      return 'le';
    case '>':
      return 'gt';
    case '>=':
      return 'ge';
    default:
      return undefined;
  }
}
