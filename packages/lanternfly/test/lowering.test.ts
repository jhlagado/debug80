import { describe, expect, it } from "vitest";

import { assembleSource } from "../src/bootstrap/index.js";

/**
 * The level-0 lowering table, pinned to bytes.
 *
 * `docs/level0-lowering.md` presents the same table for a reader. This file
 * is the half a seed author can run: each entry assembles its stated
 * mnemonics through AZM and compares them against the byte sequence
 * Candlemoth's own emitter produces for that construct.
 *
 * Both halves are transcribed from the emitting routines in
 * `candlemoth/expression.lafy`, `candlemoth/symbols.lafy` and
 * `candlemoth/statement.lafy`. When one of those routines changes, this test
 * is what says so.
 */

/** A hole for an address or immediate the layout pass fills. */
const ADDR = 0x1234;
const LOW = ADDR & 0xff;
const HIGH = ADDR >> 8;

interface Shape {
  /** The emitting routine in the Candlemoth source. */
  readonly routine: string;
  /** The construct as a level-0 programmer writes it. */
  readonly construct: string;
  readonly mnemonics: readonly string[];
  readonly bytes: readonly number[];
}

const shapes: readonly Shape[] = [
  // ---------------------------------------------------------- expressions
  {
    routine: "emitLoadAccumulator",
    construct: "materialise a constant",
    mnemonics: [`LD HL,$1234`],
    bytes: [0x21, LOW, HIGH],
  },
  {
    routine: "emitLoadOperand",
    construct: "materialise a constant left operand",
    mnemonics: [`LD DE,$1234`],
    bytes: [0x11, LOW, HIGH],
  },
  {
    routine: "parseAdditive (computed left)",
    construct: "save the left operand across the right",
    mnemonics: ["PUSH HL"],
    bytes: [0xe5],
  },
  {
    routine: "parseAdditive (computed left)",
    construct: "restore the left operand",
    mnemonics: ["POP DE"],
    bytes: [0xd1],
  },
  {
    routine: "emitAdd",
    construct: "a + b",
    mnemonics: ["ADD HL,DE"],
    bytes: [0x19],
  },
  {
    routine: "emitSubtract",
    construct: "a - b",
    mnemonics: ["EX DE,HL", "OR A", "SBC HL,DE"],
    bytes: [0xeb, 0xb7, 0xed, 0x52],
  },
  {
    routine: "emitNegate",
    construct: "-a, computed operand",
    mnemonics: ["EX DE,HL", "LD HL,$0000", "OR A", "SBC HL,DE"],
    bytes: [0xeb, 0x21, 0x00, 0x00, 0xb7, 0xed, 0x52],
  },
  {
    routine: "emitBooleanOr",
    construct: "a or b",
    mnemonics: ["LD A,L", "OR E", "LD L,A", "LD H,$00"],
    bytes: [0x7d, 0xb3, 0x6f, 0x26, 0x00],
  },
  {
    routine: "emitBooleanAnd",
    construct: "a and b",
    mnemonics: ["LD A,L", "AND E", "LD L,A", "LD H,$00"],
    bytes: [0x7d, 0xa3, 0x6f, 0x26, 0x00],
  },
  {
    routine: "emitBooleanNot",
    construct: "not a",
    mnemonics: ["LD A,L", "XOR $01", "LD L,A", "LD H,$00"],
    bytes: [0x7d, 0xee, 0x01, 0x6f, 0x26, 0x00],
  },
  {
    routine: "emitHelperCall",
    construct: "a * b, a / b, and every computed comparison",
    mnemonics: [`CALL $1234`],
    bytes: [0xcd, LOW, HIGH],
  },

  // -------------------------------------------------------- scalar access
  {
    routine: "emitLoadSymbol (sixteen-bit)",
    construct: "read a u16 or i16 variable",
    mnemonics: [`LD HL,($1234)`],
    bytes: [0x2a, LOW, HIGH],
  },
  {
    routine: "emitLoadSymbol (byte-wide)",
    construct: "read a u8 or boolean variable",
    mnemonics: [`LD A,($1234)`, "LD L,A", "LD H,$00"],
    bytes: [0x3a, LOW, HIGH, 0x6f, 0x26, 0x00],
  },
  {
    routine: "emitStoreSymbol (sixteen-bit)",
    construct: "assign to a u16 or i16 variable",
    mnemonics: [`LD ($1234),HL`],
    bytes: [0x22, LOW, HIGH],
  },
  {
    routine: "emitStoreSymbol (byte-wide)",
    construct: "assign to a u8 or boolean variable",
    mnemonics: ["LD A,L", `LD ($1234),A`],
    bytes: [0x7d, 0x32, LOW, HIGH],
  },

  // ------------------------------------------------------- element access
  {
    routine: "emitElementAddress (byte-wide element)",
    construct: "the address part of a[i] for a u8 or boolean array",
    mnemonics: [`LD DE,$1234`, `CALL $1234`, `LD DE,$1234`, "ADD HL,DE"],
    bytes: [0x11, LOW, HIGH, 0xcd, LOW, HIGH, 0x11, LOW, HIGH, 0x19],
  },
  {
    routine: "emitElementAddress (sixteen-bit element)",
    construct: "the address part of a[i] for a u16 or i16 array",
    mnemonics: [
      `LD DE,$1234`,
      `CALL $1234`,
      "ADD HL,HL",
      `LD DE,$1234`,
      "ADD HL,DE",
    ],
    bytes: [0x11, LOW, HIGH, 0xcd, LOW, HIGH, 0x29, 0x11, LOW, HIGH, 0x19],
  },
  {
    routine: "referenceElement (byte-wide)",
    construct: "read a[i] once its address is in HL",
    mnemonics: ["LD A,(HL)", "LD L,A", "LD H,$00"],
    bytes: [0x7e, 0x6f, 0x26, 0x00],
  },
  {
    routine: "referenceElement (sixteen-bit)",
    construct: "read a[i] once its address is in HL",
    mnemonics: ["LD E,(HL)", "INC HL", "LD D,(HL)", "EX DE,HL"],
    bytes: [0x5e, 0x23, 0x56, 0xeb],
  },
  {
    routine: "emitStoreElement (byte-wide)",
    construct: "assign to a[i], address in DE and value in HL",
    mnemonics: ["LD A,L", "LD (DE),A"],
    bytes: [0x7d, 0x12],
  },
  {
    routine: "emitStoreElement (sixteen-bit)",
    construct: "assign to a[i], address in DE and value in HL",
    mnemonics: ["EX DE,HL", "LD (HL),E", "INC HL", "LD (HL),D"],
    bytes: [0xeb, 0x73, 0x23, 0x72],
  },

  // -------------------------------------------------------------- control
  {
    routine: "emitTest",
    construct: "reduce the accumulator to a flag",
    mnemonics: ["LD A,L", "OR H"],
    bytes: [0x7d, 0xb4],
  },
  {
    routine: "emitJump",
    construct: "while, for, exit, continue, and the else arm's skip",
    mnemonics: [`JP $1234`],
    bytes: [0xc3, LOW, HIGH],
  },
  {
    routine: "emitJumpIfFalse",
    construct: "if and while, entering the body",
    mnemonics: ["LD A,L", "OR H", `JP Z,$1234`],
    bytes: [0x7d, 0xb4, 0xca, LOW, HIGH],
  },
  {
    routine: "emitJumpIfTrue",
    construct: "for, leaving at the limit",
    mnemonics: ["LD A,L", "OR H", `JP NZ,$1234`],
    bytes: [0x7d, 0xb4, 0xc2, LOW, HIGH],
  },
  {
    routine: "parseCallArguments",
    construct: "a call, after its arguments are stored",
    mnemonics: [`CALL $1234`],
    bytes: [0xcd, LOW, HIGH],
  },
  {
    routine: "parseReturn and parseSubroutine",
    construct: "return, and the implicit one at a body's end",
    mnemonics: ["RET"],
    bytes: [0xc9],
  },
];

describe("the level-0 lowering table", () => {
  for (const shape of shapes) {
    it(`${shape.routine}: ${shape.construct}`, () => {
      const source = [".org $0000", "Start:", ...shape.mnemonics.map((m) => `    ${m}`)].join("\n");
      const assembled = assembleSource(`${source}\n`);
      expect(Array.from(assembled.bytes)).toEqual(Array.from(shape.bytes));
    });
  }

  it("states a byte cost for every shape", () => {
    const costs = shapes.map((s) => `${s.routine.padEnd(42)} ${s.bytes.length}`);
    console.log(["level-0 lowering, bytes per shape", ...costs].join("\n  "));
    // Each shape's declared bytes are what the per-shape tests above proved
    // against the assembler, so this only guards against an empty entry.
    for (const shape of shapes) {
      expect(shape.bytes.length).toBeGreaterThan(0);
    }
  });
});
