import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  readPinnedNucleusInputs,
  readVerifiedNucleusRelease,
  nucleusProvenance,
} from "./nucleus-release.mjs";

export async function importNucleusRelease(
  sourceDirectory,
  destinationDirectory,
) {
  // Validate all release inputs before changing any destination file.
  const inputs = await readPinnedNucleusInputs(
    sourceDirectory,
    "PROVENANCE.json",
  );
  await mkdir(destinationDirectory, { recursive: true });
  await Promise.all([
    writeFile(join(destinationDirectory, "NUC.COM"), inputs.bytes),
    writeFile(
      join(destinationDirectory, "NUC.manifest.json"),
      inputs.manifestBytes,
    ),
    writeFile(
      join(destinationDirectory, "release.provenance.json"),
      inputs.provenanceBytes,
    ),
    writeFile(
      join(destinationDirectory, "PROVENANCE.json"),
      `${JSON.stringify(nucleusProvenance, null, 2)}\n`,
    ),
  ]);
  return nucleusProvenance;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const root = resolve(import.meta.dirname, "..", "..");
  if (process.env.NUCLEUS_RELEASE_DIR) {
    await importNucleusRelease(
      resolve(process.env.NUCLEUS_RELEASE_DIR),
      join(root, "third_party", "nucleus"),
    );
  } else {
    await readVerifiedNucleusRelease(root);
  }
  console.log(JSON.stringify(nucleusProvenance, null, 2));
}
