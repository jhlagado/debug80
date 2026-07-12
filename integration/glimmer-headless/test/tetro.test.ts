import { copyFileSync, mkdtempSync, readFileSync } from "node:fs";
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
const examples = path.join(repositoryRoot, "packages/glimmer/examples");
const budget = { maxInstructions: 500_000, maxCycles: 5_000_000 };

it("drives Tetro from splash into audible matrix gameplay without Debug80 UI", async () => {
  const directory = mkdtempSync(
    path.join(os.tmpdir(), "glimmer-headless-tetro-"),
  );
  for (const filename of ["tetro.glim", "tetro-rules.glim", "tetro-lib.asm"]) {
    copyFileSync(path.join(examples, filename), path.join(directory, filename));
  }

  const entry = path.join(directory, "tetro.glim");
  const build = await buildGlimmerProgram(entry);
  expect(
    build.diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
  ).toEqual([]);
  const artifacts = build.artifacts;
  if (artifacts?.hex === undefined || artifacts.d8 === undefined) {
    throw new Error("Glimmer did not produce Tetro HEX and D8 artifacts");
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

  session.runUntil(
    (machine) =>
      Boolean(machine.lcdSnapshot().rows[0]?.startsWith("TETRO (PRESS A KEY)")),
    budget,
    "Tetro splash entered",
  );
  const framebuffer = session.symbols.address("Framebuffer");
  session.runUntil(
    (machine) =>
      Array.from({ length: 24 }, (_, offset) =>
        machine.memory.readByte(framebuffer + offset),
      ).some(Boolean),
    budget,
    "splash pixel rendered",
  );
  session.runMatrixScans(2, budget);
  const splashMatrix = session.matrixSnapshot();
  expect(
    splashMatrix.redRows.some((row, index) =>
      Boolean(
        row |
        (splashMatrix.greenRows[index] ?? 0) |
        (splashMatrix.blueRows[index] ?? 0),
      ),
    ),
  ).toBe(true);

  const accept = MATRIX_ASCII_MAP["6"]?.[0];
  expect(accept).toBeDefined();
  session.pressMatrixKey(accept!.row, accept!.col);
  session.runUntil(
    (machine) =>
      Boolean(machine.lcdSnapshot().rows[0]?.startsWith("TETRO RUNNING")),
    budget,
    "Playing card entered",
  );
  session.releaseMatrixKey(accept!.row, accept!.col);
  session.runUntil(
    (machine) => machine.memory.readByte("Glim_HeldKey") === 0xff,
    budget,
    "splash key released",
  );

  const initialX = session.memory.readByte("PlayerX");
  expect(initialX).toBeGreaterThan(0);
  const left = MATRIX_ASCII_MAP["4"]?.[0];
  expect(left).toBeDefined();
  session.pressMatrixKey(left!.row, left!.col);
  session.runUntil(
    (machine) => machine.memory.readByte("MoveLeftP") === 1,
    budget,
    "left input pulse",
  );
  session.releaseMatrixKey(left!.row, left!.col);
  session.runUntil(
    (machine) => machine.memory.readByte("PlayerX") !== initialX,
    budget,
    "left move applied",
  );
  expect(session.memory.readByte("PlayerX")).toBe(initialX - 1);
  session.runUntil(
    (machine) => machine.memory.readByte("Glim_HeldKey") === 0xff,
    budget,
    "left key released",
  );

  session.clearSpeakerEdges();
  const rotate = MATRIX_ASCII_MAP["5"]?.[0];
  expect(rotate).toBeDefined();
  session.pressMatrixKey(rotate!.row, rotate!.col);
  session.runUntil(
    (machine) => machine.speakerSnapshot().edges.length >= 2,
    budget,
    "rotate click",
  );
  session.releaseMatrixKey(rotate!.row, rotate!.col);

  expect(session.speakerSnapshot().edges.some((edge) => edge.level)).toBe(true);
  expect(session.memory.readByte("CurrentCard")).toBe(1);
  session.runUntil(
    (machine) => machine.memory.readByte("Glim_HeldKey") === 0xff,
    budget,
    "rotate key released",
  );

  const boardRows = session.symbols.address("BoardRows");
  const boardRed = session.symbols.address("BoardRed");
  const linesBefore = session.memory.readByte("LinesCleared");
  session.memory.writeByte(boardRows + 7, 0xff);
  session.memory.writeByte(boardRed + 7, 0xff);
  session.memory.writeByte("ClearMask", 0x80);
  session.memory.writeByte("ClearHold", 1);
  session.runUntil(
    (machine) => machine.memory.readByte("LinesCleared") === linesBefore + 1,
    budget,
    "arranged line cleared",
  );
  expect(session.memory.readByte("ClearMask")).toBe(0);
  session.runUntil(
    (machine) => machine.memory.readWord("Score") > 0,
    budget,
    "line-clear score applied",
  );
  expect(session.memory.readWord("Score")).toBeGreaterThan(0);

  const pause = MATRIX_ASCII_MAP["0"]?.[0];
  expect(pause).toBeDefined();
  session.pressMatrixKey(pause!.row, pause!.col);
  session.runUntil(
    (machine) => machine.memory.readByte("CurrentCard") === 2,
    budget,
    "paused",
  );
  session.releaseMatrixKey(pause!.row, pause!.col);
  session.runUntil(
    (machine) => machine.memory.readByte("Glim_HeldKey") === 0xff,
    budget,
    "pause key released",
  );
  session.memory.writeByte("PauseP", 1);
  session.memory.writeByte(
    "Changed2",
    session.memory.readByte("Changed2") | 0x02,
  );
  session.memory.writeByte("Next2", session.memory.readByte("Next2") | 0x02);
  session.runUntil(
    (machine) => machine.memory.readByte("CurrentCard") === 1,
    budget,
    "unpaused",
  );

  session.memory.writeByte("CurrentCard", 3);
  session.memory.writeByte(
    "Changed2",
    session.memory.readByte("Changed2") | 0x40,
  );
  session.memory.writeByte("Next2", session.memory.readByte("Next2") | 0x40);
  session.runUntil(
    (machine) =>
      Boolean(machine.lcdSnapshot().rows[0]?.startsWith("TETRO GAME OVER")),
    budget,
    "GameOver card entered",
  );
  session.runUntil(
    (machine) => machine.memory.readWord("GOverGate") === 384,
    budget,
    "game-over gate initialized",
  );
  session.memory.writeWord("GOverGate", 1);
  session.runUntil(
    (machine) => machine.memory.readByte("Armed") === 1,
    budget,
    "restart armed",
  );
  session.pressMatrixKey(accept!.row, accept!.col);
  session.runUntil(
    (machine) => machine.memory.readByte("CurrentCard") === 0,
    budget,
    "restarted at splash",
  );
  session.releaseMatrixKey(accept!.row, accept!.col);
});
