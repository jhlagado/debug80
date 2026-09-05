import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const revision = "52cca195d1b557ebfbbc3a6d924ca3d6ea657829";
const digest =
  "7b3da3c0b595a88b4906537fe0f76c44f7abd412e248d35d927d1aefd8971ef1";
const manifestDigest =
  "2a1e1bca236fb644aea7344573376d960ea27fe12e80e047b3c2aa3a363d535a";
const repository = "https://github.com/jhlagado/nucleus.git";
const origin =
  "https://github.com/jhlagado/nucleus/releases/download/nucleus-v0.3.0/NUC.COM";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

// Preserve the existing Debug80 image builder's provenance fields.
export const nucleusProvenance = Object.freeze({
  name: "Nucleus native CP/M 2.2 compiler transient",
  repository,
  commit: revision,
  sourcePath: "asm/vertical-slice/cpm22-native-compiler.asm",
  license: "GPL-3.0-only",
  artifactSha256: digest,
  artifactBytes: 21281,
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
    bytes.length !== 21281 ||
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
    provenance.bytes !== 21281 ||
    provenance.sha256 !== digest ||
    provenance.manifestSha256 !== manifestDigest ||
    provenance.origin?.kind !== "release-asset" ||
    provenance.origin?.url !== origin ||
    manifest.format !== "nucleus-cpm22-artifact-v1" ||
    manifest.artifact !== "NUC.COM" ||
    manifest.loadAddress !== 256 ||
    manifest.entryAddress !== 256 ||
    manifest.endAddress !== 21537
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
