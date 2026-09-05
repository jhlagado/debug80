import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const EXPECTED_REVISION = "2427501773e8d158d556631b8a4ba1cb972fcb4a";
const EXPECTED_SHA256 =
  "73265438a4f2df9a3f507f1bdcd49c48ebabe46cbcdb96e58dc0ee39f8b6a905";
const EXPECTED_BYTES = 3107;
const EXPECTED_MANIFEST_SHA256 =
  "0a3a1f3d3ed18f480ebeadc167942aaf4ce533323c04d83c97591c9289f36b41";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function readVerifiedEditRelease(repositoryRoot) {
  const directory = join(repositoryRoot, "third_party", "edit");
  const [artifact, manifestBytes, provenance] = await Promise.all([
    readFile(join(directory, "EDIT.COM")),
    readFile(join(directory, "manifest.json")),
    readFile(join(directory, "PROVENANCE.json"), "utf8").then(JSON.parse),
  ]);
  if (sha256(manifestBytes) !== EXPECTED_MANIFEST_SHA256) {
    throw new Error("vendored Edit manifest differs from its pinned release");
  }
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  if (
    artifact.length !== EXPECTED_BYTES ||
    sha256(artifact) !== EXPECTED_SHA256 ||
    manifest.format !== "edit-build-manifest-v1" ||
    manifest.version !== "0.1.1" ||
    manifest.loadAddress !== 0x0100 ||
    manifest.entryAddress !== 0x0100 ||
    manifest.artifact !== "EDIT.COM" ||
    manifest.bytes !== EXPECTED_BYTES ||
    manifest.sha256 !== EXPECTED_SHA256 ||
    provenance.repository !== "https://github.com/jhlagado/edit.git" ||
    provenance.revision !== EXPECTED_REVISION ||
    provenance.release !==
      "https://github.com/jhlagado/edit/releases/tag/v0.1.1" ||
    provenance.artifact !== "EDIT.COM" ||
    provenance.license !== "GPL-3.0-or-later" ||
    provenance.bytes !== EXPECTED_BYTES ||
    provenance.sha256 !== EXPECTED_SHA256
  ) {
    throw new Error("vendored Edit release differs from its pinned provenance");
  }
  return artifact;
}
