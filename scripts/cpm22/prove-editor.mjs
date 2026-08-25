import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { compile, defaultFormatWriters } from "@jhlagado/azm/compile";
import { readCpm22File } from "@jhlagado/debug80-runtime/platforms/cpm22/filesystem";
import {
  CPM22_TERMINAL_ATTR_REVERSE,
  createCpm22Terminal,
} from "@jhlagado/debug80-runtime/platforms/cpm22/terminal";
import { createZ80Runtime } from "@jhlagado/debug80-runtime/z80/runtime";

const source = "apps/debug80-vscode/roms/cpm22/editor.asm";
const interfaceSource = "apps/debug80-vscode/roms/cpm22/editor-bdos.asmi";
const RETURN_ADDRESS = 0x0040;
const ROUTINE_CALLER_SP = 0xe300;
const ENTRY_CALLER_SP = 0xe900;
const WORKSPACE_CANARY = 0xa5;
const TEXT_CANARY = 0xc7;
const HIGH_CANARY = 0x5a;

const assembly = await compile(
  source,
  {
    emitBin: true,
    emitD8m: true,
    emitHex: false,
    emitLst: false,
    emitAsm80: false,
    registerContracts: "strict",
    registerContractsInterfaces: [interfaceSource],
  },
  { formats: defaultFormatWriters },
);
const errors = assembly.diagnostics.filter(
  (diagnostic) => diagnostic.severity === "error",
);
assert.deepEqual(
  errors,
  [],
  errors
    .map(
      (diagnostic) =>
        `${diagnostic.sourceName}:${diagnostic.line}:${diagnostic.column}: ${diagnostic.message}`,
    )
    .join("\n"),
);
const binary = assembly.artifacts.find((artifact) => artifact.kind === "bin");
const debugMap = assembly.artifacts.find((artifact) => artifact.kind === "d8m");
assert.equal(binary?.kind, "bin", "editor proof requires an assembled binary");
assert.equal(debugMap?.kind, "d8m", "editor proof requires an AZM debug map");
const symbols = Object.fromEntries(
  debugMap.json.symbols.flatMap((symbol) => {
    const value = symbol.address ?? symbol.value;
    return value === undefined ? [] : [[symbol.name, value]];
  }),
);

function symbol(name) {
  const value = symbols[name];
  assert.equal(typeof value, "number", `missing editor symbol ${name}`);
  return value;
}

const memoryLayout = {
  codeStart: symbol("EditorTransientStart"),
  codeEnd: symbol("EditorCodeEnd"),
  immutableStart: symbol("EditorImmutableStart"),
  immutableEnd: symbol("EditorImmutableEnd"),
  residentEnd: symbol("EditorResidentEnd"),
  workspaceStart: symbol("EditorWorkspaceBase"),
  workspaceUsedEnd: symbol("EditorWorkspaceEnd"),
  workspaceEnd: symbol("EditorWorkspaceLimit"),
  textStart: symbol("EditorTextBase"),
  textEnd: symbol("EditorTextLimit"),
  stackFloor: symbol("EditorStackFloor"),
  stackTop: symbol("EditorStackTop"),
};
assert.equal(
  binary.bytes.length,
  memoryLayout.residentEnd - memoryLayout.codeStart,
);
assert.ok(memoryLayout.residentEnd <= memoryLayout.workspaceStart);

function readWord(memory, address) {
  return memory[address] | (memory[address + 1] << 8);
}

function writeWord(memory, address, value) {
  memory[address] = value & 0xff;
  memory[address + 1] = value >>> 8;
}

function canonicalName(memory, fcbAddress) {
  const name = Buffer.from(memory.slice(fcbAddress + 1, fcbAddress + 9))
    .toString("ascii")
    .trimEnd();
  const extension = Buffer.from(memory.slice(fcbAddress + 9, fcbAddress + 12))
    .toString("ascii")
    .trimEnd();
  return extension.length === 0 ? name : `${name}.${extension}`;
}

function writeFcb(memory, address, nameSource) {
  const [name, extension = ""] = nameSource.toUpperCase().split(".");
  memory.fill(0, address, address + 36);
  memory.fill(0x20, address + 1, address + 12);
  memory.set(Buffer.from(name.padEnd(8).slice(0, 8), "ascii"), address + 1);
  memory.set(
    Buffer.from(extension.padEnd(3).slice(0, 3), "ascii"),
    address + 9,
  );
}

function physicalFile(logicalBytes) {
  if (logicalBytes.length === 0) return new Uint8Array();
  const physical = new Uint8Array(
    Math.ceil(logicalBytes.length / 128) * 128,
  ).fill(0x1a);
  physical.set(logicalBytes);
  return physical;
}

function logicalFileBytes(physicalBytes) {
  const eof = physicalBytes.indexOf(0x1a);
  return physicalBytes.slice(0, eof === -1 ? physicalBytes.length : eof);
}

class FakeBdos {
  constructor(memory, files = {}, failures = []) {
    this.memory = memory;
    this.files = new Map(
      Object.entries(files).map(([name, bytes]) => [
        name,
        Uint8Array.from(bytes),
      ]),
    );
    this.failures = new Map();
    for (const failure of failures) {
      this.failures.set(failure, (this.failures.get(failure) ?? 0) + 1);
    }
    this.cursors = new Map();
    this.dma = symbol("EditorDma");
    this.events = [];
    this.input = [];
    this.terminal = createCpm22Terminal();
  }

  consumeFailure(event) {
    const remaining = this.failures.get(event) ?? 0;
    if (remaining === 0) return false;
    if (remaining === 1) this.failures.delete(event);
    else this.failures.set(event, remaining - 1);
    return true;
  }

  fileEvent(kind, address, targetAddress) {
    const name = canonicalName(this.memory, address);
    const event =
      targetAddress === undefined
        ? `${kind}:${name}`
        : `${kind}:${name}->${canonicalName(this.memory, targetAddress)}`;
    this.events.push(event);
    return { event, name };
  }

  invoke(cpu) {
    const functionNumber = cpu.c & 0xff;
    const address = ((cpu.d << 8) | cpu.e) & 0xffff;
    let result = 0;
    if (functionNumber === 6) {
      if (cpu.e === 0xff) result = this.input.shift() ?? 0;
      else this.terminal.writeOutput(cpu.e);
    } else if (functionNumber === 15) {
      const { event, name } = this.fileEvent("open", address);
      if (this.consumeFailure(event) || !this.files.has(name)) result = 0xff;
      else this.cursors.set(address, 0);
    } else if (functionNumber === 16) {
      const { event } = this.fileEvent("close", address);
      if (this.consumeFailure(event)) result = 0xff;
    } else if (functionNumber === 19) {
      const { event, name } = this.fileEvent("delete", address);
      if (this.consumeFailure(event) || !this.files.delete(name)) result = 0xff;
    } else if (functionNumber === 20) {
      const { event, name } = this.fileEvent("read", address);
      const file = this.files.get(name);
      const cursor = this.cursors.get(address) ?? 0;
      if (this.consumeFailure(event)) result = 2;
      else if (file === undefined || cursor >= file.length) result = 1;
      else {
        this.memory.fill(0x1a, this.dma, this.dma + 128);
        this.memory.set(file.slice(cursor, cursor + 128), this.dma);
        this.cursors.set(address, cursor + 128);
      }
    } else if (functionNumber === 21) {
      const { event, name } = this.fileEvent("write", address);
      const cursor = this.cursors.get(address) ?? 0;
      if (this.consumeFailure(event)) result = 1;
      else {
        const previous = this.files.get(name) ?? new Uint8Array();
        const next = new Uint8Array(Math.max(previous.length, cursor + 128));
        next.set(previous);
        next.set(this.memory.slice(this.dma, this.dma + 128), cursor);
        this.files.set(name, next);
        this.cursors.set(address, cursor + 128);
      }
    } else if (functionNumber === 22) {
      const { event, name } = this.fileEvent("make", address);
      if (this.consumeFailure(event) || this.files.has(name)) result = 0xff;
      else {
        this.files.set(name, new Uint8Array());
        this.cursors.set(address, 0);
      }
    } else if (functionNumber === 23) {
      const targetAddress = address + 16;
      const { event, name } = this.fileEvent("rename", address, targetAddress);
      const target = canonicalName(this.memory, targetAddress);
      if (
        this.consumeFailure(event) ||
        !this.files.has(name) ||
        this.files.has(target)
      ) {
        result = 0xff;
      } else {
        this.files.set(target, this.files.get(name));
        this.files.delete(name);
      }
    } else if (functionNumber === 26) {
      this.dma = address;
    } else {
      throw new Error(`unsupported fake BDOS function ${functionNumber}`);
    }

    const returnAddress = readWord(this.memory, cpu.sp);
    cpu.sp = (cpu.sp + 2) & 0xffff;
    cpu.pc = returnAddress;
    cpu.a = result & 0xff;
    cpu.flags.C = 0;
  }
}

function createMachine({ files = {}, failures = [] } = {}) {
  const initial = new Uint8Array(0x10000);
  initial.set(binary.bytes, memoryLayout.codeStart);
  const runtime = createZ80Runtime({ memory: initial, startAddress: 0 }, 0);
  const memory = runtime.hardware.memory;
  memory.fill(
    WORKSPACE_CANARY,
    memoryLayout.workspaceUsedEnd,
    memoryLayout.workspaceEnd,
  );
  memory.fill(TEXT_CANARY, memoryLayout.textStart, memoryLayout.textEnd);
  memory.fill(HIGH_CANARY, memoryLayout.stackTop, 0x10000);
  const bdos = new FakeBdos(memory, files, failures);
  return { bdos, memory, runtime };
}

function invokeRoutine(
  machine,
  routine,
  { registers = {}, callerSp = ROUTINE_CALLER_SP, beforeRun } = {},
) {
  const cpu = machine.runtime.cpu;
  Object.assign(cpu, {
    a: 0,
    b: 0,
    c: 0,
    d: 0,
    e: 0,
    h: 0,
    l: 0,
    ix: 0x1357,
    iy: 0x2468,
    ...registers,
  });
  cpu.flags.C = 0;
  cpu.sp = callerSp - 2;
  writeWord(machine.memory, cpu.sp, RETURN_ADDRESS);
  cpu.pc = symbol(routine);
  beforeRun?.();
  let instructions = 0;
  let tStates = 0;
  let minimumSp = cpu.sp;
  while (cpu.pc !== RETURN_ADDRESS) {
    assert.ok(instructions < 20_000_000, `${routine} did not return`);
    if (cpu.pc === 5) machine.bdos.invoke(cpu);
    else {
      const step = machine.runtime.step();
      instructions += 1;
      tStates += step.cycles ?? 0;
    }
    minimumSp = Math.min(minimumSp, cpu.sp);
  }
  assert.equal(cpu.sp, callerSp, `${routine} changed its caller stack depth`);
  return {
    a: cpu.a,
    carry: cpu.flags.C !== 0,
    instructions,
    tStates,
    stackBytes:
      (callerSp > memoryLayout.stackTop
        ? memoryLayout.stackTop
        : callerSp - 2) - minimumSp,
  };
}

function assertCanaries(machine, { high = true } = {}) {
  assert.ok(
    machine.memory
      .slice(memoryLayout.workspaceUsedEnd, memoryLayout.workspaceEnd)
      .every((byte) => byte === WORKSPACE_CANARY),
    "editor wrote beyond fixed workspace",
  );
  if (high) {
    assert.ok(
      machine.memory
        .slice(memoryLayout.stackTop, 0x10000)
        .every((byte) => byte === HIGH_CANARY),
      "editor wrote above its private stack partition",
    );
  }
}

function setCommandTail(memory, text) {
  const bytes = Buffer.from(text, "ascii");
  memory[0x80] = bytes.length;
  memory.set(bytes, 0x81);
}

function selectedName(memory) {
  return canonicalName(memory, symbol("EditorFcb"));
}

function installBuffer(machine, bytes, cursor = 0) {
  assert.ok(bytes.length <= symbol("EditorTextCapacity"));
  machine.memory.fill(
    TEXT_CANARY,
    memoryLayout.textStart,
    memoryLayout.textEnd,
  );
  machine.memory.set(bytes, memoryLayout.textStart);
  writeWord(machine.memory, symbol("EditorLength"), bytes.length);
  writeWord(machine.memory, symbol("EditorCursor"), cursor);
  writeWord(machine.memory, symbol("EditorTop"), 0);
  writeWord(machine.memory, symbol("EditorHorizontal"), 0);
  writeWord(machine.memory, symbol("EditorDesiredColumn"), 0);
  machine.memory[symbol("EditorFlags")] = 0;
  machine.memory[symbol("EditorStatus")] = 0;
  machine.memory[symbol("EditorSaveState")] = 0;
  machine.memory[symbol("EditorQueryLength")] = 0;
}

function setQuery(machine, payload, tailSeed = 0x40) {
  assert.ok(payload.length <= symbol("EditorQueryCapacity"));
  const lengthAddress = symbol("EditorQueryLength");
  const bufferAddress = symbol("EditorQueryBuffer");
  machine.memory[lengthAddress] = payload.length;
  machine.memory.set(payload, bufferAddress);
  for (
    let index = payload.length;
    index < symbol("EditorQueryCapacity");
    index += 1
  ) {
    machine.memory[bufferAddress + index] = (tailSeed + index) & 0xff;
  }
}

function queryBytes(machine) {
  const length = machine.memory[symbol("EditorQueryLength")];
  return machine.memory.slice(
    symbol("EditorQueryBuffer"),
    symbol("EditorQueryBuffer") + length,
  );
}

function queryBlock(machine) {
  return machine.memory.slice(
    symbol("EditorQueryLength"),
    symbol("EditorQueryBuffer") + symbol("EditorQueryCapacity"),
  );
}

function bufferBytes(machine) {
  const length = readWord(machine.memory, symbol("EditorLength"));
  return machine.memory.slice(
    memoryLayout.textStart,
    memoryLayout.textStart + length,
  );
}

function assertUnusedTextCanary(machine) {
  const length = readWord(machine.memory, symbol("EditorLength"));
  assert.ok(
    machine.memory
      .slice(memoryLayout.textStart + length, memoryLayout.textEnd)
      .every((byte) => byte === TEXT_CANARY),
    "editor wrote beyond logical text",
  );
}

function prepareDefaultFcb(machine) {
  writeFcb(machine.memory, symbol("EditorFcb"), "INPUT.NU");
}

const commandMeasurements = {};
{
  const machine = createMachine();
  setCommandTail(machine.memory, "");
  commandMeasurements.default = invokeRoutine(machine, "EditorPrepareCommand");
  assert.equal(commandMeasurements.default.carry, false);
  assert.equal(selectedName(machine.memory), "INPUT.NU");
  assert.equal(machine.memory[symbol("EditorSaveState")], 0);

  setCommandTail(machine.memory, "  lower.nu  ");
  commandMeasurements.selected = invokeRoutine(machine, "EditorPrepareCommand");
  assert.equal(commandMeasurements.selected.carry, false);
  assert.equal(selectedName(machine.memory), "LOWER.NU");
  assert.notEqual(machine.memory[symbol("EditorSaveState")], 0);

  for (const tail of [
    "A:BAD.NU",
    "*.NU",
    "BAD.$$$",
    "BAD.BAK",
    "ONE.NU TWO.NU",
  ]) {
    setCommandTail(machine.memory, tail);
    const result = invokeRoutine(machine, "EditorPrepareCommand");
    assert.equal(result.carry, true, `accepted invalid command tail ${tail}`);
    assert.equal(result.a, symbol("EditorErrorCommand"));
  }
  assertCanaries(machine);
}

const loadMeasurements = {};
function proveLoad(name, physical, expected, expectedError) {
  const files = physical === undefined ? {} : { "INPUT.NU": physical };
  const machine = createMachine({ files });
  prepareDefaultFcb(machine);
  const result = invokeRoutine(machine, "EditorLoadFile");
  if (expectedError === undefined) {
    assert.equal(result.carry, false, `${name} load failed`);
    assert.deepEqual(bufferBytes(machine), Uint8Array.from(expected));
    assertUnusedTextCanary(machine);
  } else {
    assert.equal(result.carry, true, `${name} load unexpectedly succeeded`);
    assert.equal(result.a, expectedError);
  }
  assertCanaries(machine);
  return result;
}

loadMeasurements.missing = proveLoad(
  "missing",
  undefined,
  [],
  symbol("EditorErrorNotFound"),
);
{
  const machine = createMachine();
  setCommandTail(machine.memory, "NEW.NU");
  assert.equal(invokeRoutine(machine, "EditorPrepareCommand").carry, false);
  loadMeasurements.explicitMissing = invokeRoutine(machine, "EditorLoadFile");
  assert.equal(loadMeasurements.explicitMissing.carry, false);
  assert.equal(selectedName(machine.memory), "NEW.NU");
  assert.deepEqual(bufferBytes(machine), new Uint8Array());
  for (const name of [
    "EditorLength",
    "EditorCursor",
    "EditorTop",
    "EditorHorizontal",
    "EditorDesiredColumn",
  ]) {
    assert.equal(readWord(machine.memory, symbol(name)), 0, name);
  }
  assert.equal(machine.memory[symbol("EditorQueryLength")], 0);
  assert.equal(machine.memory[symbol("EditorStatus")], 0);
  assert.equal(
    machine.memory[symbol("EditorFlags")],
    symbol("EditorFlagDirty") | symbol("EditorFlagNew"),
  );
  loadMeasurements.explicitMissingRender = invokeRoutine(
    machine,
    "EditorRender",
  );
  const snapshot = machine.bdos.terminal.snapshot();
  assert.equal(
    Buffer.from(snapshot.cells.slice(23 * 80)).toString("ascii"),
    "EDIT NEW     .NU  *    ^S Save  ^Q Quit".padEnd(80),
  );
  assert.ok(
    snapshot.attributes
      .slice(23 * 80)
      .every((attribute) => attribute === CPM22_TERMINAL_ATTR_REVERSE),
  );
  assert.equal(snapshot.cursorRow, 0);
  assert.equal(snapshot.cursorColumn, 0);
  assertCanaries(machine);
}
{
  const machine = createMachine();
  setCommandTail(machine.memory, "INPUT.NU");
  assert.equal(invokeRoutine(machine, "EditorPrepareCommand").carry, false);
  loadMeasurements.explicitDefaultMissing = invokeRoutine(
    machine,
    "EditorLoadFile",
  );
  assert.equal(loadMeasurements.explicitDefaultMissing.carry, false);
  assert.equal(
    machine.memory[symbol("EditorFlags")],
    symbol("EditorFlagDirty") | symbol("EditorFlagNew"),
  );
}
{
  const content = Buffer.from("EXISTING\r\n", "ascii");
  const machine = createMachine({
    files: { "EXIST.NU": physicalFile(content) },
  });
  setCommandTail(machine.memory, "EXIST.NU");
  assert.equal(invokeRoutine(machine, "EditorPrepareCommand").carry, false);
  loadMeasurements.explicitExisting = invokeRoutine(machine, "EditorLoadFile");
  assert.equal(loadMeasurements.explicitExisting.carry, false);
  assert.deepEqual(bufferBytes(machine), Uint8Array.from(content));
  assert.equal(machine.memory[symbol("EditorFlags")], 0);
}
loadMeasurements.empty = proveLoad("empty", new Uint8Array(), []);
loadMeasurements.representative = proveLoad(
  "representative",
  physicalFile(Buffer.from("A\tB\r\nC\n", "ascii")),
  Buffer.from("A\tB\r\nC\n", "ascii"),
);
{
  const disk = new Uint8Array(
    await readFile("apps/debug80-vscode/roms/cpm22/cpm22.img"),
  );
  for (const [label, filename] of [
    ["atomSource", "INPUT.ASM"],
    ["nucleusSource", "INPUT.NU"],
  ]) {
    const file = readCpm22File(disk, filename);
    assert.ok(file, `bundled ${filename} is missing`);
    const expected = logicalFileBytes(file.bytes);
    const machine = createMachine({ files: { [filename]: file.bytes } });
    writeFcb(machine.memory, symbol("EditorFcb"), filename);
    loadMeasurements[label] = invokeRoutine(machine, "EditorLoadFile");
    assert.equal(loadMeasurements[label].carry, false);
    assert.deepEqual(bufferBytes(machine), expected);
    assertUnusedTextCanary(machine);
    assertCanaries(machine);
  }
}
loadMeasurements.textEof = proveLoad(
  "text EOF",
  Uint8Array.from([0x41, 0x1a, 0x01, 0x42]),
  Uint8Array.of(0x41),
);
proveLoad(
  "invalid control",
  Uint8Array.from([0x41, 0x01, 0x1a]),
  [],
  symbol("EditorErrorText"),
);
proveLoad(
  "bare CR",
  Uint8Array.from([0x41, 0x0d, 0x1a]),
  [],
  symbol("EditorErrorText"),
);
const capacity = symbol("EditorTextCapacity");
loadMeasurements.full = proveLoad(
  "exact capacity",
  new Uint8Array(capacity).fill(0x41),
  new Uint8Array(capacity).fill(0x41),
);
{
  const machine = createMachine({
    files: { "INPUT.NU": new Uint8Array(capacity + 1).fill(0x41) },
  });
  prepareDefaultFcb(machine);
  const result = invokeRoutine(machine, "EditorLoadFile");
  assert.equal(result.carry, true);
  assert.equal(result.a, symbol("EditorErrorCapacity"));
  assert.equal(readWord(machine.memory, symbol("EditorLength")), capacity);
  assert.ok(
    machine.memory
      .slice(memoryLayout.textStart, memoryLayout.textEnd)
      .every((byte) => byte === 0x41),
  );
  assertCanaries(machine);
  loadMeasurements.overflow = result;
}

const editMeasurements = {};
{
  const machine = createMachine();
  installBuffer(machine, Buffer.from("ABCD", "ascii"), 0);
  editMeasurements.insertStart = invokeRoutine(
    machine,
    "EditorBufferInsertByte",
    {
      registers: { a: 0x58 },
    },
  );
  assert.deepEqual(
    bufferBytes(machine),
    Uint8Array.from(Buffer.from("XABCD", "ascii")),
  );
  assert.equal(readWord(machine.memory, symbol("EditorCursor")), 1);

  writeWord(machine.memory, symbol("EditorCursor"), 3);
  editMeasurements.insertMiddle = invokeRoutine(
    machine,
    "EditorBufferInsertByte",
    {
      registers: { a: 0x59 },
    },
  );
  assert.deepEqual(
    bufferBytes(machine),
    Uint8Array.from(Buffer.from("XABYCD", "ascii")),
  );

  writeWord(machine.memory, symbol("EditorCursor"), 6);
  editMeasurements.insertEnd = invokeRoutine(
    machine,
    "EditorBufferInsertByte",
    {
      registers: { a: 0x5a },
    },
  );
  assert.deepEqual(
    bufferBytes(machine),
    Uint8Array.from(Buffer.from("XABYCDZ", "ascii")),
  );
  assertUnusedTextCanary(machine);
  assertCanaries(machine);
}
{
  const machine = createMachine();
  installBuffer(machine, Buffer.from("A\r\nB\nC", "ascii"), 3);
  editMeasurements.backspaceCrlf = invokeRoutine(
    machine,
    "EditorBufferBackspace",
  );
  assert.deepEqual(
    bufferBytes(machine),
    Uint8Array.from(Buffer.from("AB\nC", "ascii")),
  );
  assert.equal(readWord(machine.memory, symbol("EditorCursor")), 1);

  writeWord(machine.memory, symbol("EditorCursor"), 2);
  editMeasurements.deleteLf = invokeRoutine(machine, "EditorBufferDelete");
  assert.deepEqual(
    bufferBytes(machine),
    Uint8Array.from(Buffer.from("ABC", "ascii")),
  );
  assertCanaries(machine);
}
{
  const cases = [
    ["backspaceByte", "AB", 2, "EditorBufferBackspace", "A", 1],
    ["backspaceLf", "A\nB", 2, "EditorBufferBackspace", "AB", 1],
    ["deleteByte", "AB", 0, "EditorBufferDelete", "B", 0],
    ["deleteCrlf", "A\r\nB", 1, "EditorBufferDelete", "AB", 1],
  ];
  for (const [
    label,
    input,
    cursor,
    routine,
    expected,
    expectedCursor,
  ] of cases) {
    const machine = createMachine();
    installBuffer(machine, Buffer.from(input, "ascii"), cursor);
    editMeasurements[label] = invokeRoutine(machine, routine);
    assert.deepEqual(
      bufferBytes(machine),
      Uint8Array.from(Buffer.from(expected, "ascii")),
    );
    assert.equal(
      readWord(machine.memory, symbol("EditorCursor")),
      expectedCursor,
    );
    assertCanaries(machine);
  }
}
{
  const machine = createMachine();
  installBuffer(machine, Buffer.from("AB", "ascii"), 1);
  editMeasurements.newline = invokeRoutine(
    machine,
    "EditorBufferInsertNewline",
  );
  assert.deepEqual(
    bufferBytes(machine),
    Uint8Array.from(Buffer.from("A\r\nB", "ascii")),
  );
  assert.equal(readWord(machine.memory, symbol("EditorCursor")), 3);
  assertUnusedTextCanary(machine);
  assertCanaries(machine);
}
{
  const machine = createMachine();
  installBuffer(machine, new Uint8Array(capacity).fill(0x41), 100);
  const before = bufferBytes(machine);
  writeWord(machine.memory, symbol("EditorTop"), 42);
  writeWord(machine.memory, symbol("EditorHorizontal"), 9);
  const result = invokeRoutine(machine, "EditorBufferInsertByte", {
    registers: { a: 0x42 },
  });
  assert.equal(result.carry, true);
  assert.equal(
    machine.memory[symbol("EditorStatus")],
    symbol("EditorStatusFull"),
  );
  assert.equal(readWord(machine.memory, symbol("EditorLength")), capacity);
  assert.equal(readWord(machine.memory, symbol("EditorCursor")), 100);
  assert.equal(readWord(machine.memory, symbol("EditorTop")), 42);
  assert.equal(readWord(machine.memory, symbol("EditorHorizontal")), 9);
  assert.deepEqual(bufferBytes(machine), before);
  assertCanaries(machine);
  editMeasurements.full = result;
}
{
  const machine = createMachine();
  installBuffer(machine, new Uint8Array(capacity - 1).fill(0x41), 7);
  const before = bufferBytes(machine);
  const result = invokeRoutine(machine, "EditorBufferInsertNewline");
  assert.equal(result.carry, true);
  assert.equal(readWord(machine.memory, symbol("EditorLength")), capacity - 1);
  assert.equal(readWord(machine.memory, symbol("EditorCursor")), 7);
  assert.deepEqual(bufferBytes(machine), before);
  assertCanaries(machine);
  editMeasurements.atomicNewline = result;
}

const navigationMeasurements = {};
{
  const machine = createMachine();
  installBuffer(machine, Buffer.from("A\r\nB", "ascii"), 1);
  navigationMeasurements.rightCrlf = invokeRoutine(machine, "EditorMoveRight");
  assert.equal(readWord(machine.memory, symbol("EditorCursor")), 3);
  navigationMeasurements.leftCrlf = invokeRoutine(machine, "EditorMoveLeft");
  assert.equal(readWord(machine.memory, symbol("EditorCursor")), 1);
  assertCanaries(machine);
}

const searchMeasurements = {};
{
  const machine = createMachine();
  installBuffer(machine, Buffer.from("A\tB\r\n", "ascii"), 0);
  setQuery(machine, Buffer.from("A\tB", "ascii"));
  searchMeasurements.prompt = invokeRoutine(machine, "EditorRenderQuery");
  const snapshot = machine.bdos.terminal.snapshot();
  assert.equal(
    Buffer.from(snapshot.cells.slice(23 * 80)).toString("ascii"),
    "Find: A>B".padEnd(80),
  );
  assert.ok(
    snapshot.attributes
      .slice(23 * 80)
      .every((attribute) => attribute === CPM22_TERMINAL_ATTR_REVERSE),
  );
  assert.equal(snapshot.cursorRow, 23);
  assert.equal(snapshot.cursorColumn, 9);
  assertCanaries(machine);
}
{
  const machine = createMachine();
  installBuffer(machine, new Uint8Array(), 0);
  setQuery(machine, new Uint8Array());
  searchMeasurements.emptyPrompt = invokeRoutine(machine, "EditorRenderQuery");
  let snapshot = machine.bdos.terminal.snapshot();
  assert.equal(
    Buffer.from(snapshot.cells.slice(23 * 80)).toString("ascii"),
    "Find: ".padEnd(80),
  );
  assert.equal(snapshot.cursorRow, 23);
  assert.equal(snapshot.cursorColumn, 6);

  setQuery(machine, new Uint8Array(64).fill(0x41));
  searchMeasurements.fullPrompt = invokeRoutine(machine, "EditorRenderQuery");
  snapshot = machine.bdos.terminal.snapshot();
  assert.equal(
    Buffer.from(snapshot.cells.slice(23 * 80)).toString("ascii"),
    `Find: ${"A".repeat(64)}`.padEnd(80),
  );
  assert.equal(snapshot.cursorRow, 23);
  assert.equal(snapshot.cursorColumn, 70);
  assertCanaries(machine);
}
{
  const machine = createMachine();
  installBuffer(machine, Buffer.from("XXOLX", "ascii"), 0);
  setQuery(machine, Buffer.from("OLD", "ascii"), 0x20);
  machine.bdos.input.push(8, 0x58, 13);
  searchMeasurements.replace = invokeRoutine(machine, "EditorSearchBegin");
  assert.equal(searchMeasurements.replace.carry, false);
  assert.deepEqual(
    queryBytes(machine),
    Uint8Array.from(Buffer.from("OLX", "ascii")),
  );
  assert.equal(readWord(machine.memory, symbol("EditorCursor")), 2);
  assert.equal(
    machine.memory[symbol("EditorStatus")],
    symbol("EditorStatusFound"),
  );
  assert.equal(machine.bdos.terminal.snapshot().bellCount, 0);
  assertCanaries(machine);
}
{
  const machine = createMachine();
  installBuffer(machine, Buffer.from("ABC", "ascii"), 2);
  setQuery(machine, Buffer.from("OLD", "ascii"), 0x20);
  const beforeQuery = queryBlock(machine);
  const beforeText = bufferBytes(machine);
  writeWord(machine.memory, symbol("EditorTop"), 1);
  writeWord(machine.memory, symbol("EditorHorizontal"), 7);
  machine.memory[symbol("EditorFlags")] = symbol("EditorFlagDirty");
  machine.memory[symbol("EditorStatus")] = symbol("EditorStatusSaved");
  machine.bdos.input.push(8, 0x58, 27);
  searchMeasurements.cancel = invokeRoutine(machine, "EditorSearchBegin");
  assert.equal(searchMeasurements.cancel.carry, false);
  assert.deepEqual(queryBlock(machine), beforeQuery);
  assert.deepEqual(bufferBytes(machine), beforeText);
  assert.equal(readWord(machine.memory, symbol("EditorCursor")), 2);
  assert.equal(readWord(machine.memory, symbol("EditorTop")), 1);
  assert.equal(readWord(machine.memory, symbol("EditorHorizontal")), 7);
  assert.equal(
    machine.memory[symbol("EditorFlags")],
    symbol("EditorFlagDirty"),
  );
  assert.equal(
    machine.memory[symbol("EditorStatus")],
    symbol("EditorStatusReady"),
  );
  assert.deepEqual(machine.bdos.events, []);
  assertCanaries(machine);
}
{
  const machine = createMachine();
  installBuffer(machine, Buffer.from("A", "ascii"), 0);
  setQuery(machine, Buffer.from("A", "ascii"), 0x30);
  const beforeQuery = queryBlock(machine);
  machine.bdos.input.push(8, 13);
  searchMeasurements.emptyReturn = invokeRoutine(machine, "EditorSearchBegin");
  assert.equal(searchMeasurements.emptyReturn.carry, false);
  assert.deepEqual(queryBlock(machine), beforeQuery);
  assert.equal(readWord(machine.memory, symbol("EditorCursor")), 0);
  assert.equal(machine.bdos.terminal.snapshot().bellCount, 0);
  assertCanaries(machine);
}
{
  const machine = createMachine();
  installBuffer(machine, new Uint8Array(64).fill(0x41), 0);
  setQuery(machine, new Uint8Array());
  machine.bdos.input.push(...new Uint8Array(65).fill(0x41), 13);
  searchMeasurements.capacity = invokeRoutine(machine, "EditorSearchBegin");
  assert.equal(searchMeasurements.capacity.carry, false);
  assert.equal(
    machine.memory[symbol("EditorQueryLength")],
    symbol("EditorQueryCapacity"),
  );
  assert.deepEqual(queryBytes(machine), new Uint8Array(64).fill(0x41));
  assert.equal(machine.bdos.terminal.snapshot().bellCount, 1);
  assert.equal(readWord(machine.memory, symbol("EditorCursor")), 0);
  assertCanaries(machine);
}
{
  const machine = createMachine();
  installBuffer(machine, Buffer.from("A\tB", "ascii"), 0);
  setQuery(machine, new Uint8Array());
  machine.bdos.input.push(8, 127, 1, 9, 13);
  searchMeasurements.controls = invokeRoutine(machine, "EditorSearchBegin");
  assert.equal(searchMeasurements.controls.carry, false);
  assert.deepEqual(queryBytes(machine), Uint8Array.of(9));
  assert.equal(readWord(machine.memory, symbol("EditorCursor")), 1);
  assert.equal(machine.bdos.terminal.snapshot().bellCount, 3);
  assertCanaries(machine);
}
{
  const machine = createMachine();
  installBuffer(machine, Uint8Array.of(32, 126, 9), 0);
  setQuery(machine, new Uint8Array());
  machine.bdos.input.push(32, 126, 9, 13);
  searchMeasurements.byteOrder = invokeRoutine(machine, "EditorSearchBegin");
  assert.equal(searchMeasurements.byteOrder.carry, false);
  assert.deepEqual(queryBytes(machine), Uint8Array.of(32, 126, 9));
  assert.equal(readWord(machine.memory, symbol("EditorCursor")), 0);
  assert.equal(machine.bdos.terminal.snapshot().bellCount, 0);
  assert.equal(
    Buffer.from(machine.bdos.terminal.snapshot().cells.slice(23 * 80)).toString(
      "ascii",
    ),
    "Find:  ~>".padEnd(80),
  );
  assertCanaries(machine);
}

function searchResult(
  label,
  text,
  query,
  cursor,
  routine,
  { bell = 0, carry = false, expectedCursor, expectedStatus },
) {
  const machine = createMachine();
  installBuffer(machine, text, cursor);
  setQuery(machine, query);
  machine.memory[symbol("EditorFlags")] =
    symbol("EditorFlagDirty") | symbol("EditorFlagDesiredValid");
  if (carry) {
    writeWord(machine.memory, symbol("EditorTop"), 1);
    writeWord(machine.memory, symbol("EditorHorizontal"), 7);
  }
  const before = bufferBytes(machine);
  const beforeTop = readWord(machine.memory, symbol("EditorTop"));
  const beforeHorizontal = readWord(machine.memory, symbol("EditorHorizontal"));
  const result = invokeRoutine(machine, routine);
  assert.equal(result.carry, carry, `${label}: wrong carry`);
  assert.equal(
    readWord(machine.memory, symbol("EditorCursor")),
    expectedCursor,
    `${label}: wrong cursor`,
  );
  assert.equal(
    machine.memory[symbol("EditorStatus")],
    symbol(expectedStatus),
    `${label}: wrong status`,
  );
  assert.equal(machine.bdos.terminal.snapshot().bellCount, bell);
  assert.deepEqual(bufferBytes(machine), before);
  assert.equal(readWord(machine.memory, symbol("EditorTop")), beforeTop);
  assert.equal(
    readWord(machine.memory, symbol("EditorHorizontal")),
    beforeHorizontal,
  );
  assert.notEqual(
    machine.memory[symbol("EditorFlags")] & symbol("EditorFlagDirty"),
    0,
  );
  if (!carry) {
    assert.equal(
      machine.memory[symbol("EditorFlags")] & symbol("EditorFlagDesiredValid"),
      0,
    );
  } else {
    assert.notEqual(
      machine.memory[symbol("EditorFlags")] & symbol("EditorFlagDesiredValid"),
      0,
    );
  }
  assertCanaries(machine);
  return result;
}

{
  const machine = createMachine();
  const text = Buffer.from("ABABA\r\nX\tY\nABA", "ascii");
  installBuffer(machine, text, 0);
  setQuery(machine, Buffer.from("ABA", "ascii"));
  searchMeasurements.first = invokeRoutine(machine, "EditorSearchInitial");
  assert.equal(readWord(machine.memory, symbol("EditorCursor")), 0);
  searchMeasurements.overlap = invokeRoutine(machine, "EditorSearchRepeat");
  assert.equal(readWord(machine.memory, symbol("EditorCursor")), 2);
  searchMeasurements.later = invokeRoutine(machine, "EditorSearchRepeat");
  assert.equal(readWord(machine.memory, symbol("EditorCursor")), 11);
  searchMeasurements.wrap = invokeRoutine(machine, "EditorSearchRepeat");
  assert.equal(readWord(machine.memory, symbol("EditorCursor")), 0);
  assert.equal(
    machine.memory[symbol("EditorStatus")],
    symbol("EditorStatusWrapped"),
  );
  assertCanaries(machine);
}

for (const [label, text, query, cursor, routine, expected] of [
  [
    "current",
    "XXABC",
    "ABC",
    2,
    "EditorSearchInitial",
    [2, "EditorStatusFound"],
  ],
  [
    "afterLf",
    "A\nTARGET",
    "TARGET",
    0,
    "EditorSearchInitial",
    [2, "EditorStatusFound"],
  ],
  [
    "afterCrlf",
    "A\r\nTARGET",
    "TARGET",
    0,
    "EditorSearchInitial",
    [3, "EditorStatusFound"],
  ],
  ["tab", "A\tB", "\t", 0, "EditorSearchInitial", [1, "EditorStatusFound"]],
  ["final", "XYZZ", "ZZ", 0, "EditorSearchInitial", [2, "EditorStatusFound"]],
  [
    "selfAfterRing",
    "ABA",
    "ABA",
    0,
    "EditorSearchRepeat",
    [0, "EditorStatusWrapped"],
  ],
]) {
  searchMeasurements[label] = searchResult(
    label,
    Buffer.from(text, "ascii"),
    Buffer.from(query, "ascii"),
    cursor,
    routine,
    { expectedCursor: expected[0], expectedStatus: expected[1] },
  );
}

for (const [label, text, query, cursor, routine, expectedStatus] of [
  [
    "missing",
    "ABCDEFGHI",
    "XYZ",
    4,
    "EditorSearchInitial",
    "EditorStatusNotFound",
  ],
  [
    "longSuffix",
    "ABC",
    "ABCDE",
    2,
    "EditorSearchInitial",
    "EditorStatusNotFound",
  ],
  ["noWrapJoin", "AB", "BA", 1, "EditorSearchInitial", "EditorStatusNotFound"],
  ["crossLf", "A\nB", "AB", 0, "EditorSearchInitial", "EditorStatusNotFound"],
  [
    "crossCrlf",
    "A\r\nB",
    "AB",
    0,
    "EditorSearchInitial",
    "EditorStatusNotFound",
  ],
  ["emptyText", "", "A", 0, "EditorSearchInitial", "EditorStatusNotFound"],
  ["noQuery", "ABC", "", 1, "EditorSearchRepeat", "EditorStatusNoSearch"],
]) {
  searchMeasurements[label] = searchResult(
    label,
    Buffer.from(text, "ascii"),
    Buffer.from(query, "ascii"),
    cursor,
    routine,
    {
      carry: true,
      expectedCursor: cursor,
      expectedStatus,
    },
  );
}

searchMeasurements.fromEof = searchResult(
  "fromEof",
  Buffer.from("ABC", "ascii"),
  Buffer.from("A", "ascii"),
  3,
  "EditorSearchInitial",
  { expectedCursor: 0, expectedStatus: "EditorStatusWrapped" },
);

{
  const full = new Uint8Array(capacity).fill(0x41);
  searchMeasurements.fullMiss = searchResult(
    "fullMiss",
    full,
    Uint8Array.of(0x42),
    capacity >>> 1,
    "EditorSearchInitial",
    {
      carry: true,
      expectedCursor: capacity >>> 1,
      expectedStatus: "EditorStatusNotFound",
    },
  );
  full[capacity - 1] = 0x42;
  searchMeasurements.fullFinal = searchResult(
    "fullFinal",
    full,
    Uint8Array.of(0x42),
    0,
    "EditorSearchInitial",
    {
      expectedCursor: capacity - 1,
      expectedStatus: "EditorStatusFound",
    },
  );
}

{
  const machine = createMachine();
  prepareDefaultFcb(machine);
  installBuffer(machine, Buffer.from("ABC", "ascii"), 0);
  for (const [status, text] of [
    ["EditorStatusFound", "Found"],
    ["EditorStatusWrapped", "Wrapped"],
    ["EditorStatusNotFound", "Not found"],
    ["EditorStatusNoSearch", "No search"],
  ]) {
    machine.memory[symbol("EditorStatus")] = symbol(status);
    machine.bdos.terminal.reset();
    invokeRoutine(machine, "EditorRender");
    assert.ok(
      Buffer.from(machine.bdos.terminal.snapshot().cells.slice(23 * 80))
        .toString("ascii")
        .includes(text),
      `${status} is absent from the status row`,
    );
  }
  assertCanaries(machine);
}
{
  const machine = createMachine();
  installBuffer(machine, Buffer.from("ABC", "ascii"), 1);
  setQuery(machine, Buffer.from("B", "ascii"));
  const inserted = invokeRoutine(machine, "EditorBufferInsertByte", {
    registers: { a: 0x58 },
  });
  assert.equal(inserted.carry, false);
  assert.deepEqual(
    bufferBytes(machine),
    Uint8Array.from(Buffer.from("AXBC", "ascii")),
  );
  assert.deepEqual(queryBytes(machine), Uint8Array.of(0x42));
  searchMeasurements.afterEdit = invokeRoutine(machine, "EditorSearchRepeat");
  assert.equal(searchMeasurements.afterEdit.carry, false);
  assert.equal(readWord(machine.memory, symbol("EditorCursor")), 2);
  assert.equal(
    machine.memory[symbol("EditorStatus")],
    symbol("EditorStatusWrapped"),
  );
  assertCanaries(machine);
}
{
  const machine = createMachine();
  installBuffer(
    machine,
    Buffer.from("1234567890\r\nx\r\nabcdefghij", "ascii"),
    8,
  );
  navigationMeasurements.downShort = invokeRoutine(machine, "EditorMoveDown");
  assert.equal(readWord(machine.memory, symbol("EditorCursor")), 13);
  navigationMeasurements.downRetained = invokeRoutine(
    machine,
    "EditorMoveDown",
  );
  assert.equal(readWord(machine.memory, symbol("EditorCursor")), 23);
  navigationMeasurements.upRetained = invokeRoutine(machine, "EditorMoveUp");
  assert.equal(readWord(machine.memory, symbol("EditorCursor")), 13);
  assertCanaries(machine);
}
{
  const machine = createMachine();
  prepareDefaultFcb(machine);
  installBuffer(machine, Buffer.from("A\tB\r\n", "ascii"), 2);
  navigationMeasurements.tabRender = invokeRoutine(machine, "EditorRender");
  const snapshot = machine.bdos.terminal.snapshot();
  assert.equal(
    Buffer.from(snapshot.cells.slice(0, 80)).toString("ascii"),
    "A       B".padEnd(80),
  );
  assert.equal(snapshot.cursorRow, 0);
  assert.equal(snapshot.cursorColumn, 8);
  const statusAttributes = snapshot.attributes.slice(23 * 80);
  assert.ok(
    statusAttributes.every(
      (attribute) => attribute === CPM22_TERMINAL_ATTR_REVERSE,
    ),
    `unexpected status attributes ${JSON.stringify([...new Set(statusAttributes)])}`,
  );
  assertCanaries(machine);
}
{
  const machine = createMachine();
  prepareDefaultFcb(machine);
  installBuffer(machine, new Uint8Array(90).fill(0x41), 85);
  navigationMeasurements.horizontalScroll = invokeRoutine(
    machine,
    "EditorRender",
  );
  assert.equal(readWord(machine.memory, symbol("EditorHorizontal")), 6);
  assert.equal(machine.bdos.terminal.snapshot().cursorColumn, 79);
  assertCanaries(machine);
}
{
  const machine = createMachine();
  prepareDefaultFcb(machine);
  const lines = Buffer.from(
    `${Array.from({ length: 25 }, (_, index) => `L${index}`).join("\r\n")}\r\n`,
  );
  const line24 = Buffer.from(
    `${Array.from({ length: 24 }, (_, index) => `L${index}`).join("\r\n")}\r\n`,
  ).length;
  installBuffer(machine, lines, line24);
  navigationMeasurements.verticalScroll = invokeRoutine(
    machine,
    "EditorRender",
  );
  assert.equal(machine.bdos.terminal.snapshot().cursorRow, 22);
  assert.equal(
    Buffer.from(machine.bdos.terminal.snapshot().cells.slice(0, 80)).toString(
      "ascii",
    ),
    "L2".padEnd(80),
  );
  assertCanaries(machine);
}

function prepareSaveMachine(
  content,
  { old = Buffer.from("OLD\r\n"), failures = [], files = {} } = {},
) {
  const machine = createMachine({
    files: { "INPUT.NU": physicalFile(old), ...files },
    failures,
  });
  prepareDefaultFcb(machine);
  installBuffer(machine, content, 0);
  machine.memory[symbol("EditorFlags")] = symbol("EditorFlagDirty");
  return machine;
}

function assertSuccessfulSave(machine, content) {
  assert.deepEqual(machine.bdos.files.get("INPUT.NU"), physicalFile(content));
  assert.equal(machine.bdos.files.has("INPUT.$$$"), false);
  assert.equal(machine.bdos.files.has("INPUT.BAK"), false);
  assert.equal(
    machine.memory[symbol("EditorFlags")] & symbol("EditorFlagDirty"),
    0,
  );
  assert.equal(
    machine.memory[symbol("EditorStatus")],
    symbol("EditorStatusSaved"),
  );
  assert.deepEqual(bufferBytes(machine), Uint8Array.from(content));
  assertUnusedTextCanary(machine);
  assertCanaries(machine);
}

function prepareNewSaveMachine(
  content,
  { filename = "NEW.NU", files = {}, failures = [] } = {},
) {
  const machine = createMachine({ files, failures });
  setCommandTail(machine.memory, filename);
  assert.equal(invokeRoutine(machine, "EditorPrepareCommand").carry, false);
  const load = invokeRoutine(machine, "EditorLoadFile");
  assert.equal(load.carry, false, `${filename} did not open as a new buffer`);
  installBuffer(machine, content, 0);
  machine.memory[symbol("EditorFlags")] =
    symbol("EditorFlagDirty") | symbol("EditorFlagNew");
  return machine;
}

function assertSuccessfulNewSave(machine, filename, content) {
  const stem = filename.slice(0, filename.lastIndexOf("."));
  assert.deepEqual(machine.bdos.files.get(filename), physicalFile(content));
  assert.equal(machine.bdos.files.has(`${stem}.$$$`), false);
  assert.equal(machine.bdos.files.has(`${stem}.BAK`), false);
  assert.equal(
    machine.memory[symbol("EditorFlags")] &
      (symbol("EditorFlagDirty") |
        symbol("EditorFlagConfirmQuit") |
        symbol("EditorFlagNew")),
    0,
  );
  assert.equal(
    machine.memory[symbol("EditorStatus")],
    symbol("EditorStatusSaved"),
  );
  assert.deepEqual(bufferBytes(machine), Uint8Array.from(content));
  assertUnusedTextCanary(machine);
  assertCanaries(machine);
}

const saveMeasurements = {};
const newFileMeasurements = {};
{
  const content = Buffer.from("NEW\r\n", "ascii");
  const machine = prepareSaveMachine(content);
  setQuery(machine, Buffer.from("NEW", "ascii"), 0x60);
  const beforeQuery = queryBlock(machine);
  saveMeasurements.success = invokeRoutine(machine, "EditorSave");
  assert.equal(saveMeasurements.success.carry, false);
  assertSuccessfulSave(machine, content);
  assert.deepEqual(queryBlock(machine), beforeQuery);
  searchMeasurements.afterSave = invokeRoutine(machine, "EditorSearchInitial");
  assert.equal(searchMeasurements.afterSave.carry, false);
  assert.equal(readWord(machine.memory, symbol("EditorCursor")), 0);
  assert.deepEqual(queryBlock(machine), beforeQuery);
}
for (const [label, content] of [
  ["empty", new Uint8Array()],
  ["exactRecord", new Uint8Array(128).fill(0x41)],
  ["partialRecord", new Uint8Array(129).fill(0x42)],
]) {
  const machine = prepareSaveMachine(content);
  saveMeasurements[label] = invokeRoutine(machine, "EditorSave");
  assert.equal(saveMeasurements[label].carry, false);
  assertSuccessfulSave(machine, content);
}
for (const [label, filename] of [
  ["temporaryConflict", "INPUT.$$$"],
  ["backupConflict", "INPUT.BAK"],
]) {
  const reserved = Uint8Array.of(0xaa);
  const machine = prepareSaveMachine(Buffer.from("NEW", "ascii"), {
    files: { [filename]: reserved },
  });
  const before = machine.bdos.files.get("INPUT.NU");
  const result = invokeRoutine(machine, "EditorSave");
  assert.equal(result.carry, true);
  assert.equal(
    machine.memory[symbol("EditorStatus")],
    symbol("EditorStatusSaveConflict"),
  );
  assert.deepEqual(machine.bdos.files.get("INPUT.NU"), before);
  assert.deepEqual(machine.bdos.files.get(filename), reserved);
  saveMeasurements[label] = result;
}

const saveFailures = [
  ["create", "make:INPUT.$$$", "EditorStatusSaveCreate"],
  ["write", "write:INPUT.$$$", "EditorStatusSaveWrite"],
  ["close", "close:INPUT.$$$", "EditorStatusSaveClose"],
  ["renameOld", "rename:INPUT.NU->INPUT.BAK", "EditorStatusSaveRename"],
  ["renameNew", "rename:INPUT.$$$->INPUT.NU", "EditorStatusSaveRename"],
  ["deleteBackup", "delete:INPUT.BAK", "EditorStatusSaveRename"],
];
for (const [label, failure, expectedStatus] of saveFailures) {
  const old = physicalFile(Buffer.from("OLD\r\n", "ascii"));
  const machine = prepareSaveMachine(Buffer.from("NEW\r\n", "ascii"), {
    failures: [failure],
  });
  const result = invokeRoutine(machine, "EditorSave");
  assert.equal(result.carry, true, `${label} failure reported success`);
  assert.equal(machine.memory[symbol("EditorStatus")], symbol(expectedStatus));
  assert.deepEqual(machine.bdos.files.get("INPUT.NU"), old);
  assert.equal(machine.bdos.files.has("INPUT.$$$"), false);
  assert.equal(machine.bdos.files.has("INPUT.BAK"), false);
  assert.notEqual(
    machine.memory[symbol("EditorFlags")] & symbol("EditorFlagDirty"),
    0,
  );
  assert.deepEqual(
    bufferBytes(machine),
    Uint8Array.from(Buffer.from("NEW\r\n", "ascii")),
  );
  assertCanaries(machine);
  saveMeasurements[label] = result;
  if (label === "write") {
    machine.bdos.terminal.reset();
    invokeRoutine(machine, "EditorRender");
    const statusRow = Buffer.from(
      machine.bdos.terminal.snapshot().cells.slice(23 * 80),
    ).toString("ascii");
    assert.ok(statusRow.includes("Save failed 12"));
  }
}
{
  const old = physicalFile(Buffer.from("OLD\r\n", "ascii"));
  const machine = prepareSaveMachine(Buffer.from("NEW\r\n", "ascii"), {
    failures: ["rename:INPUT.$$$->INPUT.NU", "rename:INPUT.BAK->INPUT.NU"],
  });
  saveMeasurements.rollbackFailure = invokeRoutine(machine, "EditorSave");
  assert.equal(saveMeasurements.rollbackFailure.carry, true);
  assert.equal(
    machine.memory[symbol("EditorStatus")],
    symbol("EditorStatusSaveRollback"),
  );
  assert.equal(machine.bdos.files.has("INPUT.NU"), false);
  assert.deepEqual(machine.bdos.files.get("INPUT.BAK"), old);
  assert.equal(machine.bdos.files.has("INPUT.$$$"), false);
  assertCanaries(machine);
}
{
  const content = Buffer.from("RETRY\r\n", "ascii");
  const machine = prepareSaveMachine(content, {
    failures: ["write:INPUT.$$$"],
  });
  assert.equal(invokeRoutine(machine, "EditorSave").carry, true);
  saveMeasurements.retry = invokeRoutine(machine, "EditorSave");
  assert.equal(saveMeasurements.retry.carry, false);
  assertSuccessfulSave(machine, content);
}
{
  const first = Buffer.from("FIRST\r\n", "ascii");
  const second = Buffer.from("SECOND\r\n", "ascii");
  const machine = prepareSaveMachine(first);
  assert.equal(invokeRoutine(machine, "EditorSave").carry, false);
  installBuffer(machine, second, 0);
  machine.memory[symbol("EditorFlags")] = symbol("EditorFlagDirty");
  saveMeasurements.repeated = invokeRoutine(machine, "EditorSave");
  assert.equal(saveMeasurements.repeated.carry, false);
  assertSuccessfulSave(machine, second);
}

for (const [label, content] of [
  ["empty", new Uint8Array()],
  ["partialRecord", Buffer.from("NEW", "ascii")],
  ["exactRecord", new Uint8Array(128).fill(0x45)],
  ["maximum", new Uint8Array(capacity).fill(0x4d)],
]) {
  const machine = prepareNewSaveMachine(content);
  setQuery(machine, Buffer.from("Q", "ascii"), 0x60);
  const queryBefore = queryBlock(machine);
  newFileMeasurements[`save${label}`] = invokeRoutine(machine, "EditorSave");
  assert.equal(newFileMeasurements[`save${label}`].carry, false);
  assertSuccessfulNewSave(machine, "NEW.NU", content);
  assert.deepEqual(queryBlock(machine), queryBefore);
}

for (const [label, reservedName] of [
  ["temporaryConflict", "NEW.$$$"],
  ["backupConflict", "NEW.BAK"],
]) {
  const reserved = Uint8Array.of(0xaa);
  const machine = prepareNewSaveMachine(Buffer.from("NEW", "ascii"), {
    files: { [reservedName]: reserved },
  });
  newFileMeasurements[label] = invokeRoutine(machine, "EditorSave");
  assert.equal(newFileMeasurements[label].carry, true);
  assert.equal(
    machine.memory[symbol("EditorStatus")],
    symbol("EditorStatusSaveConflict"),
  );
  assert.equal(machine.bdos.files.has("NEW.NU"), false);
  assert.deepEqual(machine.bdos.files.get(reservedName), reserved);
  assert.equal(
    machine.memory[symbol("EditorFlags")],
    symbol("EditorFlagDirty") | symbol("EditorFlagNew"),
  );
  machine.bdos.files.delete(reservedName);
  newFileMeasurements[`${label}Retry`] = invokeRoutine(machine, "EditorSave");
  assert.equal(newFileMeasurements[`${label}Retry`].carry, false);
  assertSuccessfulNewSave(machine, "NEW.NU", Buffer.from("NEW", "ascii"));
}

for (const [label, failures, expectedStatus, retainedTemporary] of [
  ["create", ["make:NEW.$$$"], "EditorStatusSaveCreate", false],
  ["write", ["write:NEW.$$$"], "EditorStatusSaveWrite", false],
  ["close", ["close:NEW.$$$"], "EditorStatusSaveClose", false],
  ["install", ["rename:NEW.$$$->NEW.NU"], "EditorStatusSaveRename", false],
  [
    "rollbackClose",
    ["write:NEW.$$$", "close:NEW.$$$"],
    "EditorStatusSaveWrite",
    false,
  ],
  [
    "rollbackDelete",
    ["write:NEW.$$$", "delete:NEW.$$$"],
    "EditorStatusSaveWrite",
    true,
  ],
]) {
  const content = Buffer.from("RETRY", "ascii");
  const machine = prepareNewSaveMachine(content, { failures });
  newFileMeasurements[label] = invokeRoutine(machine, "EditorSave");
  assert.equal(newFileMeasurements[label].carry, true, `${label} succeeded`);
  assert.equal(machine.memory[symbol("EditorStatus")], symbol(expectedStatus));
  assert.equal(machine.bdos.files.has("NEW.NU"), false);
  assert.equal(machine.bdos.files.has("NEW.BAK"), false);
  assert.equal(machine.bdos.files.has("NEW.$$$"), retainedTemporary);
  assert.equal(
    machine.memory[symbol("EditorFlags")],
    symbol("EditorFlagDirty") | symbol("EditorFlagNew"),
  );
  if (retainedTemporary) machine.bdos.files.delete("NEW.$$$");
  newFileMeasurements[`${label}Retry`] = invokeRoutine(machine, "EditorSave");
  assert.equal(newFileMeasurements[`${label}Retry`].carry, false);
  assertSuccessfulNewSave(machine, "NEW.NU", content);
}

{
  const content = Buffer.from("FIRST", "ascii");
  const machine = prepareNewSaveMachine(content);
  newFileMeasurements.firstSave = invokeRoutine(machine, "EditorSave");
  assert.equal(newFileMeasurements.firstSave.carry, false);
  assertSuccessfulNewSave(machine, "NEW.NU", content);
  installBuffer(machine, Buffer.from("SECOND", "ascii"), 0);
  machine.memory[symbol("EditorFlags")] = symbol("EditorFlagDirty");
  const eventStart = machine.bdos.events.length;
  newFileMeasurements.ordinaryAfterFirst = invokeRoutine(machine, "EditorSave");
  assert.equal(newFileMeasurements.ordinaryAfterFirst.carry, false);
  assertSuccessfulNewSave(machine, "NEW.NU", Buffer.from("SECOND", "ascii"));
  assert.ok(
    machine.bdos.events.slice(eventStart).includes("rename:NEW.NU->NEW.BAK"),
  );
}

{
  const prior = physicalFile(Buffer.from("OTHER", "ascii"));
  const machine = prepareNewSaveMachine(Buffer.from("OURS", "ascii"));
  machine.bdos.files.set("NEW.NU", prior);
  newFileMeasurements.unexpectedTarget = invokeRoutine(machine, "EditorSave");
  assert.equal(newFileMeasurements.unexpectedTarget.carry, true);
  assert.equal(
    machine.memory[symbol("EditorStatus")],
    symbol("EditorStatusSaveRename"),
  );
  assert.deepEqual(machine.bdos.files.get("NEW.NU"), prior);
  assert.equal(machine.bdos.files.has("NEW.$$$"), false);
  assert.equal(machine.bdos.files.has("NEW.BAK"), false);
  assert.equal(
    machine.memory[symbol("EditorFlags")],
    symbol("EditorFlagDirty") | symbol("EditorFlagNew"),
  );
}

function runEditorInput(input, file = Buffer.from("A\r\n", "ascii")) {
  const machine = createMachine({ files: { "INPUT.NU": physicalFile(file) } });
  setCommandTail(machine.memory, "");
  machine.bdos.input.push(...input);
  let highBefore;
  const result = invokeRoutine(machine, "EditorEntry", {
    callerSp: ENTRY_CALLER_SP,
    beforeRun() {
      highBefore = machine.memory.slice(memoryLayout.stackTop, 0x10000);
    },
  });
  assert.deepEqual(
    machine.memory.slice(memoryLayout.stackTop, 0x10000),
    highBefore,
    "EditorEntry changed CP/M high memory",
  );
  assert.ok(result.stackBytes > 0 && result.stackBytes <= 32);
  assertCanaries(machine, { high: false });
  return { machine, result };
}

function runNewEditorInput(input, failures = []) {
  const machine = createMachine({ failures });
  setCommandTail(machine.memory, "NEW.NU");
  machine.bdos.input.push(...input);
  let highBefore;
  const result = invokeRoutine(machine, "EditorEntry", {
    callerSp: ENTRY_CALLER_SP,
    beforeRun() {
      highBefore = machine.memory.slice(memoryLayout.stackTop, 0x10000);
    },
  });
  assert.deepEqual(machine.memory.slice(memoryLayout.stackTop), highBefore);
  assert.ok(result.stackBytes > 0 && result.stackBytes <= 32);
  assertCanaries(machine, { high: false });
  return { machine, result };
}

const entryMeasurements = {};
{
  const { machine, result } = runNewEditorInput([0x11, 0x11]);
  entryMeasurements.newUntouchedDiscard = result;
  assert.equal(machine.bdos.files.has("NEW.NU"), false);
  assert.equal(machine.bdos.files.has("NEW.$$$"), false);
  assert.equal(machine.bdos.files.has("NEW.BAK"), false);
  assert.equal(machine.bdos.input.length, 0);
}
{
  const { machine, result } = runNewEditorInput([0x58, 0x11, 0x11]);
  entryMeasurements.newEditedDiscard = result;
  assert.deepEqual(bufferBytes(machine), Uint8Array.of(0x58));
  assert.equal(machine.bdos.files.has("NEW.NU"), false);
  assert.equal(machine.bdos.input.length, 0);
}
{
  const { machine, result } = runNewEditorInput([19, 0x11]);
  entryMeasurements.newEmptySaveQuit = result;
  assert.deepEqual(machine.bdos.files.get("NEW.NU"), new Uint8Array());
  assert.equal(machine.memory[symbol("EditorFlags")] & 9, 0);
  assert.equal(machine.bdos.input.length, 0);
}
{
  const { machine, result } = runNewEditorInput([0x58, 19, 0x11]);
  entryMeasurements.newEditedSaveQuit = result;
  assert.deepEqual(
    logicalFileBytes(machine.bdos.files.get("NEW.NU")),
    Uint8Array.of(0x58),
  );
  assert.equal(machine.memory[symbol("EditorFlags")] & 9, 0);
  assert.equal(machine.bdos.input.length, 0);
}
{
  const { machine, result } = runNewEditorInput(
    [0x58, 19, 19, 0x11],
    ["write:NEW.$$$"],
  );
  entryMeasurements.newFailureRetryQuit = result;
  assert.deepEqual(
    logicalFileBytes(machine.bdos.files.get("NEW.NU")),
    Uint8Array.of(0x58),
  );
  assert.equal(machine.memory[symbol("EditorFlags")] & 9, 0);
  assert.equal(machine.bdos.input.length, 0);
}
{
  const machine = createMachine();
  setCommandTail(machine.memory, "NEW.NU");
  machine.bdos.input.push(0x11, 0x11);
  entryMeasurements.sequenceDiscard = invokeRoutine(machine, "EditorEntry", {
    callerSp: ENTRY_CALLER_SP,
  });
  assert.equal(machine.bdos.files.has("NEW.NU"), false);

  machine.bdos.terminal.reset();
  setCommandTail(machine.memory, "");
  entryMeasurements.sequenceBareMissing = invokeRoutine(
    machine,
    "EditorEntry",
    { callerSp: ENTRY_CALLER_SP },
  );
  assert.ok(
    Buffer.from(machine.bdos.terminal.snapshot().cells)
      .toString("ascii")
      .includes("EDIT error 02"),
  );

  machine.bdos.terminal.reset();
  setCommandTail(machine.memory, "NEW.NU");
  machine.bdos.input.push(19, 0x11);
  entryMeasurements.sequenceCreate = invokeRoutine(machine, "EditorEntry", {
    callerSp: ENTRY_CALLER_SP,
  });
  assert.deepEqual(machine.bdos.files.get("NEW.NU"), new Uint8Array());

  machine.bdos.terminal.reset();
  setQuery(machine, Buffer.from("STALE", "ascii"));
  setCommandTail(machine.memory, "NEW.NU");
  machine.bdos.input.push(0x11);
  entryMeasurements.sequenceExisting = invokeRoutine(machine, "EditorEntry", {
    callerSp: ENTRY_CALLER_SP,
  });
  assert.equal(machine.memory[symbol("EditorFlags")], 0);
  assert.equal(machine.memory[symbol("EditorQueryLength")], 0);
  assert.equal(machine.bdos.input.length, 0);
  assertCanaries(machine, { high: false });
}
{
  const { machine, result } = runEditorInput([0x11]);
  entryMeasurements.cleanQuit = result;
  assert.deepEqual(
    machine.bdos.files.get("INPUT.NU"),
    physicalFile(Buffer.from("A\r\n")),
  );
}
{
  const { machine, result } = runEditorInput([
    0x58, 0x11, 0x1b, 0x5b, 0x44, 0x11, 0x11,
  ]);
  entryMeasurements.discard = result;
  assert.deepEqual(
    machine.bdos.files.get("INPUT.NU"),
    physicalFile(Buffer.from("A\r\n")),
  );
  assert.equal(machine.bdos.terminal.snapshot().bellCount, 0);
}
{
  const { machine, result } = runEditorInput([0x1b, 0x58, 0x11]);
  entryMeasurements.badEscape = result;
  assert.equal(machine.bdos.terminal.snapshot().bellCount, 1);
}
{
  const { machine, result } = runEditorInput([
    0x1b,
    ...new Array(256).fill(0),
    0x11,
  ]);
  entryMeasurements.escapeTimeout = result;
  assert.equal(machine.bdos.terminal.snapshot().bellCount, 1);
}
{
  const { machine, result } = runEditorInput(
    [0x1b, 0x5b, 0x44, 0x7f, 0x1b, 0x5b, 0x41, 0x11],
    new Uint8Array(),
  );
  entryMeasurements.boundaries = result;
  assert.equal(machine.bdos.terminal.snapshot().bellCount, 3);
}
{
  const { machine, result } = runEditorInput(
    [6, 0x41, 0x42, 0x41, 13, 14, 0x11],
    Buffer.from("ABABA\r\n", "ascii"),
  );
  entryMeasurements.searchRepeat = result;
  assert.deepEqual(
    queryBytes(machine),
    Uint8Array.from(Buffer.from("ABA", "ascii")),
  );
  assert.equal(readWord(machine.memory, symbol("EditorCursor")), 2);
  assert.equal(
    machine.memory[symbol("EditorStatus")],
    symbol("EditorStatusFound"),
  );
  assert.equal(machine.bdos.terminal.snapshot().bellCount, 0);
  assert.equal(machine.bdos.input.length, 0);
}
{
  const { machine, result } = runEditorInput(
    [6, 0x5a, 13, 0x11],
    Buffer.from("ABC\r\n", "ascii"),
  );
  entryMeasurements.searchMissing = result;
  assert.deepEqual(queryBytes(machine), Uint8Array.of(0x5a));
  assert.equal(readWord(machine.memory, symbol("EditorCursor")), 0);
  assert.equal(
    machine.memory[symbol("EditorStatus")],
    symbol("EditorStatusNotFound"),
  );
  assert.equal(machine.bdos.terminal.snapshot().bellCount, 1);
  assert.equal(machine.bdos.input.length, 0);
}
{
  const { machine, result } = runEditorInput(
    [14, 0x11],
    Buffer.from("ABC\r\n", "ascii"),
  );
  entryMeasurements.searchNoQuery = result;
  assert.equal(machine.memory[symbol("EditorQueryLength")], 0);
  assert.equal(
    machine.memory[symbol("EditorStatus")],
    symbol("EditorStatusNoSearch"),
  );
  assert.equal(machine.bdos.terminal.snapshot().bellCount, 1);
  assert.equal(machine.bdos.input.length, 0);
}
{
  const { machine, result } = runEditorInput(
    [0x58, 0x11, 6, 27, 0x11, 0x11],
    Buffer.from("A\r\n", "ascii"),
  );
  entryMeasurements.searchCancelsDiscard = result;
  assert.deepEqual(
    machine.bdos.files.get("INPUT.NU"),
    physicalFile(Buffer.from("A\r\n", "ascii")),
  );
  assert.equal(machine.bdos.terminal.snapshot().bellCount, 0);
  assert.equal(machine.bdos.input.length, 0);
}
{
  const { machine, result } = runEditorInput(
    [0x58, 6, 0x41, 13, 19, 14, 0x11],
    Buffer.from("ABA\r\n", "ascii"),
  );
  entryMeasurements.searchSaveRepeat = result;
  assert.deepEqual(
    logicalFileBytes(machine.bdos.files.get("INPUT.NU")),
    Uint8Array.from(Buffer.from("XABA\r\n", "ascii")),
  );
  assert.deepEqual(queryBytes(machine), Uint8Array.of(0x41));
  assert.equal(readWord(machine.memory, symbol("EditorCursor")), 3);
  assert.equal(
    machine.memory[symbol("EditorStatus")],
    symbol("EditorStatusFound"),
  );
  assert.equal(machine.bdos.input.length, 0);
}
{
  const machine = createMachine({
    files: { "INPUT.NU": physicalFile(Buffer.from("ABC\r\n", "ascii")) },
  });
  setCommandTail(machine.memory, "");
  machine.bdos.input.push(6, 0x42, 13, 0x11);
  entryMeasurements.firstExecutionSearch = invokeRoutine(
    machine,
    "EditorEntry",
    { callerSp: ENTRY_CALLER_SP },
  );
  assert.deepEqual(queryBytes(machine), Uint8Array.of(0x42));
  machine.bdos.terminal.reset();
  machine.bdos.input.push(14, 0x11);
  entryMeasurements.secondExecutionReset = invokeRoutine(
    machine,
    "EditorEntry",
    { callerSp: ENTRY_CALLER_SP },
  );
  assert.equal(machine.memory[symbol("EditorQueryLength")], 0);
  assert.equal(
    machine.memory[symbol("EditorStatus")],
    symbol("EditorStatusNoSearch"),
  );
  assert.equal(machine.bdos.terminal.snapshot().bellCount, 1);
  assert.equal(machine.bdos.input.length, 0);
  assertCanaries(machine, { high: false });
}
{
  const machine = createMachine();
  setCommandTail(machine.memory, "");
  let highBefore;
  const result = invokeRoutine(machine, "EditorEntry", {
    callerSp: ENTRY_CALLER_SP,
    beforeRun() {
      highBefore = machine.memory.slice(memoryLayout.stackTop, 0x10000);
    },
  });
  assert.deepEqual(machine.memory.slice(memoryLayout.stackTop), highBefore);
  assert.ok(
    Buffer.from(machine.bdos.terminal.snapshot().cells)
      .toString("ascii")
      .includes("EDIT error 02"),
  );
  entryMeasurements.missing = result;
}

const report = {
  assembled: {
    artifact: binary.bytes.length,
    code: memoryLayout.codeEnd - (memoryLayout.codeStart + 3),
    immutable: memoryLayout.immutableEnd - memoryLayout.immutableStart,
    workspace: memoryLayout.workspaceUsedEnd - memoryLayout.workspaceStart,
    textCapacity: capacity,
    partitionHeadroom: memoryLayout.workspaceStart - memoryLayout.residentEnd,
  },
  commands: commandMeasurements,
  loads: loadMeasurements,
  edits: editMeasurements,
  navigation: navigationMeasurements,
  search: searchMeasurements,
  saves: saveMeasurements,
  newFiles: newFileMeasurements,
  entry: entryMeasurements,
};
console.log(
  `CP/M editor proof passed\n${JSON.stringify(report, undefined, 2)}`,
);
