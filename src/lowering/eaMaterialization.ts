import type { Diagnostic } from '../diagnosticTypes.js';
import type { EaExprNode, SourceSpan } from '../frontend/ast.js';
import type { EaResolution } from './eaResolution.js';

/** Inputs for {@link createEaMaterializationHelpers}. */
export type EAMaterializationContext = {
  /** Resolves an EA to an absolute address; `undefined` means the source is not a compile-time address. */
  resolveEa: (ea: EaExprNode, span: SourceSpan) => EaResolution | undefined;
  /** Queues a 16-bit absolute fixup (e.g. LD HL, sym+off). */
  emitAbs16Fixup: (opcode: number, target: string, addend: number, span: SourceSpan) => void;
  /** Mutable diagnostic list. */
  diagnostics: Diagnostic[];
  /** Span diagnostic helper. */
  diagAt: (diagnostics: Diagnostic[], span: SourceSpan, message: string) => void;
};

export function createEaMaterializationHelpers(ctx: EAMaterializationContext) {
  const materializeEaAddressToHL = (ea: EaExprNode, span: SourceSpan): boolean => {
    const resolved = ctx.resolveEa(ea, span);
    if (!resolved) {
      ctx.diagAt(ctx.diagnostics, span, 'Address expression must resolve to an absolute AZM address.');
      return false;
    }

    ctx.emitAbs16Fixup(0x21, resolved.baseLower, resolved.addend, span);
    return true;
  };

  return {
    materializeEaAddressToHL,
  };
}
