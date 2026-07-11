import type { SourceItem } from '../model/source-item.js';
import type { OpMatcher, OpOperand } from './op-operands.js';

export type LogicalLineLike = {
  readonly sourceName: string;
  readonly line: number;
  readonly text: string;
  readonly sourceUnit?: string;
  readonly sourceRelation?: 'entry' | 'include' | 'import';
  readonly sourceUnitRelation?: 'entry' | 'include' | 'import';
};

export interface OpParam {
  readonly name: string;
  readonly matcher: OpMatcher;
}

export type OpTemplateOperand =
  | { readonly kind: 'param'; readonly name: string }
  | { readonly kind: 'port-param'; readonly name: string }
  | { readonly kind: 'literal'; readonly operand: OpOperand };

export type OpTemplateItem =
  | { readonly kind: 'source-items'; readonly items: readonly SourceItem[] }
  | {
      readonly kind: 'instruction';
      readonly mnemonic: string;
      readonly operands: readonly OpTemplateOperand[];
    };

export interface OpDecl {
  readonly name: string;
  readonly isExported?: boolean;
  readonly params: readonly OpParam[];
  readonly body: readonly OpTemplateItem[];
  readonly sourceName: string;
  readonly line: number;
  readonly sourceUnit?: string;
  readonly sourceUnitRelation?: 'entry' | 'include' | 'import';
}

type OpVisibilityContext = Pick<
  LogicalLineLike,
  'sourceName' | 'sourceUnit' | 'sourceUnitRelation'
>;

export function opOverloadsVisibleFrom(
  overloads: readonly OpDecl[],
  context: OpVisibilityContext,
): readonly OpDecl[] {
  const contextUnit = context.sourceUnit ?? context.sourceName;
  return overloads.filter((op) => {
    const declarationUnit = op.sourceUnit ?? op.sourceName;
    return (
      op.isExported === true ||
      op.sourceUnitRelation !== 'import' ||
      declarationUnit === contextUnit
    );
  });
}
