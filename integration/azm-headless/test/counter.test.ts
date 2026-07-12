import path from "node:path";

import { compile } from "@jhlagado/azm/compile";
import {
  createTec1gHeadlessSession,
  parseIntelHex,
} from "@jhlagado/debug80-runtime";
import { expect, it } from "vitest";

const fixture = path.resolve(import.meta.dirname, "../fixtures/counter.asm");

it("assembles and executes an AZM program through the headless runtime", async () => {
  const result = await compile(fixture, {
    emitBin: false,
    emitHex: true,
    emitD8m: true,
  });
  expect(
    result.diagnostics.filter((diagnostic) => diagnostic.severity === "error"),
  ).toEqual([]);

  const hex = result.artifacts.find((artifact) => artifact.kind === "hex");
  const d8 = result.artifacts.find((artifact) => artifact.kind === "d8m");
  if (hex?.kind !== "hex" || d8?.kind !== "d8m") {
    throw new Error("AZM did not produce HEX and D8 artifacts");
  }

  const session = createTec1gHeadlessSession({
    program: parseIntelHex(hex.text),
    debugMap: d8.json,
    entry: "Start",
    stackPointer: 0x7fff,
    config: {
      regions: [{ start: 0x4000, end: 0x7fff, kind: "ram" }],
      appStart: 0x4000,
      entry: 0x4000,
      updateMs: 1_000_000,
    },
  });

  session.runUntil((machine) => machine.memory.readByte("Counter") === 1, {
    maxInstructions: 16,
    maxCycles: 128,
  });

  expect(session.memory.readByte("Counter")).toBe(1);
  expect(session.symbols.address("Start")).toBe(0x4000);
});
