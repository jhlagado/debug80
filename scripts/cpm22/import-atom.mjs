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
const expectedCommit = "ae57413cba865963cf00c8cc1172e5c4cc497b1c";
const expectedSha256 =
  "f1e32b46fec49a2d815a45aab1e6c1ae8ac2c569648f076dd2ca73c86da9e61c";

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
