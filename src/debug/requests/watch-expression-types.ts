import type { SourceMapDebugSymbol } from '../session/session-state';
import type { Z80Runtime } from '../../z80/runtime';

export type WatchExpressionTokenKind =
  | 'number'
  | 'identifier'
  | 'operator'
  | 'leftParen'
  | 'rightParen'
  | 'leftBracket'
  | 'rightBracket'
  | 'end';

export interface WatchExpressionToken {
  kind: WatchExpressionTokenKind;
  text: string;
  value?: number;
}

export type WatchExpression =
  | { kind: 'number'; value: number }
  | { kind: 'identifier'; name: string }
  | { kind: 'memory'; address: WatchExpression }
  | { kind: 'unary'; operator: '+' | '-' | '~' | 'not'; expression: WatchExpression }
  | { kind: 'binary'; operator: string; left: WatchExpression; right: WatchExpression };

export interface WatchValue {
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
