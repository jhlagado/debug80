import type { EaExprNode, SourceSpan } from '../frontend/ast.js';
import type { ValueMaterializationContext } from './valueMaterializationContext.js';
import { createHlWordTransport } from './valueMaterializationTransport.js';

export function createValueMaterializationHelpers(ctx: ValueMaterializationContext) {
  const { emitLoadWordFromHlAddress, emitStoreWordToHlAddress } = createHlWordTransport(ctx);

  const materializeEaAddressToHL = (ea: EaExprNode, span: SourceSpan): boolean => {
    const resolved = ctx.resolveEa(ea, span);
    if (!resolved) {
      ctx.diagAt(ctx.diagnostics, span, 'Address expression must resolve to an absolute AZM address.');
      return false;
    }

    ctx.emitAbs16Fixup(0x21, resolved.baseLower, resolved.addend, span);
    return true;
  };

  const emitStoreSavedHlToEa = (ea: EaExprNode, span: SourceSpan): boolean => {
    if (!ctx.emitInstr('push', [{ kind: 'Reg', span, name: 'DE' }], span)) return false;
    if (!ctx.emitInstr('push', [{ kind: 'Reg', span, name: 'HL' }], span)) return false;
    if (!materializeEaAddressToHL(ea, span)) return false;
    if (!ctx.emitInstr('pop', [{ kind: 'Reg', span, name: 'DE' }], span)) return false;
    if (!emitStoreWordToHlAddress('DE', span)) return false;
    return ctx.emitInstr('pop', [{ kind: 'Reg', span, name: 'DE' }], span);
  };

  return {
    emitLoadWordFromHlAddress,
    emitStoreSavedHlToEa,
    emitStoreWordToHlAddress,
  };
}
