import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { runProofManifest, type NobjExecutionOutcome } from "./proof.js";

export interface NucleusProofTargetPublicationOptions {
  readonly manifest: string;
  readonly output?: string;
}

export interface NucleusProofTargetPublication {
  readonly manifest: string;
  readonly output?: string;
  readonly nobj: NobjExecutionOutcome;
}

export async function publishNucleusProofTarget({
  manifest,
  output,
}: NucleusProofTargetPublicationOptions): Promise<NucleusProofTargetPublication> {
  const manifestPath = path.resolve(manifest);
  const outcome = await runProofManifest(manifestPath);
  if (outcome.nobj === undefined) {
    throw new Error("proof manifest did not publish NOBJ");
  }
  if (output !== undefined) {
    const outputPath = path.resolve(output);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, outcome.nobj.serialized);
  }
  return Object.freeze({
    manifest: manifestPath,
    output: output === undefined ? undefined : path.resolve(output),
    nobj: outcome.nobj,
  });
}
