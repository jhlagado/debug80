import type { StepPipeline } from './steps.js';
import type { Diagnostic } from '../diagnosticTypes.js';
import type { AsmOperandNode, EaExprNode } from '../frontend/ast.js';
import type { ImmExprNode, SourceSpan, TypeExprNode } from '../frontend/ast.js';
import type { CompileEnv } from '../semantics/env.js';
import type { EaResolution } from './eaResolution.js';
import type { LdForm } from './ldFormSelection.js';
import { createLdEncodingRegMemHelpers } from './ldEncodingRegMemHelpers.js';
import type { ScalarKind } from './typeResolution.js';

export type LdEncodingContext = {
  LOAD_RP_GLOB: (rp: 'HL' | 'DE' | 'BC', baseLower: string) => StepPipeline;
  STORE_RP_GLOB: (rp: 'HL' | 'DE' | 'BC', baseLower: string) => StepPipeline;
  diagAt: (diagnostics: Diagnostic[], span: SourceSpan, message: string) => void;
  diagnostics: Diagnostic[];
  emitAbs16Fixup: (
    opcode: number,
    target: string,
    addend: number,
    span: SourceSpan,
    asmText?: string,
  ) => void;
  emitAbs16FixupEd: (
    opcode: number,
    target: string,
    addend: number,
    span: SourceSpan,
    asmText?: string,
  ) => void;
  emitAbs16FixupPrefixed: (
    prefix: number,
    opcode: number,
    target: string,
    addend: number,
    span: SourceSpan,
    asmText?: string,
  ) => void;
  emitInstr: (head: string, operands: AsmOperandNode[], span: SourceSpan) => boolean;
  emitLoadWordFromHlAddress: (target: 'HL' | 'DE' | 'BC', span: SourceSpan) => boolean;
  emitRawCodeBytes: (bytes: Uint8Array, file: string, asmText: string) => void;
  emitStepPipeline: (pipeline: StepPipeline, span: SourceSpan) => boolean;
  emitStoreSavedHlToEa: (ea: EaExprNode, span: SourceSpan) => boolean;
  emitStoreWordToHlAddress: (source: 'DE' | 'BC', span: SourceSpan) => boolean;
  env: CompileEnv;
  evalImmExpr: (expr: ImmExprNode) => number | undefined;
  loadImm16ToHL: (value: number, span: SourceSpan) => boolean;
  materializeEaAddressToHL: (ea: EaExprNode, span: SourceSpan) => boolean;
  reg8Code: ReadonlyMap<string, number>;
  resolveScalarKind: (typeExpr: TypeExprNode, seen?: Set<string>) => ScalarKind | undefined;
  setSpTrackingInvalid: () => void;
};

export function createLdEncodingHelpers(ctx: LdEncodingContext) {
  const { emitLdRegMemForm } = createLdEncodingRegMemHelpers(ctx);
  const {
    diagAt,
    diagnostics,
    emitAbs16Fixup,
    emitInstr,
    emitLoadWordFromHlAddress,
    emitRawCodeBytes,
    emitStepPipeline,
    emitStoreWordToHlAddress,
    evalImmExpr,
    loadImm16ToHL,
    materializeEaAddressToHL,
    resolveScalarKind,
  } = ctx;
  const isWordCompatibleScalarKind = (scalar: ScalarKind | undefined): scalar is 'word' | 'addr' =>
    scalar === 'word' || scalar === 'addr';

  const emitLdForm = (form: LdForm): boolean => {
    const { inst, dst, src, dstResolved, srcResolved, dstScalarExact, srcScalarExact, scalarMemToMem } = form;
    const regOperand = (name: string): AsmOperandNode => ({ kind: 'Reg', span: inst.span, name });
    const regMemHandled = emitLdRegMemForm(form);
    if (regMemHandled !== null) {
      return regMemHandled;
    }

    if (dst.kind === 'Mem' && src.kind === 'Mem') {
      if (
        (srcScalarExact === 'byte' && isWordCompatibleScalarKind(dstScalarExact)) ||
        (dstScalarExact === 'byte' && isWordCompatibleScalarKind(srcScalarExact))
      ) {
        diagAt(diagnostics, inst.span, 'Word mem->mem transfer requires word-sized source and destination.');
        return true;
      }
      if (!scalarMemToMem) return false;
      if (scalarMemToMem === 'byte') {
        if (!emitInstr('push', [{ kind: 'Reg', span: inst.span, name: 'AF' }], inst.span)) return false;
        if (!materializeEaAddressToHL(src.expr, inst.span)) return false;
        emitRawCodeBytes(Uint8Array.of(0x7e), inst.span.file, 'ld a, (hl)');
        if (!materializeEaAddressToHL(dst.expr, inst.span)) return false;
        emitRawCodeBytes(Uint8Array.of(0x77), inst.span.file, 'ld (hl), a');
        if (!emitInstr('pop', [{ kind: 'Reg', span: inst.span, name: 'AF' }], inst.span)) return false;
        return true;
      }
      if (!materializeEaAddressToHL(src.expr, inst.span)) return false;
      if (!emitLoadWordFromHlAddress('DE', inst.span)) return false;
      if (!emitInstr('push', [{ kind: 'Reg', span: inst.span, name: 'DE' }], inst.span)) return false;
      if (!materializeEaAddressToHL(dst.expr, inst.span)) return false;
      if (!emitInstr('pop', [{ kind: 'Reg', span: inst.span, name: 'DE' }], inst.span)) return false;
      return emitStoreWordToHlAddress('DE', inst.span);
    }

    if (dst.kind === 'Mem' && src.kind === 'Imm') {
      if (form.dstHasRegisterLikeEaBase) return false;
      if (form.dstIsIxIyDispMem) return false;
      if (form.dstIsEaNameHL) return false;
      const scalar =
        dstResolved?.typeExpr !== undefined ? resolveScalarKind(dstResolved.typeExpr, new Set()) : undefined;
      const v = evalImmExpr(src.expr);
      if (v === undefined) {
        diagAt(diagnostics, inst.span, 'ld (ea), imm expects a constant imm expression.');
        return true;
      }
      const fitsImm8 = (value: number): boolean => value >= -0x80 && value <= 0xff;
      const fitsImm16 = (value: number): boolean => value >= -0x8000 && value <= 0xffff;

      if (scalar === 'byte') {
        if (!fitsImm8(v)) {
          diagAt(diagnostics, inst.span, 'ld (ea), imm expects imm8.');
          return true;
        }
        if (!materializeEaAddressToHL(dst.expr, inst.span)) return true;
        return emitInstr(
          'ld',
          [
            { kind: 'Mem', span: inst.span, expr: { kind: 'EaName', span: inst.span, name: 'HL' } },
            { kind: 'Imm', span: inst.span, expr: { kind: 'ImmLiteral', span: inst.span, value: v } },
          ],
          inst.span,
        );
      }

      if (scalar === 'word' || scalar === 'addr') {
        if (!fitsImm16(v)) {
          diagAt(diagnostics, inst.span, 'ld (ea), imm expects imm16.');
          return true;
        }
        if (dstResolved?.kind === 'abs') {
          if (!loadImm16ToHL(v, inst.span)) return true;
          emitAbs16Fixup(0x22, dstResolved.baseLower, dstResolved.addend, inst.span);
          return true;
        }
        if (!materializeEaAddressToHL(dst.expr, inst.span)) return true;
        const lo = v & 0xff;
        const hi = (v >> 8) & 0xff;
        if (
          !emitInstr(
            'ld',
            [
              { kind: 'Mem', span: inst.span, expr: { kind: 'EaName', span: inst.span, name: 'HL' } },
              { kind: 'Imm', span: inst.span, expr: { kind: 'ImmLiteral', span: inst.span, value: lo } },
            ],
            inst.span,
          )
        ) {
          return true;
        }
        if (!emitInstr('inc', [{ kind: 'Reg', span: inst.span, name: 'HL' }], inst.span)) return true;
        return emitInstr(
          'ld',
          [
            { kind: 'Mem', span: inst.span, expr: { kind: 'EaName', span: inst.span, name: 'HL' } },
            { kind: 'Imm', span: inst.span, expr: { kind: 'ImmLiteral', span: inst.span, value: hi } },
          ],
          inst.span,
        );
      }

      diagAt(diagnostics, inst.span, 'ld (ea), imm is supported only for byte/word/addr destinations.');
      return true;
    }

    return false;
  };

  return { emitLdForm };
}
