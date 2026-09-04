import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const EXPECTED_REVISION = "ac59b478b686b7cd1a3a340064e82d64fdc58589";
const EXPECTED_SHA256 =
  "bbe4ac2b6236d178089fcd01822d0d7fa3c6159f0d2da3655eba1212dda5aa02";
const EXPECTED_BYTES = 3003;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function readVerifiedEditRelease(repositoryRoot) {
  const directory = join(repositoryRoot, "third_party", "edit");
  const [artifact, manifest, provenance] = await Promise.all([
    readFile(join(directory, "EDIT.COM")),
    readFile(join(directory, "manifest.json"), "utf8").then(JSON.parse),
    readFile(join(directory, "PROVENANCE.json"), "utf8").then(JSON.parse),
  ]);
  if (
    artifact.length !== EXPECTED_BYTES ||
    sha256(artifact) !== EXPECTED_SHA256 ||
    manifest.artifact !== "EDIT.COM" ||
    manifest.bytes !== EXPECTED_BYTES ||
    manifest.sha256 !== EXPECTED_SHA256 ||
    provenance.revision !== EXPECTED_REVISION ||
    provenance.bytes !== EXPECTED_BYTES ||
    provenance.sha256 !== EXPECTED_SHA256
  ) {
    throw new Error("vendored Edit release differs from its pinned provenance");
  }
  return artifact;
}
