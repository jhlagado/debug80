import type { DebugProtocol } from '@vscode/debugprotocol';
import { evaluateParsedWatchExpression, formatWatchNumber } from './watch-expression-evaluator';
import { parseWatchExpression } from './watch-expression-parser';
import { tokenizeWatchExpression } from './watch-expression-tokenizer';
import type { WatchEvaluationContext, WatchEvaluationResult } from './watch-expression-types';

export type { WatchEvaluationContext, WatchEvaluationResult } from './watch-expression-types';

export function evaluateWatchExpression(
  expression: string,
  context: WatchEvaluationContext
): WatchEvaluationResult {
  if (context.runtime === undefined) {
    throw new Error('No active Debug80 runtime.');
  }
  const ast = parseWatchExpression(tokenizeWatchExpression(expression));
  const value = evaluateParsedWatchExpression(ast, context);
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
  const ast = parseWatchExpression(tokenizeWatchExpression(expression));
  return evaluateParsedWatchExpression(ast, context).value !== 0;
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
