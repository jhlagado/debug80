import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const integrationRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const repositoryRoot = path.resolve(integrationRoot, "../..");
const temporary = fs.mkdtempSync(
  path.join(os.tmpdir(), "glimmer-packed-headless-"),
);
const packDirectory = path.join(temporary, "pack");
const consumer = path.join(temporary, "consumer");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";

fs.mkdirSync(packDirectory);
fs.mkdirSync(consumer);

function pack(packagePath) {
  const packed = JSON.parse(
    execFileSync(npm, ["pack", "--json", "--pack-destination", packDirectory], {
      cwd: path.join(repositoryRoot, packagePath),
      encoding: "utf8",
    }),
  );
  const filename = packed[0]?.filename;
  assert.equal(
    typeof filename,
    "string",
    `npm pack did not report a tarball for ${packagePath}`,
  );
  return path.join(packDirectory, filename);
}

try {
  const glimmerPackage = JSON.parse(
    fs.readFileSync(
      path.join(repositoryRoot, "packages/glimmer/package.json"),
      "utf8",
    ),
  );
  const tarballs = [
    pack("packages/azm"),
    pack("packages/glimmer"),
    pack("packages/debug80-runtime"),
  ];
  fs.writeFileSync(
    path.join(consumer, "package.json"),
    `${JSON.stringify({ private: true, type: "module" }, null, 2)}\n`,
  );
  execFileSync(
    npm,
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", ...tarballs],
    {
      cwd: consumer,
      stdio: "inherit",
    },
  );
  const glimmerBin = path.join(
    consumer,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "glimmer.cmd" : "glimmer",
  );
  assert.equal(
    execFileSync(glimmerBin, ["--version"], {
      cwd: consumer,
      encoding: "utf8",
    }).trim(),
    glimmerPackage.version,
    "packed Glimmer CLI reported the wrong version",
  );

  const entry = path.join(consumer, "scheduling.glim");
  fs.writeFileSync(
    entry,
    [
      "program Scheduling",
      "platform tec1g-mon3",
      "display matrix8x8",
      "state Value : byte",
      "state Seen : byte",
      "state ProducedAt : byte",
      "state SeenAt : byte",
      "pulse Go",
      "bind key KEY_1 rising -> Go",
      "effect Producer",
      "    on Go",
      "    updates Value, ProducedAt",
      "begin",
      "    ld a,(FrameCount)",
      "    ld (ProducedAt),a",
      "    ld a,1",
      "    ld (Value),a",
      "end",
      "effect Peer",
      "    on Value",
      "    updates Seen, SeenAt",
      "begin",
      "    ld a,(FrameCount)",
      "    ld (SeenAt),a",
      "    ld a,(Value)",
      "    ld (Seen),a",
      "end",
      "render KeepClock",
      "    on FrameCount",
      "begin",
      "end",
    ].join("\n"),
  );

  const runner = path.join(consumer, "verify.mjs");
  fs.writeFileSync(
    runner,
    [
      "import assert from 'node:assert/strict';",
      "import fs from 'node:fs';",
      "import { createTec1gHeadlessSession } from '@jhlagado/debug80-runtime/headless';",
      "import { parseIntelHex } from '@jhlagado/debug80-runtime';",
      "import { MATRIX_ASCII_MAP } from '@jhlagado/debug80-runtime/platforms/tec1g/matrix-keymap';",
      "import { buildGlimmerProgram } from '@jhlagado/glimmer/build';",
      "const [entry, rom] = process.argv.slice(2);",
      "const build = await buildGlimmerProgram(entry);",
      "assert.deepEqual(build.diagnostics.filter((item) => item.severity === 'error'), []);",
      "assert.ok(build.artifacts?.hex && build.artifacts?.d8, 'missing Glimmer artifacts');",
      "const session = createTec1gHeadlessSession({",
      "  program: parseIntelHex(fs.readFileSync(build.artifacts.hex, 'utf8')),",
      "  entry: 'Start',",
      "  stackPointer: 0x7fff,",
      "  debugMap: JSON.parse(fs.readFileSync(build.artifacts.d8, 'utf8')),",
      "  overlays: [{ address: 0xc000, bytes: fs.readFileSync(rom) }],",
      "  config: {",
      "    regions: [{ start: 0x0000, end: 0x07ff, kind: 'rom' }, { start: 0x0800, end: 0x7fff, kind: 'ram' }, { start: 0xc000, end: 0xffff, kind: 'rom' }],",
      "    appStart: 0x4000,",
      "    entry: 0x4000,",
      "    matrixMode: true,",
      "    updateMs: 1_000_000,",
      "  },",
      "});",
      "session.runMatrixScans(2, { maxInstructions: 500_000, maxCycles: 5_000_000 });",
      "const key = MATRIX_ASCII_MAP['1']?.[0];",
      "assert.ok(key, 'missing matrix key mapping');",
      "session.pressMatrixKey(key.row, key.col);",
      "session.runUntil((game) => game.memory.readByte('Seen') === 1, { maxInstructions: 500_000, maxCycles: 5_000_000 });",
      "const producedAt = session.memory.readByte('ProducedAt');",
      "const seenAt = session.memory.readByte('SeenAt');",
      "assert.equal(seenAt, (producedAt + 1) & 0xff, 'same-phase trigger was not deferred exactly one frame');",
    ].join("\n"),
  );
  execFileSync(
    process.execPath,
    [
      runner,
      entry,
      path.join(
        repositoryRoot,
        "apps/debug80-vscode/resources/bundles/tec1g/mon3/v1/mon3.bin",
      ),
    ],
    { cwd: consumer, stdio: "inherit" },
  );
  console.log("packed Glimmer headless scheduling smoke passed");
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
