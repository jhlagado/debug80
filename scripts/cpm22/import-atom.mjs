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
const expectedCommit = "964f26fbcdfd48a87cea24a3af1c7a5a225e8ab0";
const expectedSha256 =
  "6a79dea8a238e859c79e033db6d56fa90e4ab9ed9595ce1fd8dcd94c3749bc3f";

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
