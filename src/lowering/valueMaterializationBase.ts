import type { SourceSpan, TypeExprNode } from '../frontend/ast.js';
import type { EaResolution } from './eaResolution.js';
import type { ValueMaterializationContext } from './valueMaterializationContext.js';

/**
 * Resolved absolute EA → HL and record/union field offsets.
 */
export function createRuntimeAddressBaseMaterialization(ctx: ValueMaterializationContext) {
  const fieldOffsetInBaseType = (
    baseType: TypeExprNode,
    fieldName: string,
    span: SourceSpan,
  ): number | undefined => {
    const agg = ctx.resolveAggregateType(baseType);
    if (!agg) {
      const known = ctx.sizeOfTypeExpr(baseType) !== undefined || ctx.resolveScalarKind(baseType) !== undefined;
      ctx.diagAt(
        ctx.diagnostics,
        span,
        known
          ? `Field access ".${fieldName}" requires a record or union type.`
          : `Unknown reinterpret cast type "${baseType.kind === 'TypeName' ? baseType.name : 'type'}".`,
      );
      return undefined;
    }

    let offset = 0;
    for (const field of agg.fields) {
      if (field.name === fieldName) return offset;
      if (agg.kind === 'record') {
        const fieldSize = ctx.sizeOfTypeExpr(field.typeExpr);
        if (fieldSize === undefined) return undefined;
        offset += fieldSize;
      }
    }

    ctx.diagAt(
      ctx.diagnostics,
      span,
      `${agg.kind === 'union' ? 'Unknown union field' : 'Unknown record field'} "${fieldName}".`,
    );
    return undefined;
  };

  const materializeResolvedAddressToHL = (resolved: EaResolution, span: SourceSpan): boolean => {
    if (resolved.kind === 'abs') {
      ctx.emitAbs16Fixup(0x21, resolved.baseLower, resolved.addend, span);
      return true;
    }
    ctx.diagAt(ctx.diagnostics, span, 'Address expression must resolve to an absolute AZM address.');
    return false;
  };

  return {
    fieldOffsetInBaseType,
    materializeResolvedAddressToHL,
  };
}
