import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const repository = "https://github.com/jhlagado/portable-cpm.git";
const revision = "579657f9177b31e1fccf0c05f72ba2ee76f3d052";
const manifestSha256 =
  "2b4b1ae79dc5b6f20de5f6eb5ab0a328ccc6bd90cd9dc74b0a24a79e02252136";
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const contracts = [
  {
    id: "ccp",
    bytes: 2048,
    origin: 0xe400,
    entry: 0xe400,
    sha256: "d5f90f3c7cac8ad902ab4224e9f09ba344a8d30bee63dc7622d7fd1db65b2476",
  },
  {
    id: "bdos",
    bytes: 3584,
    origin: 0xec00,
    entry: 0xec06,
    sha256: "c5fc4d7dd29bf8914c4735165747e3b35dca3b8999a9f70035d972ff602718fc",
  },
];

export async function readVerifiedPortableCpmRelease(repositoryRoot) {
  const directory = join(repositoryRoot, "third_party", "portable-cpm");
  const manifestBytes = await readFile(join(directory, "manifest.json"));
  assert.equal(
    hash(manifestBytes),
    manifestSha256,
    "Portable CP/M pinned manifest",
  );
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  assert.equal(manifest.schema, "portable-cpm-artifacts-v1");
  assert.equal(manifest.version, "0.1.0");
  // The named upstream profile has the same resident addresses as Debug80's BIOS.
  assert.equal(manifest.targetProfile, "triptych-cpu-v0.1");
  const result = {};
  for (const contract of contracts) {
    const { id, bytes: length, origin, entry, sha256 } = contract;
    const bytes = await readFile(join(directory, `${id}.bin`));
    assert.equal(bytes.length, length, `${id} released length`);
    assert.equal(hash(bytes), sha256, `${id} released digest`);
    const component = manifest.components.find((item) => item.id === id);
    assert.ok(component, `${id} manifest component`);
    for (const [key, value] of Object.entries({
      file: `${id}.bin`,
      bytes: length,
      capacity: length,
      origin,
      entry,
      sha256,
    })) {
      assert.equal(component[key], value, `${id} manifest ${key}`);
    }
    const provenance = JSON.parse(
      await readFile(join(directory, `${id}.provenance.json`), "utf8"),
    );
    assert.deepEqual(
      provenance,
      {
        schema: "triptych-release-provenance-v1",
        repository,
        revision,
        bytes: length,
        sha256,
        manifestSha256,
        origin: {
          kind: "release-asset",
          url: `https://github.com/jhlagado/portable-cpm/releases/download/v0.1.0/${id}.bin`,
        },
      },
      `${id} release provenance`,
    );
    result[id] = { bytes };
  }
  return result;
}
