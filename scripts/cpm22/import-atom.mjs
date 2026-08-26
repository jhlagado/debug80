import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..", "..");
const atomRoot = resolve(repositoryRoot, "..", "atom");
const destination = join(repositoryRoot, "third_party", "atom", "ATOM.COM");
const expectedCommit = "a61002edba870668badfdadbb4c624964489bfe0";
const expectedSha256 =
  "ee23f83f8d8c9511e59a8a025b2a28300659b22101f2917c1ff3b2dd4ef3ea79";

const commit = execFileSync("git", ["-C", atomRoot, "rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
assert.equal(
  commit,
  expectedCommit,
  "Atom checkout is not the reviewed CP/M source revision",
);
const bytes = await readFile(join(atomRoot, "assets", "atom-cpm22.com"));
const sha256 = createHash("sha256").update(bytes).digest("hex");
assert.equal(
  sha256,
  expectedSha256,
  "Atom CP/M image differs from the reviewed artifact",
);
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, bytes);
console.log(
  JSON.stringify({ commit, sha256, bytes: bytes.length }, undefined, 2),
);
