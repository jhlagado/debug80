import type { FunctionLoweringSharedContext } from './functionLowering.js';
import type { LoweringContext } from './programLowering.js';
import {
  createAssemblerInstructionEmitters,
  createNativeAssemblerFramePhase,
  type AssemblerInstructionSetup,
  prepareAssemblerInstructionSetupPhase,
} from './functionLoweringPhases.js';

export type NativeAssemblerEmissionFrame = ReturnType<typeof createAssemblerInstructionEmitters>;

function createNativeAssemblerSetup(ctx: FunctionLoweringSharedContext): AssemblerInstructionSetup {
  return prepareAssemblerInstructionSetupPhase(ctx);
}

export function createNativeAssemblerEmissionFrame(ctx: LoweringContext): NativeAssemblerEmissionFrame {
  const setup = createNativeAssemblerSetup(ctx);
  const frame = createNativeAssemblerFramePhase(setup);
  return createAssemblerInstructionEmitters(setup, frame);
}
