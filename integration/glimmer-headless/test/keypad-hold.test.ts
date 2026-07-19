/**
 * @file Held hex-keypad key driven through real MON-3.
 *
 * Proves the level-based keypad model end to end: with a key held via
 * pressKeypadKey, MON-3's scanKeys reports the key as held frame after
 * frame, so a Glimmer `held period N` binding fires on the press and
 * then autorepeats - the behaviour every held-movement game relies on.
 * Uses the shipped dot.glim, whose four direction keys are
 * `held period 8` bindings (KEY_6 -> Right).
 */

import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  createTec1gHeadlessSession,
  parseIntelHex,
} from "@jhlagado/debug80-runtime";
import { buildGlimmerProgram } from "@jhlagado/glimmer/build";
import { expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");

const KEY_6 = 0x06;

it("autorepeats a held keypad key through MON-3 scanKeys", async () => {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), "glimmer-headless-keypad-hold-"),
  );
  const entry = path.join(directory, "dot.glim");
  writeFileSync(
    entry,
    readFileSync(
      path.join(repositoryRoot, "packages/glimmer/examples/dot.glim"),
    ),
  );

  const build = await buildGlimmerProgram(entry);
  expect(
    build.diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
  ).toEqual([]);
  const artifacts = build.artifacts;
  if (artifacts?.hex === undefined || artifacts.d8 === undefined) {
    throw new Error("Glimmer did not produce HEX and D8 artifacts");
  }
  const program = parseIntelHex(readFileSync(artifacts.hex, "utf8"));
  const debugMap = JSON.parse(readFileSync(artifacts.d8, "utf8")) as unknown;
  const monitor = readFileSync(
    path.join(
      repositoryRoot,
      "apps/debug80-vscode/resources/bundles/tec1g/mon3/v1/mon3.bin",
    ),
  );
  const session = createTec1gHeadlessSession({
    program,
    entry: "Start",
    stackPointer: 0x7fff,
    debugMap,
    overlays: [{ address: 0xc000, bytes: monitor }],
    config: {
      regions: [
        { start: 0x0000, end: 0x07ff, kind: "rom" },
        { start: 0x0800, end: 0x7fff, kind: "ram" },
        { start: 0xc000, end: 0xffff, kind: "rom" },
      ],
      appStart: 0x4000,
      entry: 0x4000,
      updateMs: 1_000_000,
    },
  });

  const budget = { maxInstructions: 2_000_000, maxCycles: 40_000_000 };

  session.runMatrixScans(2, budget);
  expect(session.memory.readByte("DotX")).toBe(3);

  // Press and hold: the rising fire moves the dot once...
  session.pressKeypadKey(KEY_6);
  session.runUntil((game) => game.memory.readByte("DotX") === 4, budget);

  // ...and the hold keeps it moving. Two further steps can only come
  // from the `held period 8` autorepeat, which can only fire if MON-3
  // keeps reporting the key as held, scan after scan.
  session.runUntil((game) => game.memory.readByte("DotX") === 5, budget);
  session.runUntil((game) => game.memory.readByte("DotX") === 6, budget);

  // Release: movement stops where it stands.
  session.releaseKeypadKey(KEY_6);
  session.runMatrixScans(20, budget);
  expect(session.memory.readByte("DotX")).toBe(6);
});
