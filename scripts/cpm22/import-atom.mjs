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
const expectedCommit = "d9583e101cca43863433f8fe79ef0acd46b3b010";
const expectedSha256 =
  "3a5ec53680fe8707dd1b472ec2719c93b25a1ce863952acc05c6eddd0ec161f5";

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
