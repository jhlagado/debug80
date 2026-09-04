import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { readCpm22File } from "@jhlagado/debug80-runtime/platforms/cpm22/filesystem";
import { readVerifiedEditRelease } from "./edit-release.mjs";

const repositoryRoot = resolve(import.meta.dirname, "..", "..");
const [release, disk] = await Promise.all([
  readVerifiedEditRelease(repositoryRoot),
  readFile(
    resolve(
      repositoryRoot,
      "apps",
      "debug80-vscode",
      "roms",
      "cpm22",
      "cpm22.img",
    ),
  ),
]);
const installed = readCpm22File(disk, "EDIT.COM");
assert.ok(installed, "EDIT.COM is installed in the Debug80 CP/M image");
assert.equal(
  Buffer.compare(installed.bytes.slice(0, release.length), release),
  0,
  "installed EDIT.COM bytes",
);
assert.ok(
  installed.bytes.slice(release.length).every((byte) => byte === 0x1a),
  "installed EDIT.COM record padding",
);
console.log("Standalone Edit release matches the Debug80 CP/M consumer image");
