import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  createTec1gHeadlessSession,
  parseIntelHex,
} from "@jhlagado/debug80-runtime";
import { MATRIX_ASCII_MAP } from "@jhlagado/debug80-runtime/platforms/tec1g/matrix-keymap";
import { buildGlimmerProgram } from "@jhlagado/glimmer/build";
import { expect, it } from "vitest";

const repositoryRoot = path.resolve(import.meta.dirname, "../../..");

it("builds and drives dot.glim through MON-3 without Debug80 UI", async () => {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), "glimmer-headless-dot-"),
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
      matrixMode: true,
      updateMs: 1_000_000,
    },
  });

  session.runMatrixScans(2, { maxInstructions: 500_000, maxCycles: 5_000_000 });
  expect(session.memory.readByte("DotX")).toBe(3);
  expect(session.memory.readByte("DotY")).toBe(3);

  const right = MATRIX_ASCII_MAP["6"]?.[0];
  expect(right).toBeDefined();
  session.pressMatrixKey(right!.row, right!.col);
  session.runUntil((game) => game.memory.readByte("DotX") === 4, {
    maxInstructions: 500_000,
    maxCycles: 5_000_000,
  });
  session.releaseMatrixKey(right!.row, right!.col);

  expect(
    session.tec1g.state.display.matrixNextScanCycleId,
  ).toBeGreaterThanOrEqual(2);
});
