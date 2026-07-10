import { getZ80InstructionEffect } from '../z80/effects.js';
import { precedingCServiceName, precedingRegisterImmediateValue } from './boundaryHints.js';
import { instructionHead } from './instruction-head.js';
import {
  rstDispatcherServiceTargetNames,
  rstServiceTargetName,
  rstTargetName,
} from './profiles.js';
import type {
  InstructionEffect,
  RegisterContractsInstruction,
  RegisterContractsRoutine,
  RegisterContractsServiceRangeContract,
  RoutineSummary,
} from './types.js';

export function boundarySummary(
  routine: RegisterContractsRoutine,
  index: number,
  summaries: ReadonlyMap<string, RoutineSummary>,
  serviceRanges: readonly RegisterContractsServiceRangeContract[] = [],
): RoutineSummary | undefined {
  const item = routine.instructions[index];
  if (!item) return undefined;
  const effect = getZ80InstructionEffect(item.instruction);
  return (
    callBoundarySummary(item, effect, summaries) ??
    jumpBoundarySummary(routine, item, effect, summaries) ??
    rstBoundarySummary(routine, index, effect, summaries, serviceRanges)
  );
}

function callBoundarySummary(
  item: RegisterContractsInstruction,
  effect: InstructionEffect,
  summaries: ReadonlyMap<string, RoutineSummary>,
): RoutineSummary | undefined {
  return effect.control.kind === 'call' && effect.control.target
    ? summaries.get(item.resolvedTarget ?? effect.control.target)
    : undefined;
}

function jumpBoundarySummary(
  routine: RegisterContractsRoutine,
  item: RegisterContractsInstruction,
  effect: InstructionEffect,
  summaries: ReadonlyMap<string, RoutineSummary>,
): RoutineSummary | undefined {
  return isExternalTailJump(routine, item, effect)
    ? summaries.get(item.resolvedTarget ?? effect.control.target)
    : undefined;
}

export function isExternalTailJump(
  routine: RegisterContractsRoutine,
  item: RegisterContractsInstruction,
  effect: InstructionEffect,
): effect is InstructionEffect & {
  readonly control: { readonly kind: 'jump'; readonly target: string };
} {
  return (
    effect.control.kind === 'jump' &&
    ['jp', 'jp-cc', 'jr', 'jr-cc'].includes(instructionHead(item)) &&
    effect.control.target !== undefined &&
    !effect.control.target.startsWith('.') &&
    !effect.control.target.startsWith('_') &&
    !routine.labels.includes(effect.control.target)
  );
}

function rstBoundarySummary(
  routine: RegisterContractsRoutine,
  index: number,
  effect: InstructionEffect,
  summaries: ReadonlyMap<string, RoutineSummary>,
  serviceRanges: readonly RegisterContractsServiceRangeContract[],
): RoutineSummary | undefined {
  if (effect.control.kind !== 'rst' || effect.control.vector === undefined) return undefined;
  return (
    rstServiceBoundarySummary(routine, index, effect.control.vector, summaries, serviceRanges) ??
    summaries.get(rstTargetName(effect.control.vector))
  );
}

function rstServiceBoundarySummary(
  routine: RegisterContractsRoutine,
  index: number,
  vector: number,
  summaries: ReadonlyMap<string, RoutineSummary>,
  serviceRanges: readonly RegisterContractsServiceRangeContract[],
): RoutineSummary | undefined {
  const previous = routine.instructions[index - 1];
  const numericService = precedingRegisterImmediateValue(previous, 'C');
  if (numericService !== undefined) {
    const numericSummary = summaries.get(rstServiceTargetName(vector, String(numericService)));
    if (numericSummary !== undefined) return numericSummary;
    const profileTarget = firstSummary(
      rstDispatcherServiceTargetNames(
        vector,
        (register) => (register === 'C' ? numericService : undefined),
        serviceRanges,
      ),
      summaries,
    );
    if (profileTarget !== undefined) return profileTarget;
  }
  const service = precedingCServiceName(previous);
  return service ? summaries.get(rstServiceTargetName(vector, service)) : undefined;
}

function firstSummary(
  names: readonly string[],
  summaries: ReadonlyMap<string, RoutineSummary>,
): RoutineSummary | undefined {
  for (const name of names) {
    const summary = summaries.get(name);
    if (summary !== undefined) return summary;
  }
  return undefined;
}
