import { describe, expect, it } from "vitest";

import { BootstrapMachine, assembleSource, imageOf } from "../src/bootstrap/index.js";
import {
  CODE_ORIGIN,
  DATA_ORIGIN,
  MicroError,
  compile,
  tokenize,
} from "../src/spike/micro.js";

/**
 * The compiler spike, against the exit criteria in
 * `docs/compiler-spike.md`.
 *
 * The claim under test is that a forward jump can be back-patched through a
 * streaming output — which is what a single-pass language needs, and what
 * `forward` exists for.
 */

/** Runs a compiled image and returns the bytes it wrote to the code port. */
function run(bytes: Uint8Array, budget = 200_000): { output: number[]; halted: boolean } {
  const machine = new BootstrapMachine({
    program: imageOf(bytes, CODE_ORIGIN),
    entry: CODE_ORIGIN,
  });
  const outcome = machine.runToHalt({ maxInstructions: budget });
  return { output: Array.from(machine.code()), halted: outcome.halted };
}

// ------------------------------------------------------------ criterion 1

describe("a micro-language program compiles to a Z80 image", () => {
  it("produces bytes and places its variables", () => {
    const result = compile("var x as u8\nx = 5\n");
    expect(result.bytes.length).toBeGreaterThan(0);
    expect(result.origin).toBe(CODE_ORIGIN);
    expect(result.variables.get("x")).toBe(DATA_ORIGIN);
  });

  it("collapses consecutive newlines, as both canonical grammars require", () => {
    const kinds = tokenize("var x as u8\n\n\nx = 1\n").map((t) => t.kind);
    expect(kinds.filter((k) => k === "newline")).toHaveLength(2);
  });
});

// ------------------------------------------------------------ criterion 2
//
// The address check is worth nothing if it has never fired. Each sabotage
// makes emission disagree with layout in a different way.

describe("back-patching resolves every forward reference", () => {
  const source = "var x as u8\nx = 3\nwhile x <> 0\nwriteCodeByte(x)\nx = x + 255\nend\n";

  it("compiles clean, with nothing left unresolved", () => {
    const result = compile(source);
    expect(result.patchCount).toBeGreaterThan(0);
    expect(result.peakPatches).toBeGreaterThan(0);
  });

  it("catches a forward reference left unpaid", () => {
    // Without the check this ships as a jump to address zero, which runs.
    expect(() => compile(source, { sabotage: "drop-patch" })).toThrow(
      /unresolved forward references/,
    );
  });

  it("a wrong target changes the emitted bytes", () => {
    const good = compile(source);
    const bad = compile(source, { sabotage: "wrong-target" });
    expect(Array.from(bad.bytes)).not.toEqual(Array.from(good.bytes));
  });

  it("holds far fewer patches than the program has labels", () => {
    // The whole argument against a label table: the list is sized by what is
    // unresolved, not by the program.
    const result = compile(source);
    expect(result.peakPatches).toBeLessThanOrEqual(result.labels.size);
  });
});

// ------------------------------------------------------------ criterion 3
// ------------------------------------------------------------ criterion 4

describe("the image runs and writes the expected bytes", () => {
  it("an assignment and an emit", () => {
    const { bytes } = compile("var x as u8\nx = 42\nwriteCodeByte(x)\n");
    const { output, halted } = run(bytes);
    expect(halted).toBe(true);
    expect(output).toEqual([42]);
  });

  it("an addition, constant and variable", () => {
    const source = [
      "var a as u8",
      "var b as u8",
      "var c as u8",
      "a = 10",
      "b = a + 5", // constant addend
      "c = a + b", // variable addend
      "writeCodeByte(b)",
      "writeCodeByte(c)",
    ].join("\n");
    const { output } = run(compile(source).bytes);
    expect(output).toEqual([15, 25]);
  });

  it("a forward jump over an if body, taken and not taken", () => {
    const source = [
      "var x as u8",
      "var y as u8",
      "x = 1",
      "y = 0",
      "if x <> 0 then",
      "writeCodeByte(x)",
      "end",
      "if y <> 0 then",
      "writeCodeByte(y)", // skipped
      "end",
      "writeCodeByte(x)",
    ].join("\n");
    const { output } = run(compile(source).bytes);
    expect(output).toEqual([1, 1]);
  });

  it("a backward jump closing a while", () => {
    // 255 is -1 in byte arithmetic, so this counts down from 3 to 1.
    const source = [
      "var n as u8",
      "n = 3",
      "while n <> 0",
      "writeCodeByte(n)",
      "n = n + 255",
      "end",
    ].join("\n");
    const { output } = run(compile(source).bytes);
    expect(output).toEqual([3, 2, 1]);
  });

  it("a nested if inside a while", () => {
    const source = [
      "var n as u8",
      "var flag as u8",
      "n = 4",
      "while n <> 0",
      "flag = n + 254", // n - 2, so zero when n is 2
      "if flag <> 0 then",
      "writeCodeByte(n)",
      "end",
      "n = n + 255",
      "end",
    ].join("\n");
    const { output } = run(compile(source).bytes);
    // n = 4, 3, 1 emit; n = 2 is skipped because flag is zero there.
    expect(output).toEqual([4, 3, 1]);
  });
});

// ------------------------------------------------------------ criterion 5

describe("compilation is deterministic", () => {
  it("the same source twice gives identical bytes", () => {
    const source = [
      "var n as u8",
      "n = 5",
      "while n <> 0",
      "if n <> 0 then",
      "writeCodeByte(n)",
      "end",
      "n = n + 255",
      "end",
    ].join("\n");

    const first = compile(source);
    const second = compile(source);
    expect(Array.from(second.bytes)).toEqual(Array.from(first.bytes));
    expect([...second.labels]).toEqual([...first.labels]);
    expect(second.patchCount).toBe(first.patchCount);
  });
});

// ------------------------------------------------------------ criterion 6
//
// Every encoding the lowerer uses, checked against AZM rather than trusted.
// Two errors in this project came from asserting encodings from memory.

describe("every opcode the spike emits is what AZM assembles", () => {
  const encodings: Array<[string, string, number[]]> = [
    ["load a constant", "LD A,$2A", [0x3e, 0x2a]],
    ["load a variable", "LD A,($8000)", [0x3a, 0x00, 0x80]],
    ["store a variable", "LD ($8000),A", [0x32, 0x00, 0x80]],
    ["save the left operand", "LD B,A", [0x47]],
    ["add a register", "ADD A,B", [0x80]],
    ["add a constant", "ADD A,$05", [0xc6, 0x05]],
    ["test for zero", "OR A", [0xb7]],
    ["jump", "JP $0100", [0xc3, 0x00, 0x01]],
    ["jump if zero", "JP Z,$0100", [0xca, 0x00, 0x01]],
    ["write the code port", "OUT ($01),A", [0xd3, 0x01]],
    ["halt", "HALT", [0x76]],
  ];

  for (const [name, mnemonic, expected] of encodings) {
    it(`${name}: ${mnemonic}`, () => {
      const assembled = assembleSource(`.org $0100\nStart:\n    ${mnemonic}\n`);
      expect(Array.from(assembled.bytes)).toEqual(expected);
    });
  }

  it("emits a program AZM assembles to the same bytes", () => {
    // The lowerer's output for a whole program, against the assembler's.
    const compiled = compile("var x as u8\nx = 7\nwriteCodeByte(x)\n");
    const assembled = assembleSource(
      [
        ".org $0100",
        "Start:",
        "    LD   A,$07",
        "    LD   ($8000),A",
        "    LD   A,($8000)",
        "    OUT  ($01),A",
        "    HALT",
      ].join("\n") + "\n",
    );
    expect(Array.from(compiled.bytes)).toEqual(Array.from(assembled.bytes));
  });
});

// -------------------------------------------------------------- reporting

describe("what the spike measured", () => {
  it("reports the layout of a representative program", () => {
    const source = [
      "var n as u8",
      "var flag as u8",
      "n = 4",
      "while n <> 0",
      "flag = n + 254",
      "if flag <> 0 then",
      "writeCodeByte(n)",
      "end",
      "n = n + 255",
      "end",
    ].join("\n");
    const result = compile(source);
    console.log(
      [
        `single-pass spike`,
        `  code             ${result.bytes.length} bytes at 0x${CODE_ORIGIN.toString(16)}`,
        `  variables        ${result.variables.size} at 0x${DATA_ORIGIN.toString(16)}`,
        `  labels           ${result.labels.size}`,
        `  forward patches  ${result.patchCount} paid, ${result.peakPatches} live at peak`,
        `  patch list       ${result.peakPatches * 2} bytes` +
          ` (a label table would be ${result.labels.size * 2})`,
      ].join("\n"),
    );
    expect(result.labels.size).toBe(3);
  });
});
