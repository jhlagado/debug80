import {
  instructionWidth,
  opcodeByCode,
  opcodeByName,
  operandWidth,
  RoutineFlag,
  Service,
  SERVICE_FORMAT_MAJOR,
  SERVICE_FORMAT_MINOR,
  VM_ARGUMENT_COUNT,
  VM_FORMAT_MAJOR,
  VM_FORMAT_MINOR,
  VM_HEADER_SIZE,
  VM_MAX_ROUTINES,
  VM_ROUTINE_DESCRIPTOR_SIZE,
  VM_SLOT_COUNT,
  type OpcodeDefinition,
  type OperandKind,
} from "./vm-definition.js";

export const VM_MAGIC = Uint8Array.of(0x4e, 0x56, 0x4d, 0x31); // NVM1

export interface RoutineDescriptor {
  readonly entry: number;
  readonly end: number;
  readonly parameterCount: number;
  readonly clobberCount: number;
  readonly hasResult: boolean;
  readonly failable: boolean;
}

export interface DecodedInstruction {
  readonly offset: number;
  readonly opcode: OpcodeDefinition;
  readonly operands: readonly number[];
  readonly width: number;
}

export interface ValidatedRoutine extends RoutineDescriptor {
  readonly id: number;
  readonly instructions: readonly DecodedInstruction[];
  readonly instructionOffsets: ReadonlySet<number>;
}

export interface ValidatedImage {
  readonly bytes: Uint8Array;
  readonly entryRoutine: number;
  readonly dataSize: number;
  readonly initialData: Uint8Array;
  readonly code: Uint8Array;
  readonly routines: readonly ValidatedRoutine[];
  readonly instructionAt: ReadonlyMap<number, DecodedInstruction>;
  readonly requiredActivationBytes: number;
  readonly requiredActivationDepth: number;
}

export class InvalidImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidImageError";
  }
}

interface ServiceSignature {
  readonly parameters: number;
  readonly result: boolean;
}

export const SERVICE_SIGNATURES: Readonly<Record<number, ServiceSignature>> = {
  [Service.readInputByte]: { parameters: 0, result: true },
  [Service.writeOutputByte]: { parameters: 1, result: false },
  [Service.readStorageByte]: { parameters: 0, result: true },
  [Service.rewindStorageInput]: { parameters: 0, result: false },
  [Service.writeStorageByte]: { parameters: 1, result: false },
  [Service.seekStorageOutput]: { parameters: 1, result: false },
};

export function validateImage(input: Uint8Array): ValidatedImage {
  const bytes = Uint8Array.from(input);
  if (bytes.length < VM_HEADER_SIZE)
    invalid("image is shorter than the 32-byte header");
  for (let index = 0; index < VM_MAGIC.length; index += 1) {
    if (bytes[index] !== VM_MAGIC[index]) invalid("magic is not NVM1");
  }
  if (bytes[4] !== VM_FORMAT_MAJOR || bytes[5] !== VM_FORMAT_MINOR)
    invalid("VM version is not 0.1");
  if (bytes[6] !== SERVICE_FORMAT_MAJOR || bytes[7] !== SERVICE_FORMAT_MINOR) {
    invalid("system-service version is not 0.1");
  }
  if (bytes[8] !== VM_HEADER_SIZE || bytes[9] !== 0)
    invalid("header size or flags are invalid");

  const imageSize = read16(bytes, 10);
  const routineCount = bytes[12];
  const entryRoutine = bytes[13];
  const maximumArguments = bytes[14];
  const slotCount = bytes[15];
  const tableOffset = read16(bytes, 16);
  const initializerOffset = read16(bytes, 18);
  const initializerSize = read16(bytes, 20);
  const codeOffset = read16(bytes, 22);
  const codeSize = read16(bytes, 24);
  const dataSize = read16(bytes, 26);
  const requiredActivationBytes = read16(bytes, 28);
  const requiredActivationDepth = bytes[30];
  const reserved = bytes[31];

  if (imageSize !== bytes.length)
    invalid("recorded image size differs from the byte length");
  if (routineCount < 1 || routineCount > VM_MAX_ROUTINES)
    invalid("routine count is outside 1..255");
  if (entryRoutine >= routineCount) invalid("entry routine is absent");
  if (maximumArguments !== VM_ARGUMENT_COUNT || slotCount !== VM_SLOT_COUNT) {
    invalid("argument or slot count is not the fixed NVM 0.1 value");
  }
  if (tableOffset !== VM_HEADER_SIZE)
    invalid("routine table does not follow the header");
  const expectedInitializer =
    tableOffset + routineCount * VM_ROUTINE_DESCRIPTOR_SIZE;
  if (initializerOffset !== expectedInitializer)
    invalid("initializer section does not follow the routine table");
  if (codeOffset !== initializerOffset + initializerSize)
    invalid("code does not follow the initializer section");
  if (imageSize !== codeOffset + codeSize)
    invalid("image has a gap or trailing bytes");
  if (requiredActivationBytes < 4 || requiredActivationDepth < 1)
    invalid("activation minima are below one record");
  if (reserved !== 0) invalid("reserved header byte is nonzero");

  const descriptors = decodeDescriptors(
    bytes,
    tableOffset,
    routineCount,
    codeSize,
  );
  const initialData = decodeInitializers(
    bytes.slice(initializerOffset, initializerOffset + initializerSize),
    dataSize,
  );
  const code = bytes.slice(codeOffset, codeOffset + codeSize);
  const routines: ValidatedRoutine[] = [];
  const instructionAt = new Map<number, DecodedInstruction>();
  for (let id = 0; id < descriptors.length; id += 1) {
    const descriptor = descriptors[id];
    const instructions = decodeRoutine(code, descriptor, id);
    const offsets = new Set(
      instructions.map((instruction) => instruction.offset),
    );
    const routine: ValidatedRoutine = {
      ...descriptor,
      id,
      instructions,
      instructionOffsets: offsets,
    };
    routines.push(routine);
    for (const instruction of instructions)
      instructionAt.set(instruction.offset, instruction);
  }
  const entry = routines[entryRoutine];
  if (entry.parameterCount !== 0 || entry.hasResult)
    invalid("entry descriptor has parameters or a result");
  for (const routine of routines)
    validateRoutine(routine, routines, dataSize, instructionAt);

  return {
    bytes,
    entryRoutine,
    dataSize,
    initialData,
    code,
    routines,
    instructionAt,
    requiredActivationBytes,
    requiredActivationDepth,
  };
}

function decodeDescriptors(
  bytes: Uint8Array,
  tableOffset: number,
  count: number,
  codeSize: number,
): readonly RoutineDescriptor[] {
  const result: RoutineDescriptor[] = [];
  let expectedEntry = 0;
  for (let id = 0; id < count; id += 1) {
    const at = tableOffset + id * VM_ROUTINE_DESCRIPTOR_SIZE;
    const entry = read16(bytes, at);
    const end = read16(bytes, at + 2);
    const parameterCount = bytes[at + 4];
    const clobberCount = bytes[at + 5];
    const flags = bytes[at + 6];
    const reserved = bytes[at + 7];
    if (entry !== expectedEntry || end <= entry || end > codeSize)
      invalid(`routine ${id} has a noncanonical extent`);
    if (parameterCount > VM_ARGUMENT_COUNT || parameterCount > clobberCount) {
      invalid(`routine ${id} has an invalid parameter count`);
    }
    if (clobberCount > VM_SLOT_COUNT)
      invalid(`routine ${id} clobbers more than 128 slots`);
    if (
      (flags & ~(RoutineFlag.result | RoutineFlag.failable)) !== 0 ||
      reserved !== 0
    ) {
      invalid(`routine ${id} has an assigned-reserved bit`);
    }
    result.push({
      entry,
      end,
      parameterCount,
      clobberCount,
      hasResult: (flags & RoutineFlag.result) !== 0,
      failable: (flags & RoutineFlag.failable) !== 0,
    });
    expectedEntry = end;
  }
  if (expectedEntry !== codeSize)
    invalid("routine extents do not cover code exactly");
  return result;
}

function decodeInitializers(section: Uint8Array, dataSize: number): Uint8Array {
  if (section.length < 2) invalid("initializer section lacks its record count");
  const result = new Uint8Array(dataSize);
  const count = read16(section, 0);
  let cursor = 2;
  let previousEnd = 0;
  for (let index = 0; index < count; index += 1) {
    if (cursor + 4 > section.length)
      invalid(`initializer ${index} lacks a header`);
    const address = read16(section, cursor);
    const length = read16(section, cursor + 2);
    cursor += 4;
    if (length < 1 || address < previousEnd || address + length > dataSize) {
      invalid(
        `initializer ${index} is empty, unordered, overlapping, or outside data`,
      );
    }
    if (cursor + length > section.length)
      invalid(`initializer ${index} payload is truncated`);
    result.set(section.slice(cursor, cursor + length), address);
    cursor += length;
    previousEnd = address + length;
  }
  if (cursor !== section.length)
    invalid("initializer section has trailing bytes");
  return result;
}

function decodeRoutine(
  code: Uint8Array,
  descriptor: RoutineDescriptor,
  id: number,
): readonly DecodedInstruction[] {
  const result: DecodedInstruction[] = [];
  let offset = descriptor.entry;
  while (offset < descriptor.end) {
    const opcode = opcodeByCode.get(code[offset]);
    if (!opcode)
      invalid(
        `routine ${id} has unknown opcode 0x${hex(code[offset])} at ${offset}`,
      );
    const width = instructionWidth(opcode);
    if (offset + width > descriptor.end)
      invalid(`routine ${id} ends inside ${opcode.mnemonic} at ${offset}`);
    const operands: number[] = [];
    let cursor = offset + 1;
    for (const kind of opcode.operands) {
      operands.push(
        operandWidth(kind) === 2 ? read16(code, cursor) : code[cursor],
      );
      cursor += operandWidth(kind);
    }
    result.push({ offset, opcode, operands, width });
    offset += width;
  }
  return result;
}

function validateRoutine(
  routine: ValidatedRoutine,
  routines: readonly ValidatedRoutine[],
  dataSize: number,
  instructionAt: ReadonlyMap<number, DecodedInstruction>,
): void {
  const expectedGetr = new Set<number>();
  const expectedGete = new Map<number, number>();
  const expectedJfail = new Set<number>();
  const branchOwners = new Map<number, number[]>();

  for (const instruction of routine.instructions) {
    validateOperands(instruction, routine, routines, dataSize);
    for (
      let index = 0;
      index < instruction.opcode.operands.length;
      index += 1
    ) {
      if (instruction.opcode.operands[index] !== "code-offset") continue;
      const target = instruction.operands[index];
      if (!routine.instructionOffsets.has(target))
        invalid(
          `${instruction.opcode.mnemonic} at ${instruction.offset} has a bad target`,
        );
      branchOwners.set(target, [
        ...(branchOwners.get(target) ?? []),
        instruction.offset,
      ]);
    }

    if (instruction.offset + instruction.width === routine.end) {
      const terminal = new Set(["jmp", "ret", "retv", "fail", "trap"]);
      if (!terminal.has(instruction.opcode.mnemonic)) {
        invalid(`routine ${routine.id} can fall through its exclusive end`);
      }
    }

    if (instruction.opcode.mnemonic === "call") {
      const callee = routines[instruction.operands[0]];
      const next = instructionAt.get(instruction.offset + instruction.width);
      if (callee.failable) {
        if (next?.opcode.mnemonic !== "jfail")
          invalid(
            `failable call at ${instruction.offset} lacks immediate jfail`,
          );
        expectedJfail.add(next.offset);
        const target = next.operands[0];
        expectedGete.set(target, next.offset);
        if (callee.hasResult) expectedGetr.add(next.offset + next.width);
      } else if (callee.hasResult) {
        expectedGetr.add(instruction.offset + instruction.width);
      }
    }
    if (instruction.opcode.mnemonic === "svc") {
      const signature = SERVICE_SIGNATURES[instruction.operands[0]];
      const next = instructionAt.get(instruction.offset + instruction.width);
      if (next?.opcode.mnemonic !== "jfail")
        invalid(`service at ${instruction.offset} lacks immediate jfail`);
      expectedJfail.add(next.offset);
      expectedGete.set(next.operands[0], next.offset);
      if (signature.result) expectedGetr.add(next.offset + next.width);
    }
  }

  for (const instruction of routine.instructions) {
    const name = instruction.opcode.mnemonic;
    if (name === "getr" && !expectedGetr.has(instruction.offset))
      invalid(`getr at ${instruction.offset} has no owning call`);
    if (name === "gete" && !expectedGete.has(instruction.offset))
      invalid(`gete at ${instruction.offset} has no owning failure edge`);
    if (name === "jfail" && !expectedJfail.has(instruction.offset))
      invalid(`jfail at ${instruction.offset} has no owning call`);
  }
  for (const offset of expectedGetr) {
    if (instructionAt.get(offset)?.opcode.mnemonic !== "getr")
      invalid(`result at ${offset} is not consumed by getr`);
    if ((branchOwners.get(offset) ?? []).length !== 0)
      invalid(`getr at ${offset} has an incoming branch`);
  }
  for (const offset of expectedJfail) {
    if ((branchOwners.get(offset) ?? []).length !== 0) {
      invalid(`jfail at ${offset} has an incoming branch`);
    }
  }
  for (const [offset, owner] of expectedGete) {
    if (instructionAt.get(offset)?.opcode.mnemonic !== "gete")
      invalid(`failure target ${offset} does not begin with gete`);
    const owners = branchOwners.get(offset) ?? [];
    if (owners.length !== 1 || owners[0] !== owner)
      invalid(`gete at ${offset} is shared or has another incoming branch`);
  }

  validateArgumentFlow(routine, routines, instructionAt);
}

function validateOperands(
  instruction: DecodedInstruction,
  routine: ValidatedRoutine,
  routines: readonly ValidatedRoutine[],
  dataSize: number,
): void {
  for (let index = 0; index < instruction.opcode.operands.length; index += 1) {
    const kind = instruction.opcode.operands[index];
    const value = instruction.operands[index];
    if (kind === "slot" && value >= routine.clobberCount)
      invalid(
        `${instruction.opcode.mnemonic} at ${instruction.offset} names absent slot ${value}`,
      );
    if (kind === "argument" && value >= VM_ARGUMENT_COUNT)
      invalid(`arg at ${instruction.offset} names absent argument ${value}`);
  }
  const name = instruction.opcode.mnemonic;
  const values = instruction.operands;
  if (name === "call" && !routines[values[0]])
    invalid(`call at ${instruction.offset} names an absent routine`);
  if (name === "svc" && !SERVICE_SIGNATURES[values[0]])
    invalid(`svc at ${instruction.offset} names an absent service`);
  if (name === "addri" && values[0] >= dataSize)
    invalid(`addri at ${instruction.offset} lies outside data`);
  if (name === "addo" && values[2] < 1)
    invalid(`addo at ${instruction.offset} has zero extent`);
  if (name === "index" && (values[2] < 1 || values[3] < 1))
    invalid(`index at ${instruction.offset} has zero length or stride`);
  if (
    (name === "strlen" && values[1] < 1) ||
    (name === "stridx" && values[2] < 1)
  ) {
    invalid(`${name} at ${instruction.offset} has zero capacity`);
  }
  if (name === "trap" && (values[0] < 1 || values[0] > 4))
    invalid(`trap at ${instruction.offset} names a machine trap`);
  if (name === "ret" && routine.hasResult)
    invalid(`result-bearing routine ${routine.id} uses ret`);
  if (name === "retv" && !routine.hasResult)
    invalid(`result-free routine ${routine.id} uses retv`);
  if (name === "fail" && !routine.failable)
    invalid(`infallible routine ${routine.id} uses fail`);
}

function validateArgumentFlow(
  routine: ValidatedRoutine,
  routines: readonly ValidatedRoutine[],
  instructionAt: ReadonlyMap<number, DecodedInstruction>,
): void {
  const masks = new Map<number, number>([[routine.entry, 0]]);
  const work = [routine.entry];
  while (work.length > 0) {
    const offset = work.pop()!;
    const instruction = instructionAt.get(offset);
    if (!instruction) invalid(`argument analysis lost instruction ${offset}`);
    let mask = masks.get(offset)!;
    const name = instruction.opcode.mnemonic;
    if (name === "arg") mask |= 1 << instruction.operands[1];
    if (name === "call") {
      const parameters = routines[instruction.operands[0]].parameterCount;
      requireMask(mask, parameters, instruction);
      mask = 0;
    }
    if (name === "svc") {
      const parameters = SERVICE_SIGNATURES[instruction.operands[0]].parameters;
      requireMask(mask, parameters, instruction);
      mask = 0;
    }
    if (
      (name === "ret" ||
        name === "retv" ||
        name === "fail" ||
        name === "trap") &&
      mask !== 0
    ) {
      invalid(`${name} at ${instruction.offset} leaves staged arguments`);
    }
    for (const successor of successors(instruction, routine)) {
      const existing = masks.get(successor);
      if (existing === undefined) {
        masks.set(successor, mask);
        work.push(successor);
      } else if (existing !== mask) {
        invalid(`argument masks disagree at merge ${successor}`);
      }
    }
  }
  if (masks.size !== routine.instructions.length) {
    invalid(`routine ${routine.id} contains unreachable instructions`);
  }
}

function requireMask(
  mask: number,
  parameters: number,
  instruction: DecodedInstruction,
): void {
  const expected = parameters === 16 ? 0xffff : (1 << parameters) - 1;
  if (mask !== expected)
    invalid(
      `${instruction.opcode.mnemonic} at ${instruction.offset} has argument mask 0x${mask.toString(16)}, expected 0x${expected.toString(16)}`,
    );
}

function successors(
  instruction: DecodedInstruction,
  routine: ValidatedRoutine,
): readonly number[] {
  const name = instruction.opcode.mnemonic;
  const next = instruction.offset + instruction.width;
  if (name === "jmp") return [instruction.operands[0]];
  if (name === "jz" || name === "jnz")
    return next < routine.end
      ? [next, instruction.operands[1]]
      : [instruction.operands[1]];
  if (name === "jfail")
    return next < routine.end
      ? [next, instruction.operands[0]]
      : [instruction.operands[0]];
  if (name === "ret" || name === "retv" || name === "fail" || name === "trap")
    return [];
  return next < routine.end ? [next] : [];
}

function read16(bytes: Uint8Array, offset: number): number {
  if (offset < 0 || offset + 1 >= bytes.length)
    invalid(`word at ${offset} lies outside its section`);
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function write16(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
}

function hex(value: number): string {
  return value.toString(16).padStart(2, "0");
}

function invalid(message: string): never {
  throw new InvalidImageError(message);
}

export interface ImageRoutineInput {
  readonly code: readonly number[];
  readonly parameterCount?: number;
  readonly clobberCount: number;
  readonly hasResult?: boolean;
  readonly failable?: boolean;
}

export interface InitializerInput {
  readonly address: number;
  readonly bytes: readonly number[];
}

export function buildImage(options: {
  readonly routines: readonly ImageRoutineInput[];
  readonly entryRoutine?: number;
  readonly dataSize?: number;
  readonly initializers?: readonly InitializerInput[];
  readonly requiredActivationBytes?: number;
  readonly requiredActivationDepth?: number;
}): Uint8Array {
  if (options.routines.length < 1 || options.routines.length > VM_MAX_ROUTINES)
    throw new Error("buildImage requires 1..255 routines");
  const initializers = options.initializers ?? [];
  const initializerSize =
    2 + initializers.reduce((size, item) => size + 4 + item.bytes.length, 0);
  const codeSize = options.routines.reduce(
    (size, routine) => size + routine.code.length,
    0,
  );
  const tableOffset = VM_HEADER_SIZE;
  const initializerOffset =
    tableOffset + options.routines.length * VM_ROUTINE_DESCRIPTOR_SIZE;
  const codeOffset = initializerOffset + initializerSize;
  const imageSize = codeOffset + codeSize;
  if (imageSize > 0xffff) throw new Error("image exceeds 65,535 bytes");
  const bytes = new Uint8Array(imageSize);
  bytes.set(VM_MAGIC, 0);
  bytes[4] = VM_FORMAT_MAJOR;
  bytes[5] = VM_FORMAT_MINOR;
  bytes[6] = SERVICE_FORMAT_MAJOR;
  bytes[7] = SERVICE_FORMAT_MINOR;
  bytes[8] = VM_HEADER_SIZE;
  write16(bytes, 10, imageSize);
  bytes[12] = options.routines.length;
  bytes[13] = options.entryRoutine ?? 0;
  bytes[14] = VM_ARGUMENT_COUNT;
  bytes[15] = VM_SLOT_COUNT;
  write16(bytes, 16, tableOffset);
  write16(bytes, 18, initializerOffset);
  write16(bytes, 20, initializerSize);
  write16(bytes, 22, codeOffset);
  write16(bytes, 24, codeSize);
  write16(bytes, 26, options.dataSize ?? 0);
  write16(bytes, 28, options.requiredActivationBytes ?? 4);
  bytes[30] = options.requiredActivationDepth ?? 1;

  let codeEntry = 0;
  let codeCursor = codeOffset;
  for (let id = 0; id < options.routines.length; id += 1) {
    const routine = options.routines[id];
    const at = tableOffset + id * VM_ROUTINE_DESCRIPTOR_SIZE;
    write16(bytes, at, codeEntry);
    write16(bytes, at + 2, codeEntry + routine.code.length);
    bytes[at + 4] = routine.parameterCount ?? 0;
    bytes[at + 5] = routine.clobberCount;
    bytes[at + 6] =
      (routine.hasResult ? RoutineFlag.result : 0) |
      (routine.failable ? RoutineFlag.failable : 0);
    bytes.set(routine.code, codeCursor);
    codeEntry += routine.code.length;
    codeCursor += routine.code.length;
  }

  write16(bytes, initializerOffset, initializers.length);
  let cursor = initializerOffset + 2;
  for (const initializer of initializers) {
    write16(bytes, cursor, initializer.address);
    write16(bytes, cursor + 2, initializer.bytes.length);
    bytes.set(initializer.bytes, cursor + 4);
    cursor += 4 + initializer.bytes.length;
  }
  return bytes;
}

export function encodeInstruction(
  mnemonic: string,
  ...operands: readonly number[]
): number[] {
  const opcode = opcodeByName.get(mnemonic.toLowerCase());
  if (!opcode) throw new Error(`unknown mnemonic ${mnemonic}`);
  if (operands.length !== opcode.operands.length)
    throw new Error(`${mnemonic} requires ${opcode.operands.length} operands`);
  const bytes = [opcode.code];
  for (let index = 0; index < operands.length; index += 1) {
    const kind: OperandKind = opcode.operands[index];
    const value = operands[index];
    if (operandWidth(kind) === 2)
      bytes.push(value & 0xff, (value >>> 8) & 0xff);
    else bytes.push(value & 0xff);
  }
  return bytes;
}
