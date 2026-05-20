import type { EaExprNode, SourceSpan } from '../frontend/ast.js';
import type { EaResolution } from './eaResolution.js';
import type { ValueMaterializationContext } from './valueMaterializationContext.js';
import { createRuntimeAddressBaseMaterialization } from './valueMaterializationBase.js';
import { createHlWordTransport } from './valueMaterializationTransport.js';

export function createValueMaterializationHelpers(ctx: ValueMaterializationContext) {
  const { emitLoadWordFromHlAddress, emitStoreWordToHlAddress } = createHlWordTransport(ctx);
  const { materializeResolvedAddressToHL } = createRuntimeAddressBaseMaterialization(ctx);

  let pushEaAddress: (ea: EaExprNode, span: SourceSpan) => boolean;

  const emitStoreSavedHlToEa = (ea: EaExprNode, span: SourceSpan): boolean => {
    if (!ctx.emitInstr('push', [{ kind: 'Reg', span, name: 'DE' }], span)) return false;
    if (!ctx.emitInstr('push', [{ kind: 'Reg', span, name: 'HL' }], span)) return false;
    if (!pushEaAddress(ea, span)) return false;
    if (!ctx.emitInstr('pop', [{ kind: 'Reg', span, name: 'HL' }], span)) return false;
    if (!ctx.emitInstr('pop', [{ kind: 'Reg', span, name: 'DE' }], span)) return false;
    if (!emitStoreWordToHlAddress('DE', span)) return false;
    return ctx.emitInstr('pop', [{ kind: 'Reg', span, name: 'DE' }], span);
  };

  function pushMemValue(ea: EaExprNode, want: 'byte' | 'word', span: SourceSpan): boolean {
    if (want === 'word') {
      const r = ctx.resolveEa(ea, span);
      if (r?.kind === 'abs') {
        ctx.emitAbs16Fixup(0x2a, r.baseLower, r.addend, span);
        return ctx.emitInstr('push', [{ kind: 'Reg', span, name: 'HL' }], span);
      }
      if (!pushEaAddress(ea, span)) return false;
      if (!ctx.emitInstr('pop', [{ kind: 'Reg', span, name: 'HL' }], span)) return false;
      ctx.emitRawCodeBytes(
        Uint8Array.of(0x5e, 0x23, 0x56, 0xeb),
        span.file,
        'ld e, (hl) ; inc hl ; ld d, (hl) ; ex de, hl',
      );
      return ctx.emitInstr('push', [{ kind: 'Reg', span, name: 'HL' }], span);
    }

    const r = ctx.resolveEa(ea, span);
    if (r?.kind === 'abs') {
      ctx.emitAbs16Fixup(0x3a, r.baseLower, r.addend, span);
      return ctx.pushZeroExtendedReg8('A', span);
    }
    if (!pushEaAddress(ea, span)) return false;
    if (!ctx.emitInstr('pop', [{ kind: 'Reg', span, name: 'HL' }], span)) return false;
    if (
      !ctx.emitInstr(
        'ld',
        [{ kind: 'Reg', span, name: 'A' }, { kind: 'Mem', span, expr: { kind: 'EaName', span, name: 'HL' } }],
        span,
      )
    ) {
      return false;
    }
    return ctx.pushZeroExtendedReg8('A', span);
  }

  const pushResolvedEaAddress = (r: EaResolution, span: SourceSpan): boolean => {
    if (!materializeResolvedAddressToHL(r, span)) return false;
    return ctx.emitInstr('push', [{ kind: 'Reg', span, name: 'HL' }], span);
  };

  pushEaAddress = (ea: EaExprNode, span: SourceSpan): boolean => {
    const r = ctx.resolveEa(ea, span);
    if (!r) {
      ctx.diagAt(ctx.diagnostics, span, 'Address expression must resolve to an absolute AZM address.');
      return false;
    }

    return pushResolvedEaAddress(r, span);
  };

  return {
    emitLoadWordFromHlAddress,
    emitStoreSavedHlToEa,
    emitStoreWordToHlAddress,
    pushEaAddress,
    pushMemValue,
  };
}
