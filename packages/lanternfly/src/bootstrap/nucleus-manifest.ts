/**
 * The nucleus lowering table, as data, so every sequence is assembled.
 *
 * `docs/nucleus-lowering.md` carried Z80 sequences and byte counts written
 * from memory. Two were wrong: `LD A,(a) / SUB (b)` does not assemble because
 * `SUB (nn)` is not an instruction, and "build a word" was quoted at two bytes,
 * which holds only when both halves are already in registers.
 *
 * Neither survives a call to the assembler, and the assembler was available the
 * whole time. This manifest exists so that no sequence reaches the document
 * without going through it.
 *
 * Byte counts are **not** written here. `test/nucleus-lowering.test.ts`
 * assembles each entry and the generator writes the measured length into the
 * document, so a count cannot disagree with the assembler by construction.
 */

export interface NucleusShape {
  /** How the document names it. */
  readonly label: string;
  /** The construct as a nucleus programmer writes it. */
  readonly construct: string;
  readonly mnemonics: readonly string[];
  readonly section: NucleusSection;
  /**
   * Stated when the sequence holds only under a condition, so the document
   * cannot quote it as though it were general.
   */
  readonly given?: string;
}

export type NucleusSection = "registers" | "halves" | "arithmetic" | "conditions" | "control" | "block";

export const NUCLEUS_SECTIONS: Record<NucleusSection, string> = {
  registers: "Register access",
  halves: "Taking a word's halves",
  arithmetic: "Arithmetic",
  conditions: "Conditions",
  control: "Control",
  block: "Block operations and tables",
};

/** Sample addresses. The register banks sit at $9000, a table at $9200. */
const W = "$9010";
const B = "$9005";
const IDX = "$9100";
const TARGET = "$0200";

export const NUCLEUS_LOWERING: readonly NucleusShape[] = [
  {
    label: "read a word register, constant index",
    construct: "`w[5]`",
    mnemonics: [`LD HL,(${W})`],
    section: "registers",
  },
  {
    label: "write a word register, constant index",
    construct: "`w[5] = …`",
    mnemonics: [`LD (${W}),HL`],
    section: "registers",
  },
  {
    label: "read a byte register, constant index",
    construct: "`b[5]`",
    mnemonics: [`LD A,(${B})`],
    section: "registers",
  },
  {
    label: "write a byte register, constant index",
    construct: "`b[5] = …`",
    mnemonics: [`LD (${B}),A`],
    section: "registers",
  },
  {
    label: "read a word register, variable index",
    construct: "`w[i]`",
    given: "the index is a `u16`; a `u8` index uses the form below",
    mnemonics: [
      `LD HL,(${IDX})`,
      "ADD HL,HL",
      "LD DE,$9000",
      "ADD HL,DE",
      "LD E,(HL)",
      "INC HL",
      "LD D,(HL)",
      "EX DE,HL",
    ],
    section: "registers",
  },
  {
    label: "read a word register, byte index",
    construct: "`w[i]` where `i` is a `u8`",
    given: "a byte index is loaded through `A`; `LD HL,(i)` would read the adjacent byte as the high half",
    mnemonics: [
      `LD A,(${IDX})`,
      "LD L,A",
      "LD H,0",
      "ADD HL,HL",
      "LD DE,$9000",
      "ADD HL,DE",
      "LD E,(HL)",
      "INC HL",
      "LD D,(HL)",
      "EX DE,HL",
    ],
    section: "registers",
  },
  {
    label: "read a byte register, byte index",
    construct: "`b[i]` where `i` is a `u8`",
    mnemonics: [`LD A,(${IDX})`, "LD L,A", "LD H,$90", "LD A,(HL)"],
    section: "registers",
  },
  {
    label: "bounds check on a variable index",
    construct: "every non-constant subscript",
    mnemonics: ["LD DE,$0040", `CALL ${TARGET}`],
    section: "registers",
  },

  {
    label: "low half",
    construct: "`u8(w and 255)`",
    given: "the word is in `HL`",
    mnemonics: ["LD A,L"],
    section: "halves",
  },
  {
    label: "high half",
    construct: "`u8(w / 256)`",
    given: "the word is in `HL`",
    mnemonics: ["LD A,H"],
    section: "halves",
  },
  {
    label: "build a word, halves in registers",
    construct: "`hi * 256 + lo`",
    given: "**both halves are already in registers** — this is the case the document first quoted as general, and it is not",
    mnemonics: ["LD H,B", "LD L,C"],
    section: "halves",
  },
  {
    label: "build a word, halves in memory",
    construct: "`hi * 256 + lo`",
    given: "the ordinary case, both halves being byte variables",
    mnemonics: ["LD A,($9000)", "LD H,A", "LD A,($9001)", "LD L,A"],
    section: "halves",
  },

  {
    label: "add",
    construct: "`a + b`",
    mnemonics: ["ADD HL,DE"],
    section: "arithmetic",
  },
  {
    label: "subtract",
    construct: "`a - b`",
    mnemonics: ["EX DE,HL", "OR A", "SBC HL,DE"],
    section: "arithmetic",
  },
  {
    label: "byte subtract, round-trip position",
    construct: "`d = a - b`, all `u8`",
    given: "the round-trip conditions in `nucleus-review-actions.md` all hold",
    mnemonics: ["LD HL,$9001", "LD A,($9000)", "SUB (HL)"],
    section: "arithmetic",
  },
  {
    label: "multiply or divide",
    construct: "`a * b`, `a / b`",
    mnemonics: [`CALL ${TARGET}`],
    section: "arithmetic",
  },
  {
    label: "shift a word left one",
    construct: "`a * 2`",
    mnemonics: ["ADD HL,HL"],
    section: "arithmetic",
  },
  {
    label: "test a single bit",
    construct: "`a and <single-bit constant>`",
    given: "the value is addressed through `HL`",
    mnemonics: ["BIT 3,(HL)"],
    section: "arithmetic",
  },

  {
    label: "test a stored Boolean",
    construct: "`if flag then`, `x <> 0`",
    mnemonics: [`LD A,(${B})`, "OR A"],
    section: "conditions",
  },
  {
    label: "a computed comparison",
    construct: "`a < b` and the other five",
    given: "the helper returns 0 or 1 in `A`, so no transfer follows",
    mnemonics: [`CALL ${TARGET}`],
    section: "conditions",
  },
  {
    label: "invert a stored Boolean",
    construct: "`not flag`",
    mnemonics: ["XOR $01"],
    section: "conditions",
  },

  {
    label: "unconditional jump",
    construct: "`while`, `exit`, `continue`, an `else` arm's skip",
    mnemonics: [`JP ${TARGET}`],
    section: "control",
  },
  {
    label: "jump if false",
    construct: "`if` and `while`, entering the body",
    given: "the condition is already in `A`",
    mnemonics: ["OR A", `JP Z,${TARGET}`],
    section: "control",
  },
  {
    label: "jump if true",
    construct: "`exit` on a condition",
    given: "the condition is already in `A`",
    mnemonics: ["OR A", `JP NZ,${TARGET}`],
    section: "control",
  },
  {
    label: "call",
    construct: "a call statement",
    mnemonics: [`CALL ${TARGET}`],
    section: "control",
  },
  {
    label: "call, restart-eligible",
    construct: "one of the six or seven hottest routines",
    mnemonics: ["RST $10"],
    section: "control",
  },
  {
    label: "return",
    construct: "`return`, and the implicit one at a body's end",
    mnemonics: ["RET"],
    section: "control",
  },
  {
    label: "select dispatch",
    construct: "`select` on a dense `u8` selector",
    given: "the selector is in `A` and normalised to zero, and the address table is page-aligned; the range check is separate",
    mnemonics: [
      "LD H,$92",
      "ADD A,A",
      "LD L,A",
      "LD E,(HL)",
      "INC HL",
      "LD D,(HL)",
      "EX DE,HL",
      "JP (HL)",
    ],
    section: "control",
  },
  {
    label: "select range check",
    construct: "the guard that falls to `else`",
    given: "the selector is in `A`; `span` is the case count",
    mnemonics: ["CP $19", `JP NC,${TARGET}`],
    section: "control",
  },
  {
    label: "select base normalisation",
    construct: "a case span not starting at zero",
    mnemonics: ["SUB $05"],
    section: "control",
  },

  {
    label: "whole-array assignment",
    construct: "`destination = source`",
    mnemonics: ["LD HL,$9000", "LD DE,$9100", "LD BC,$0040", "LDIR"],
    section: "block",
  },
  {
    label: "fill",
    construct: "`fill(a, v)`, and `clear(a)` with zero",
    mnemonics: ["LD HL,$9000", "LD (HL),$00", "LD DE,$9001", "LD BC,$003F", "LDIR"],
    section: "block",
  },
  {
    label: "page-aligned table lookup",
    construct: "a 256-entry byte table subscripted by a `u8`",
    given: "the subscript is in `A`",
    mnemonics: ["LD H,$92", "LD L,A", "LD A,(HL)"],
    section: "block",
  },
];
