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

it("uploads and moves sprite-chase resources without Debug80 UI", async () => {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), "glimmer-headless-sprite-chase-"),
  );
  const entry = path.join(directory, "sprite-chase.glim");
  writeFileSync(
    entry,
    readFileSync(
      path.join(repositoryRoot, "packages/glimmer/examples/sprite-chase.glim"),
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
    videoStandard: "pal",
    config: {
      regions: [
        { start: 0x0000, end: 0x07ff, kind: "rom" },
        { start: 0x0800, end: 0x7fff, kind: "ram" },
        { start: 0xc000, end: 0xffff, kind: "rom" },
      ],
      appStart: 0x4000,
      entry: 0x4000,
      matrixMode: true,
      uiVisibility: { tms9918: true },
      updateMs: 1_000_000,
    },
  });

  const mainLoop = session.symbols.address("MainLoop");
  const pollBindings = session.symbols.address("GlimPollBindings");
  session.runUntil(
    (machine) => machine.cpu.getPC() === mainLoop,
    { maxInstructions: 100_000, maxCycles: 1_000_000 },
    "VDP initialization completed",
  );
  expect(session.videoSnapshot().vram[0x3800]).toBe(0x3c);
  const spriteSet = session.symbols.address("SpriteSet");
  session.runUntil(
    (machine) => machine.cpu.getPC() === spriteSet,
    { maxInstructions: 100_000, maxCycles: 1_000_000 },
    "initial SpriteSet call",
  );
  expect(session.cpu.getRegisters()).toMatchObject({
    a: 0,
    d: 120,
    e: 88,
  });
  session.runUntil(
    (machine) => machine.memory.readByte("SpriteDirty") === 1,
    { maxInstructions: 100_000, maxCycles: 1_000_000 },
    "initial player sprite prepared",
  );
  session.runUntil(
    (machine) => machine.cpu.getPC() === pollBindings,
    { maxInstructions: 100_000, maxCycles: 1_000_000 },
    "initial player sprite committed",
  );
  const spriteShadow = session.symbols.address("SpriteShadow");
  const state = ["PlayerX", "PlayerY", "TargetX", "TargetY"].map((symbol) =>
    session.memory.readByte(symbol),
  );
  expect(state.slice(0, 2)).toEqual([120, 88]);
  expect({
    shadow: Array.from({ length: 8 }, (_, offset) =>
      session.memory.readByte(spriteShadow + offset),
    ),
    vram: Array.from(session.videoSnapshot().vram.slice(0x1b00, 0x1b08)),
  }).toEqual({
    shadow: [state[1], state[0], 0, 15, state[3], state[2], 1, 9],
    vram: [state[1], state[0], 0, 15, state[3], state[2], 1, 9],
  });

  const right = MATRIX_ASCII_MAP["6"]?.[0];
  expect(right).toBeDefined();
  session.pressMatrixKey(right!.row, right!.col);
  session.runUntil((machine) => machine.memory.readByte("PlayerX") === 121, {
    maxInstructions: 100_000,
    maxCycles: 1_000_000,
  });
  session.releaseMatrixKey(right!.row, right!.col);
  session.runUntil(
    (machine) =>
      machine.cpu.getPC() === spriteSet && machine.cpu.getRegisters().d === 121,
    { maxInstructions: 100_000, maxCycles: 1_000_000 },
    "moved player sprite prepared",
  );
  session.runUntil(
    (machine) => machine.cpu.getPC() === pollBindings,
    { maxInstructions: 100_000, maxCycles: 1_000_000 },
    "moved player sprite committed",
  );

  const video = session.videoSnapshot();
  expect(video.vram[0x1b01]).toBe(121);
  expect(video.videoStandard).toBe("pal");

  session.memory.writeByte("TargetX", session.memory.readByte("PlayerX"));
  session.memory.writeByte("TargetY", session.memory.readByte("PlayerY"));
  session.memory.writeByte(
    "Changed0",
    session.memory.readByte("Changed0") | 0x0c,
  );
  session.memory.writeByte("Next0", session.memory.readByte("Next0") | 0x0c);
  session.runUntil(
    (machine) => machine.memory.readByte("Score") === 1,
    { maxInstructions: 100_000, maxCycles: 1_000_000 },
    "arranged collision scored",
  );
  session.runVideoFrames(3, {
    maxInstructions: 100_000,
    maxCycles: 300_000,
  });
  expect(session.videoStateSnapshot().frameCount).toBeGreaterThanOrEqual(3);
});
