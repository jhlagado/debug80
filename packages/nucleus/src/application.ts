import type { SourceLimits, SourcePlacement } from "@jhlagado/z80-tool-services/source-preparation";

import {
  prepareNucleusSourceParts,
  type NucleusResolvedSourceProject,
} from "./source-preparation.js";
import type { SourcePart } from "./source-manifest.js";

export interface NucleusCompilationPreparationOptions {
  readonly root: string;
  readonly entry: string;
  readonly placement?: SourcePlacement;
  readonly limits?: SourceLimits;
}

export interface PreparedNucleusCompilation {
  readonly project: NucleusResolvedSourceProject;
  readonly sourceParts: readonly SourcePart[];
  readonly partBanks: readonly number[];
  readonly totalSourceBytes: number;
}

export async function prepareNucleusCompilation(
  options: NucleusCompilationPreparationOptions,
): Promise<PreparedNucleusCompilation> {
  const prepared = await prepareNucleusSourceParts(options);
  return Object.freeze({
    project: prepared.project,
    sourceParts: prepared.sourceParts,
    partBanks: prepared.project.bankArray,
    totalSourceBytes: prepared.sourceParts.reduce(
      (total, part) => total + part.bytes.length,
      0,
    ),
  });
}
