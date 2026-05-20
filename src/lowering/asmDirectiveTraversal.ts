import type { AsmOperandNode, ImmExprNode, SourceSpan } from '../frontend/ast.js';
import { evalImmExpr as evalImmExprWithEnv } from '../semantics/env.js';
import type { SectionKind } from './loweringTypes.js';
import type { LoweringContext } from './programLowering.js';

export type AsmDirectiveLikeNode = {
  kind: string;
  span: SourceSpan;
  name?: string;
  value?: ImmExprNode;
  expr?: ImmExprNode;
  directive?: 'db' | 'dw' | 'ds' | 'cstr' | 'pstr' | 'istr';
  values?: unknown[];
  size?: ImmExprNode;
  fill?: ImmExprNode;
  head?: string;
  operands?: AsmOperandNode[];
};

type AsmAddressContext = Pick<
  LoweringContext,
  | 'activeSectionRef'
  | 'baseExprs'
  | 'codeOffsetRef'
  | 'dataOffsetRef'
  | 'evalImmExpr'
  | 'env'
  | 'diagnostics'
>;

type AsmEvalContext = Pick<LoweringContext, 'env' | 'diagnostics'>;

function isKind(item: { kind: string }, ...kinds: string[]): boolean {
  return kinds.includes(item.kind);
}

export function isAsmEquDirective(item: { kind: string }): boolean {
  return isKind(item, 'AsmEqu', 'AsmEquDecl', 'EquDecl');
}

export function isAsmOrgDirective(item: { kind: string }): boolean {
  return isKind(item, 'AsmOrg', 'AsmOrgDirective', 'OrgDirective');
}

export function isAsmAlignDirective(item: { kind: string }): boolean {
  return isKind(item, 'AsmAlign', 'AsmAlignDirective');
}

export function isAsmRawDataDirective(item: { kind: string }): boolean {
  return isKind(item, 'AsmRawData', 'AsmRawDataDecl') || 'valuesText' in item;
}

export function isAsmBinFromDirective(item: { kind: string }): boolean {
  return isKind(item, 'AsmBinFrom', 'AsmBinFromDirective', 'BinFromDirective');
}

export function isAsmBinToDirective(item: { kind: string }): boolean {
  return isKind(item, 'AsmBinTo', 'AsmBinToDirective', 'BinToDirective');
}

export function isAsmEndDirective(item: { kind: string }): boolean {
  return isKind(item, 'AsmEnd', 'AsmEndDirective');
}

export function asmDirectiveExpr(item: AsmDirectiveLikeNode): ImmExprNode | undefined {
  return item.value ?? item.expr;
}

export function activeSectionOffset(ctx: AsmAddressContext): number {
  return ctx.activeSectionRef.current === 'data' ? ctx.dataOffsetRef.current : ctx.codeOffsetRef.current;
}

export function activeSectionAddress(ctx: AsmAddressContext): number | undefined {
  return sectionAddressAtOffset(ctx, ctx.activeSectionRef.current, activeSectionOffset(ctx));
}

export function activeAsmAddress(ctx: AsmAddressContext): number | undefined {
  const section = ctx.activeSectionRef.current;
  const offset = section === 'data' ? ctx.dataOffsetRef.current : ctx.codeOffsetRef.current;
  return sectionAddressAtOffset(ctx, section, offset);
}

export function sectionAddressAtOffset(
  ctx: Pick<AsmAddressContext, 'baseExprs' | 'evalImmExpr' | 'env' | 'diagnostics'>,
  section: SectionKind,
  offset: number,
): number | undefined {
  const baseExpr = section === 'data' ? ctx.baseExprs.data : ctx.baseExprs.code;
  if (!baseExpr) return offset;
  const base = ctx.evalImmExpr(baseExpr, ctx.env, ctx.diagnostics);
  return base === undefined ? undefined : base + offset;
}

export function containsCurrentLocation(expr: ImmExprNode): boolean {
  switch (expr.kind) {
    case 'ImmCurrentLocation':
      return true;
    case 'ImmUnary':
      return containsCurrentLocation(expr.expr);
    case 'ImmBinary':
      return containsCurrentLocation(expr.left) || containsCurrentLocation(expr.right);
    default:
      return false;
  }
}

export function evalAsmImmAtCurrent(
  ctx: AsmEvalContext,
  expr: ImmExprNode,
  currentLocation: number,
): number | undefined {
  return evalImmExprWithEnv(expr, ctx.env, ctx.diagnostics, { currentLocation });
}

export function publishAsmAddressConst(ctx: LoweringContext, name: string, address: number): void {
  ctx.env.equates.set(name, address);
  ctx.env.equates.set(name.toLowerCase(), address);
}
