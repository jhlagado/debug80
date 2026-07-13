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

it("defers a same-phase trigger by exactly one frame", async () => {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), "glimmer-headless-scheduling-"),
  );
  const entry = path.join(directory, "scheduling.glim");
  writeFileSync(
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

  const build = await buildGlimmerProgram(entry);
  expect(
    build.diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
  ).toEqual([]);
  const artifacts = build.artifacts;
  if (artifacts?.hex === undefined || artifacts.d8 === undefined) {
    throw new Error("Glimmer did not produce HEX and D8 artifacts");
  }

  const session = createTec1gHeadlessSession({
    program: parseIntelHex(readFileSync(artifacts.hex, "utf8")),
    entry: "Start",
    stackPointer: 0x7fff,
    debugMap: JSON.parse(readFileSync(artifacts.d8, "utf8")) as unknown,
    overlays: [
      {
        address: 0xc000,
        bytes: readFileSync(
          path.join(
            repositoryRoot,
            "apps/debug80-vscode/resources/bundles/tec1g/mon3/v1/mon3.bin",
          ),
        ),
      },
    ],
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

  session.runMatrixScans(2, {
    maxInstructions: 500_000,
    maxCycles: 5_000_000,
  });
  const key = MATRIX_ASCII_MAP["1"]?.[0];
  expect(key).toBeDefined();
  session.pressMatrixKey(key!.row, key!.col);
  session.runUntil((game) => game.memory.readByte("Seen") === 1, {
    maxInstructions: 500_000,
    maxCycles: 5_000_000,
  });
  session.releaseMatrixKey(key!.row, key!.col);

  const producedAt = session.memory.readByte("ProducedAt");
  const seenAt = session.memory.readByte("SeenAt");
  expect(seenAt).toBe((producedAt + 1) & 0xff);
});
