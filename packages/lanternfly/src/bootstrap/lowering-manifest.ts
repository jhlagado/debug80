/**
 * The level-0 lowering table, as data.
 *
 * Review finding 28: the document, the tests and the source each carried
 * their own copy of these sequences. This is the single copy. The document's
 * tables are generated from it, the tests assemble its mnemonics through AZM
 * and compare them against the bytes read out of the Lanternfly source, and
 * nothing here is written twice.
 */

export interface LoweringShape {
  /** The emitting routine in the Lanternfly source, if there is one. */
  readonly routine?: string;
  /**
   * Which branch of that routine, named by its `if` condition. Omitted for a
   * straight-line routine.
   */
  readonly guard?: string;
  /** Which arm of that branch. Defaults to the `then` arm. */
  readonly branch?: "then" | "else";
  /** How the routine is named in the document, when that differs. */
  readonly label?: string;
  /** The construct as a level-0 programmer writes it. */
  readonly construct: string;
  readonly mnemonics: readonly string[];
  readonly section: Section;
}

export type Section = "expressions" | "scalars" | "elements" | "control";

export const SECTION_TITLES: Record<Section, string> = {
  expressions: "Expressions",
  scalars: "Scalar access",
  elements: "Element access",
  control: "Control",
};

/** The address or immediate a hole carries in the assembled vectors. */
export const SAMPLE_ADDRESS = 0x1234;

export const LOWERING: readonly LoweringShape[] = [
  {
    routine: "emitLoadAccumulator",
    construct: "materialise a constant",
    mnemonics: ["LD HL,$1234"],
    section: "expressions",
  },
  {
    routine: "emitLoadOperand",
    construct: "materialise a constant left operand",
    mnemonics: ["LD DE,$1234"],
    section: "expressions",
  },
  {
    label: "save the left operand",
    construct: "save the left operand across the right",
    mnemonics: ["PUSH HL"],
    section: "expressions",
  },
  {
    label: "restore the left operand",
    construct: "restore the left operand",
    mnemonics: ["POP DE"],
    section: "expressions",
  },
  {
    routine: "emitAdd",
    construct: "`a + b`",
    mnemonics: ["ADD HL,DE"],
    section: "expressions",
  },
  {
    routine: "emitSubtract",
    construct: "`a - b`",
    mnemonics: ["EX DE,HL", "OR A", "SBC HL,DE"],
    section: "expressions",
  },
  {
    routine: "emitNegate",
    construct: "`-a`, computed operand",
    mnemonics: ["EX DE,HL", "LD HL,$0000", "OR A", "SBC HL,DE"],
    section: "expressions",
  },
  {
    routine: "emitBooleanOr",
    construct: "`a or b`, Boolean operands",
    mnemonics: ["LD A,L", "OR E", "LD L,A", "LD H,$00"],
    section: "expressions",
  },
  {
    routine: "emitBooleanAnd",
    construct: "`a and b`, Boolean operands",
    mnemonics: ["LD A,L", "AND E", "LD L,A", "LD H,$00"],
    section: "expressions",
  },
  {
    routine: "emitBooleanNot",
    construct: "`not a`, Boolean operand",
    mnemonics: ["LD A,L", "XOR $01", "LD L,A", "LD H,$00"],
    section: "expressions",
  },
  {
    routine: "emitHelperCall",
    construct: "`a * b`, `a / b`, every computed comparison",
    mnemonics: ["CALL $1234"],
    section: "expressions",
  },

  {
    routine: "emitLoadSymbol",
    guard: "isByteWide(symbolType[slot])",
    label: "emitLoadSymbol, byte-wide",
    construct: "read a `u8` or `boolean` variable",
    mnemonics: ["LD A,($1234)", "LD L,A", "LD H,$00"],
    section: "scalars",
  },
  {
    routine: "emitLoadSymbol",
    guard: "isByteWide(symbolType[slot])",
    branch: "else",
    label: "emitLoadSymbol, sixteen-bit",
    construct: "read a `u16` or `i16` variable",
    mnemonics: ["LD HL,($1234)"],
    section: "scalars",
  },
  {
    routine: "emitStoreSymbol",
    guard: "isByteWide(symbolType[slot])",
    label: "emitStoreSymbol, byte-wide",
    construct: "assign to a `u8` or `boolean` variable",
    mnemonics: ["LD A,L", "LD ($1234),A"],
    section: "scalars",
  },
  {
    routine: "emitStoreSymbol",
    guard: "isByteWide(symbolType[slot])",
    branch: "else",
    label: "emitStoreSymbol, sixteen-bit",
    construct: "assign to a `u16` or `i16` variable",
    mnemonics: ["LD ($1234),HL"],
    section: "scalars",
  },

  {
    label: "element address, byte-wide",
    construct: "address of `a[i]`, byte-wide element",
    mnemonics: ["LD DE,$1234", "CALL $1234", "LD DE,$1234", "ADD HL,DE"],
    section: "elements",
  },
  {
    label: "element address, sixteen-bit",
    construct: "address of `a[i]`, sixteen-bit element",
    mnemonics: ["LD DE,$1234", "CALL $1234", "ADD HL,HL", "LD DE,$1234", "ADD HL,DE"],
    section: "elements",
  },
  {
    routine: "referenceElement",
    guard: "isByteWide(kind)",
    label: "referenceElement, byte-wide",
    construct: "read `a[i]`, byte-wide, address in HL",
    mnemonics: ["LD A,(HL)", "LD L,A", "LD H,$00"],
    section: "elements",
  },
  {
    routine: "referenceElement",
    guard: "isByteWide(kind)",
    branch: "else",
    label: "referenceElement, sixteen-bit",
    construct: "read `a[i]`, sixteen-bit, address in HL",
    mnemonics: ["LD E,(HL)", "INC HL", "LD D,(HL)", "EX DE,HL"],
    section: "elements",
  },
  {
    routine: "emitStoreElement",
    guard: "isByteWide(kind)",
    label: "emitStoreElement, byte-wide",
    construct: "assign to `a[i]`, address in DE, value in HL",
    mnemonics: ["LD A,L", "LD (DE),A"],
    section: "elements",
  },
  {
    routine: "emitStoreElement",
    guard: "isByteWide(kind)",
    branch: "else",
    label: "emitStoreElement, sixteen-bit",
    construct: "assign to `a[i]`, address in DE, value in HL",
    mnemonics: ["EX DE,HL", "LD (HL),E", "INC HL", "LD (HL),D"],
    section: "elements",
  },

  {
    routine: "emitTest",
    construct: "reduce the accumulator to a flag",
    mnemonics: ["LD A,L", "OR H"],
    section: "control",
  },
  {
    routine: "emitJump",
    construct: "`while`, `for`, `exit`, `continue`, an `else` arm's skip",
    mnemonics: ["JP $1234"],
    section: "control",
  },
  {
    routine: "emitJumpIfFalse",
    construct: "`if` and `while`, entering the body",
    mnemonics: ["LD A,L", "OR H", "JP Z,$1234"],
    section: "control",
  },
  {
    routine: "emitJumpIfTrue",
    construct: "`for`, leaving at the limit",
    mnemonics: ["LD A,L", "OR H", "JP NZ,$1234"],
    section: "control",
  },
  {
    label: "call",
    construct: "a call, once its arguments are stored",
    mnemonics: ["CALL $1234"],
    section: "control",
  },
  {
    label: "return",
    construct: "`return`, and the implicit one at a body's end",
    mnemonics: ["RET"],
    section: "control",
  },
];

/**
 * Shapes the source emits inline rather than through a routine, and shapes
 * whose routine mixes emission with parsing. They are checked against the
 * assembler but not read back out of the source, and saying so here keeps
 * the coverage claim honest.
 */
export const NOT_EXTRACTED: readonly string[] = [
  "save the left operand",
  "restore the left operand",
  "call",
  "return",
  // `emitElementAddress` interleaves parsing with emission — it calls
  // `parseExpression` and `settleExpression` — so its sequence cannot be read
  // out of the source by a reader that only follows `emit` calls.
  "element address, byte-wide",
  "element address, sixteen-bit",
];

/** The document's own name for a shape. */
export function displayName(shape: LoweringShape): string {
  return shape.label ?? shape.routine ?? shape.construct;
}
