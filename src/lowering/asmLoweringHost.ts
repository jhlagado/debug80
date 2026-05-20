import type { AsmInstructionNode } from '../frontend/ast.js';
import type { BranchCallLoweringContext } from './asmLoweringBranchCall.js';
import type { LdHelperContext } from './asmInstructionLdHelpers.js';
import type { LdLoweringContext } from './asmLoweringLd.js';

/**
 * Fields required by {@link createAsmInstructionLdHelpers} beyond what
 * {@link BranchCallLoweringContext} already provides (`emitInstr`, `emitAbs16Fixup`).
 */
export type AsmLoweringLdHelperSlice = Omit<LdHelperContext, 'emitInstr' | 'emitAbs16Fixup'>;

export type AsmLoweringLdSlice = Pick<LdLoweringContext, 'resolveEa'>;

/**
 * Dispatcher paths shared by assignment lowering and the non-`ld` `lowerLdWithEa` fallback.
 */
export type AsmLoweringDispatcherSlice = {
  lowerLdWithEa: (asmItem: AsmInstructionNode) => boolean;
};

/**
 * Narrow surface for {@link createAsmInstructionLoweringHelpers}: branch/call, LD helpers,
 * assignment, and raw-instruction fallback. Composed from helper-family contracts plus LD-helper
 * and dispatcher-only fields (no unused legacy fields).
 */
export type AsmLoweringHost = BranchCallLoweringContext &
  AsmLoweringLdHelperSlice &
  AsmLoweringLdSlice &
  AsmLoweringDispatcherSlice;
