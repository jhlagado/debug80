import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const revision = "b5276a85fd36600a10dbd65039f0af3afc033f0d";
const digest =
  "1c047ac1ed5ff1c4e914321b66476b842a1b28cc0dfef4cfdb86f691ca037334";
const manifestDigest =
  "ea2555944622b59b45bc89c9aec63e0575eb9ae6d4a1e9c9430942d905132388";
const repository = "https://github.com/jhlagado/nucleus.git";
const origin =
  "https://github.com/jhlagado/nucleus/releases/download/nucleus-v0.3.1/NUC.COM";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

// Preserve the existing Debug80 image builder's provenance fields.
export const nucleusProvenance = Object.freeze({
  name: "Nucleus native CP/M 2.2 compiler transient",
  repository,
  commit: revision,
  sourcePath: "asm/vertical-slice/cpm22-native-compiler.asm",
  license: "GPL-3.0-only",
  artifactSha256: digest,
  artifactBytes: 21271,
  manifestSha256: manifestDigest,
  release: origin,
});

export async function readPinnedNucleusInputs(
  directory,
  provenanceName = "release.provenance.json",
) {
  const [bytes, manifestBytes, provenanceBytes] = await Promise.all([
    readFile(join(directory, "NUC.COM")),
    readFile(join(directory, "NUC.manifest.json")),
    readFile(join(directory, provenanceName)),
  ]);
  if (
    bytes.length !== 21271 ||
    hash(bytes) !== digest ||
    hash(manifestBytes) !== manifestDigest
  ) {
    throw new Error("Nucleus artifact or manifest differs from pinned release");
  }
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const provenance = JSON.parse(provenanceBytes.toString("utf8"));
  if (
    provenance?.schema !== "triptych-release-provenance-v1" ||
    provenance.repository !== repository ||
    provenance.revision !== revision ||
    provenance.bytes !== 21271 ||
    provenance.sha256 !== digest ||
    provenance.manifestSha256 !== manifestDigest ||
    provenance.origin?.kind !== "release-asset" ||
    provenance.origin?.url !== origin ||
    manifest.format !== "nucleus-cpm22-artifact-v1" ||
    manifest.artifact !== "NUC.COM" ||
    manifest.loadAddress !== 256 ||
    manifest.entryAddress !== 256 ||
    manifest.endAddress !== 21527
  ) {
    throw new Error("Nucleus release provenance or CP/M contract mismatch");
  }
  return { bytes, manifest, manifestBytes, provenanceBytes };
}

export async function readVerifiedNucleusRelease(repositoryRoot) {
  const directory = join(repositoryRoot, "third_party", "nucleus");
  const inputs = await readPinnedNucleusInputs(directory);
  const provenance = JSON.parse(
    await readFile(join(directory, "PROVENANCE.json"), "utf8"),
  );
  for (const [key, value] of Object.entries(nucleusProvenance)) {
    if (provenance?.[key] !== value)
      throw new Error("Nucleus consumer provenance mismatch");
  }
  return inputs.bytes;
}
