/** Canonical numeric contract for Nucleus Virtual Machine 0.1. */

export const VM_FORMAT_MAJOR = 0;
export const VM_FORMAT_MINOR = 1;
export const SERVICE_FORMAT_MAJOR = 0;
export const SERVICE_FORMAT_MINOR = 1;
export const VM_HEADER_SIZE = 32;
export const VM_ROUTINE_DESCRIPTOR_SIZE = 8;
export const VM_SLOT_COUNT = 128;
export const VM_ARGUMENT_COUNT = 16;
export const VM_MAX_ROUTINES = 255;

export const RoutineFlag = {
  result: 0x01,
  failable: 0x02,
} as const;

export const Trap = {
  bounds: 0x01,
  narrowing: 0x02,
  divisionByZero: 0x03,
  loopRange: 0x04,
  activationCapacity: 0x05,
  unhandledError: 0x06,
} as const;

export const Service = {
  readInputByte: 0x00,
  writeOutputByte: 0x01,
  readStorageByte: 0x02,
  rewindStorageInput: 0x03,
  writeStorageByte: 0x04,
  seekStorageOutput: 0x05,
} as const;

export const ServiceError = {
  endOfInput: 0x01,
  inputFailure: 0x02,
  outputFailure: 0x03,
  storageFailure: 0x04,
} as const;

export type OperandKind =
  | "slot"
  | "argument"
  | "u8"
  | "u16"
  | "code-offset"
  | "routine"
  | "service"
  | "trap";

export interface OpcodeDefinition {
  readonly code: number;
  readonly mnemonic: string;
  readonly operands: readonly OperandKind[];
  readonly summary: string;
}

export const OPCODES = [
  op(0x00, "nop", [], "Do nothing."),
  op(0x01, "ldi8", ["u8", "slot"], "Write a zero-extended byte constant."),
  op(0x02, "ldi16", ["u16", "slot"], "Write a word constant."),
  op(0x03, "mov", ["slot", "slot"], "Copy one complete slot."),
  op(0x04, "arg", ["slot", "argument"], "Stage one argument carrier."),
  op(0x05, "getr", ["slot"], "Consume one successful result carrier."),
  op(0x06, "gete", ["slot"], "Consume one recoverable error code."),

  op(0x08, "jmp", ["code-offset"], "Branch unconditionally."),
  op(0x09, "jz", ["slot", "code-offset"], "Branch on canonical false."),
  op(0x0a, "jnz", ["slot", "code-offset"], "Branch on canonical true."),
  op(0x0b, "jfail", ["code-offset"], "Branch on failed completion."),
  op(0x0c, "trap", ["trap"], "Stop with an explicit safety trap."),

  ...binaryFamily(0x10, "8"),
  ...binaryFamily(0x18, "16"),
  op(0x20, "neg8", ["slot", "slot"], "Negate modulo 256."),
  op(0x21, "neg16", ["slot", "slot"], "Negate modulo 65,536."),
  op(0x22, "not8", ["slot", "slot"], "Complement the low byte."),
  op(0x23, "not16", ["slot", "slot"], "Complement the word."),
  op(0x24, "lnot", ["slot", "slot"], "Invert a canonical Boolean."),
  op(0x25, "narrow8", ["slot", "slot"], "Check and narrow a word to a byte."),

  ...compareFamily(0x28, "8"),
  ...compareFamily(0x30, "16"),

  op(0x40, "addri", ["u16", "slot"], "Write a constant data offset."),
  op(
    0x41,
    "addo",
    ["slot", "u16", "u16", "slot"],
    "Form a checked constant-offset subobject address.",
  ),
  op(
    0x42,
    "index",
    ["slot", "slot", "u16", "u16", "slot"],
    "Form a checked fixed-array element address.",
  ),
  op(
    0x43,
    "strlen",
    ["slot", "u8", "slot"],
    "Read a checked bounded-string length.",
  ),
  op(
    0x44,
    "stridx",
    ["slot", "slot", "u8", "slot"],
    "Form the checked address of an existing string byte.",
  ),
  op(0x48, "load8", ["slot", "slot"], "Load and zero-extend one data byte."),
  op(0x49, "load16", ["slot", "slot"], "Load one little-endian data word."),
  op(0x4a, "store8", ["slot", "slot"], "Store the low byte to data."),
  op(0x4b, "store16", ["slot", "slot"], "Store one little-endian data word."),

  op(0x50, "call", ["routine"], "Invoke one bytecode routine."),
  op(0x51, "svc", ["service"], "Invoke one Nucleus System Service."),
  op(0x52, "ret", [], "Return success without a result."),
  op(0x53, "retv", ["slot"], "Return success with one carrier."),
  op(0x54, "fail", ["slot"], "Return failure with one byte error code."),
] as const satisfies readonly OpcodeDefinition[];

function op(
  code: number,
  mnemonic: string,
  operands: readonly OperandKind[],
  summary: string,
): OpcodeDefinition {
  return { code, mnemonic, operands, summary };
}

function binaryFamily(
  base: number,
  width: "8" | "16",
): readonly OpcodeDefinition[] {
  const names = ["add", "sub", "mul", "div", "and", "or"] as const;
  return names.map((name, index) =>
    op(
      base + index,
      `${name}${width}`,
      ["slot", "slot", "slot"],
      `${name} two ${width}-bit values.`,
    ),
  );
}

function compareFamily(
  base: number,
  width: "8" | "16",
): readonly OpcodeDefinition[] {
  const names = ["eq", "ne", "lt", "le", "gt", "ge"] as const;
  return names.map((name, index) =>
    op(
      base + index,
      `${name}${width}`,
      ["slot", "slot", "slot"],
      `Compare two unsigned ${width}-bit values.`,
    ),
  );
}

export const opcodeByCode = new Map(
  OPCODES.map((opcode) => [opcode.code, opcode]),
);
export const opcodeByName = new Map(
  OPCODES.map((opcode) => [opcode.mnemonic, opcode]),
);

/**
 * Operations whose byte and word forms have the same complete result for
 * canonical byte inputs. An interpreter may share their arithmetic core after
 * the byte form has checked its carrier precondition; a compiler may select
 * the word form for a statically typed u8 operation. Opcode numbers and their
 * specified meanings remain unchanged.
 */
export const CANONICAL_WIDTH_EQUIVALENTS = {
  div8: "div16",
  and8: "and16",
  or8: "or16",
  eq8: "eq16",
  ne8: "ne16",
  lt8: "lt16",
  le8: "le16",
  gt8: "gt16",
  ge8: "ge16",
} as const satisfies Readonly<Record<string, string>>;

export function canonicalImplementationMnemonic(mnemonic: string): string {
  return (
    CANONICAL_WIDTH_EQUIVALENTS[
      mnemonic as keyof typeof CANONICAL_WIDTH_EQUIVALENTS
    ] ?? mnemonic
  );
}

export function operandWidth(kind: OperandKind): number {
  return kind === "u16" || kind === "code-offset" ? 2 : 1;
}

export function instructionWidth(opcode: OpcodeDefinition): number {
  return (
    1 +
    opcode.operands.reduce((size, operand) => size + operandWidth(operand), 0)
  );
}

export function assertCanonicalDefinition(): void {
  const codes = new Set<number>();
  const names = new Set<string>();
  for (const opcode of OPCODES) {
    if (opcode.code < 0 || opcode.code > 0x7f) {
      throw new Error(
        `${opcode.mnemonic} lies outside the 128-entry dispatch page`,
      );
    }
    if (codes.has(opcode.code))
      throw new Error(`duplicate opcode 0x${opcode.code.toString(16)}`);
    if (names.has(opcode.mnemonic))
      throw new Error(`duplicate mnemonic ${opcode.mnemonic}`);
    if (instructionWidth(opcode) > 8)
      throw new Error(`${opcode.mnemonic} is wider than eight bytes`);
    codes.add(opcode.code);
    names.add(opcode.mnemonic);
  }
}
