import type { SourceItem } from '../model/source-item.js';
import { collectConstants } from './constants.js';
import { collectDirectTailJumps } from './programModel-boundaries.js';
import { buildRoutinesAndDirectCalls } from './programModel-routines.js';
import type { RegisterContractsProgramModel } from './types.js';

export function buildRegisterContractsProgramModel(
  items: readonly SourceItem[],
): RegisterContractsProgramModel {
  const constants = collectConstants(items);
  const { routines, directCalls, ownedInstructionItems } = buildRoutinesAndDirectCalls(
    items,
    constants,
  );
  const directTailJumps = collectDirectTailJumps(items, routines, ownedInstructionItems);

  return {
    routines,
    directCalls,
    directBoundaries: [...directCalls, ...directTailJumps],
  };
}
