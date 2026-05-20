import type { Diagnostic } from '../diagnosticTypes.js';
import type { AsmOperandNode, EaExprNode, SourceSpan } from '../frontend/ast.js';
import type { EaResolution } from './eaResolution.js';
import type { StepPipeline } from './steps.js';

export type DiagAt = (diagnostics: Diagnostic[], span: SourceSpan, message: string) => void;

/**
 * Shared dependency surface for value / EA materialization helpers.
 * Semantics align with the same-named members on the shared assembler-lowering context where applicable.
 */
export type ValueMaterializationContext = {
  /** Mutable diagnostic list. */
  diagnostics: Diagnostic[];
  /** Span diagnostic helper. */
  diagAt: DiagAt;
  /** EA resolution; `undefined` when unresolved. */
  resolveEa: (ea: EaExprNode, span: SourceSpan) => EaResolution | undefined;
  /** Encodes one instruction. */
  emitInstr: (head: string, operands: AsmOperandNode[], span: SourceSpan) => boolean;
  /** Queues abs16 fixup. */
  emitAbs16Fixup: (
    opcode: number,
    baseLower: string,
    addend: number,
    span: SourceSpan,
    asmText?: string,
  ) => void;
  /** Emits a step pipeline. */
  emitStepPipeline: (pipeline: StepPipeline, span: SourceSpan) => boolean;
};
