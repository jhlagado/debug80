import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const { stdout: help } = await execFileAsync(
  process.execPath,
  ["dist/src/cli/nucleus.js", "--help"],
);
assert.match(help, /^Usage: nucleus <command> \[options\]/);
assert.match(help, /proof:publish/);

const { stdout: packJson } = await execFileAsync("npm", [
  "pack",
  "--dry-run",
  "--json",
  "--ignore-scripts",
]);
const [pack] = JSON.parse(packJson);
const files = new Set(pack.files.map((file) => file.path));
const packageJson = JSON.parse(await readFile("package.json", "utf8"));

assert.equal(pack.name, "nucleus");
assert.equal(packageJson.bin.nucleus, "dist/src/cli/nucleus.js");
assert(files.has("dist/src/cli/nucleus.js"));
assert(files.has("dist/src/index.js"));
assert(files.has("dist/src/cli/nucleus.d.ts"));
assert(files.has("README.md"));
assert(!files.has("src/cli/nucleus.ts"));
assert(!files.has("test/application.test.ts"));
