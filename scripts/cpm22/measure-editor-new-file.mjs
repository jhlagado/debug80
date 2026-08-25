import assert from "node:assert/strict";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { compile, defaultFormatWriters } from "@jhlagado/azm/compile";
import { createZ80Runtime } from "@jhlagado/debug80-runtime/z80/runtime";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const candidateDirectory = join(scriptDirectory, "editor-new-file-candidates");
const interfaceSource = resolve(
  scriptDirectory,
  "../../apps/debug80-vscode/roms/cpm22/editor-bdos.asmi",
);
const RETURN_ADDRESS = 0x0040;
const CALLER_SP = 0xe300;

function word(memory, address) {
  return memory[address] | (memory[address + 1] << 8);
}

function setWord(memory, address, value) {
  memory[address] = value & 0xff;
  memory[address + 1] = (value >>> 8) & 0xff;
}

function textBytes(text) {
  return Uint8Array.from(Buffer.from(text, "ascii"));
}

function physicalFile(logical) {
  if (logical.length === 0) return new Uint8Array();
  const result = new Uint8Array(Math.ceil(logical.length / 128) * 128).fill(
    0x1a,
  );
  result.set(logical);
  return result;
}

function logicalFile(physical) {
  const end = physical.indexOf(0x1a);
  return physical.slice(0, end < 0 ? physical.length : end);
}

async function assemble(name, source) {
  const result = await compile(
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
  const errors = result.diagnostics.filter(
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
  const binary = result.artifacts.find((artifact) => artifact.kind === "bin");
  const map = result.artifacts.find((artifact) => artifact.kind === "d8m");
  assert.equal(binary?.kind, "bin", `${name}: missing binary`);
  assert.equal(map?.kind, "d8m", `${name}: missing debug map`);
  const symbols = Object.fromEntries(
    map.json.symbols.flatMap((entry) => {
      const value = entry.address ?? entry.value;
      return value === undefined ? [] : [[entry.name, value]];
    }),
  );
  return { bytes: binary.bytes, name, symbols };
}

function symbol(candidate, name) {
  const value = candidate.symbols[name];
  assert.equal(typeof value, "number", `${candidate.name}: missing ${name}`);
  return value;
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

class FakeBdos {
  constructor(candidate, memory, files = {}) {
    this.candidate = candidate;
    this.memory = memory;
    this.files = new Map(
      Object.entries(files).map(([name, bytes]) => [
        name,
        Uint8Array.from(bytes),
      ]),
    );
    this.failures = new Map();
    this.cursors = new Map();
    this.dma = symbol(candidate, "EditorDma");
    this.events = [];
  }

  fail(event, count = 1) {
    this.failures.set(event, (this.failures.get(event) ?? 0) + count);
  }

  consumeFailure(event) {
    const count = this.failures.get(event) ?? 0;
    if (count === 0) return false;
    if (count === 1) this.failures.delete(event);
    else this.failures.set(event, count - 1);
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
    if (functionNumber === 15) {
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
      throw new Error(`unsupported candidate BDOS function ${functionNumber}`);
    }
    const returnAddress = word(this.memory, cpu.sp);
    cpu.sp = (cpu.sp + 2) & 0xffff;
    cpu.pc = returnAddress;
    cpu.a = result & 0xff;
    cpu.flags.C = 0;
  }
}

function createMachine(candidate, files = {}) {
  const initial = new Uint8Array(0x10000);
  initial.set(candidate.bytes, symbol(candidate, "EditorTransientStart"));
  const runtime = createZ80Runtime({ memory: initial, startAddress: 0 }, 0);
  const memory = runtime.hardware.memory;
  return {
    bdos: new FakeBdos(candidate, memory, files),
    candidate,
    memory,
    runtime,
  };
}

function invoke(machine, routine) {
  const { candidate, memory, runtime } = machine;
  const cpu = runtime.cpu;
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
  });
  cpu.flags.C = 0;
  cpu.sp = CALLER_SP - 2;
  setWord(memory, cpu.sp, RETURN_ADDRESS);
  cpu.pc = symbol(candidate, routine);
  let instructions = 0;
  let tStates = 0;
  let minimumSp = cpu.sp;
  while (cpu.pc !== RETURN_ADDRESS) {
    assert.ok(instructions < 20_000_000, `${candidate.name}:${routine} hung`);
    if (cpu.pc === 5) machine.bdos.invoke(cpu);
    else {
      const step = runtime.step();
      instructions += 1;
      tStates += step.cycles ?? 0;
    }
    minimumSp = Math.min(minimumSp, cpu.sp);
  }
  assert.equal(cpu.sp, CALLER_SP, `${candidate.name}:${routine} stack drift`);
  return {
    a: cpu.a,
    carry: cpu.flags.C !== 0,
    instructions,
    stackBytes: CALLER_SP - 2 - minimumSp,
    tStates,
  };
}

function setCommand(machine, text) {
  const bytes = textBytes(text);
  machine.memory[0x80] = bytes.length;
  machine.memory.set(bytes, 0x81);
}

function prepareAndLoad(candidate, tail, files = {}) {
  const machine = createMachine(candidate, files);
  setCommand(machine, tail);
  const command = invoke(machine, "EditorPrepareCommand");
  assert.equal(command.carry, false, `${candidate.name}: command rejected`);
  const load = invoke(machine, "EditorLoadFile");
  return { command, load, machine };
}

function setBuffer(machine, bytes) {
  const { candidate, memory } = machine;
  memory.set(bytes, symbol(candidate, "EditorTextBase"));
  setWord(memory, symbol(candidate, "EditorLength"), bytes.length);
  setWord(memory, symbol(candidate, "EditorCursor"), bytes.length);
  memory[symbol(candidate, "EditorFlags")] |= symbol(
    candidate,
    "EditorFlagDirty",
  );
}

function currentBuffer(machine) {
  const { candidate, memory } = machine;
  const length = word(memory, symbol(candidate, "EditorLength"));
  return memory.slice(
    symbol(candidate, "EditorTextBase"),
    symbol(candidate, "EditorTextBase") + length,
  );
}

function assertNewState(candidate, machine, expectFlag) {
  const zeroWords = [
    "EditorLength",
    "EditorCursor",
    "EditorTop",
    "EditorHorizontal",
    "EditorDesiredColumn",
  ];
  for (const name of zeroWords) {
    assert.equal(word(machine.memory, symbol(candidate, name)), 0, name);
  }
  assert.equal(machine.memory[symbol(candidate, "EditorQueryLength")], 0);
  assert.equal(machine.memory[symbol(candidate, "EditorStatus")], 0);
  assert.equal(
    machine.memory[symbol(candidate, "EditorFlags")],
    symbol(candidate, "EditorFlagDirty") | (expectFlag ? 8 : 0),
  );
}

function proveFailure(candidate, event, count = 1, expectTemporary = false) {
  const { machine, load } = prepareAndLoad(candidate, "NEW.NU");
  assert.equal(load.carry, false);
  setBuffer(machine, textBytes("FAIL"));
  machine.bdos.fail(event, count);
  const failed = invoke(machine, "EditorSave");
  assert.equal(failed.carry, true, `${candidate.name}: ${event} accepted`);
  assert.equal(machine.bdos.files.has("NEW.NU"), false);
  assert.equal(machine.bdos.files.has("NEW.BAK"), false);
  assert.equal(machine.bdos.files.has("NEW.$$$"), expectTemporary);
  assert.notEqual(
    machine.memory[symbol(candidate, "EditorFlags")] &
      symbol(candidate, "EditorFlagDirty"),
    0,
  );
  let retry;
  if (!expectTemporary) {
    retry = invoke(machine, "EditorSave");
    assert.equal(
      retry.carry,
      false,
      `${candidate.name}: ${event} retry failed`,
    );
    assert.deepEqual(
      logicalFile(machine.bdos.files.get("NEW.NU")),
      textBytes("FAIL"),
    );
  }
  return { failed, retry };
}

function proveRollbackDeleteFailure(candidate) {
  const { machine, load } = prepareAndLoad(candidate, "NEW.NU");
  assert.equal(load.carry, false);
  setBuffer(machine, textBytes("FAIL"));
  machine.bdos.fail("write:NEW.$$$");
  machine.bdos.fail("delete:NEW.$$$");
  const failed = invoke(machine, "EditorSave");
  assert.equal(failed.carry, true);
  assert.equal(machine.bdos.files.has("NEW.NU"), false);
  assert.equal(machine.bdos.files.has("NEW.BAK"), false);
  assert.equal(machine.bdos.files.has("NEW.$$$"), true);
  assert.notEqual(
    machine.memory[symbol(candidate, "EditorFlags")] &
      symbol(candidate, "EditorFlagDirty"),
    0,
  );
  return { failed };
}

function prove(candidate) {
  const metrics = [];
  const record = (value) => {
    metrics.push(value);
    return value;
  };

  const bare = prepareAndLoad(candidate, "");
  record(bare.command);
  record(bare.load);
  assert.equal(bare.load.carry, true);
  assert.equal(bare.load.a, symbol(candidate, "EditorErrorNotFound"));

  const explicit = prepareAndLoad(candidate, "NEW.NU");
  record(explicit.command);
  record(explicit.load);
  assert.equal(explicit.load.carry, false);
  assertNewState(candidate, explicit.machine, candidate.name !== "save-probe");

  const explicitDefault = prepareAndLoad(candidate, "INPUT.NU");
  assert.equal(explicitDefault.load.carry, false);

  const existingBytes = physicalFile(textBytes("OLD\r\n"));
  const existing = prepareAndLoad(candidate, "EXIST.NU", {
    "EXIST.NU": existingBytes,
  });
  assert.equal(existing.load.carry, false);
  assert.deepEqual(currentBuffer(existing.machine), textBytes("OLD\r\n"));
  assert.equal(existing.machine.memory[symbol(candidate, "EditorFlags")], 0);

  const invalid = prepareAndLoad(candidate, "BAD.NU", {
    "BAD.NU": Uint8Array.of(1),
  });
  assert.equal(invalid.load.carry, true);
  assert.equal(invalid.load.a, symbol(candidate, "EditorErrorText"));

  const empty = prepareAndLoad(candidate, "EMPTY.NU");
  const emptySave = record(invoke(empty.machine, "EditorSave"));
  assert.equal(emptySave.carry, false);
  assert.deepEqual(empty.machine.bdos.files.get("EMPTY.NU"), new Uint8Array());
  assert.equal(empty.machine.bdos.files.has("EMPTY.$$$"), false);
  assert.equal(empty.machine.bdos.files.has("EMPTY.BAK"), false);
  assert.equal(empty.machine.memory[symbol(candidate, "EditorFlags")], 0);

  const partial = prepareAndLoad(candidate, "PART.NU");
  setBuffer(partial.machine, textBytes("NEW"));
  const partialSave = record(invoke(partial.machine, "EditorSave"));
  assert.equal(partialSave.carry, false);
  assert.equal(partial.machine.bdos.files.get("PART.NU").length, 128);
  assert.deepEqual(
    logicalFile(partial.machine.bdos.files.get("PART.NU")),
    textBytes("NEW"),
  );

  const exact = prepareAndLoad(candidate, "EXACT.NU");
  const exactBytes = new Uint8Array(128).fill(0x45);
  setBuffer(exact.machine, exactBytes);
  const exactSave = record(invoke(exact.machine, "EditorSave"));
  assert.equal(exactSave.carry, false);
  assert.deepEqual(exact.machine.bdos.files.get("EXACT.NU"), exactBytes);

  setBuffer(partial.machine, textBytes("LATER"));
  const ordinarySave = record(invoke(partial.machine, "EditorSave"));
  assert.equal(ordinarySave.carry, false);
  assert.deepEqual(
    logicalFile(partial.machine.bdos.files.get("PART.NU")),
    textBytes("LATER"),
  );
  assert.ok(partial.machine.bdos.events.includes("rename:PART.NU->PART.BAK"));

  const editedExisting = existing.machine;
  setBuffer(editedExisting, textBytes("CHANGED"));
  const existingSave = record(invoke(editedExisting, "EditorSave"));
  assert.equal(existingSave.carry, false);
  assert.deepEqual(
    logicalFile(editedExisting.bdos.files.get("EXIST.NU")),
    textBytes("CHANGED"),
  );

  for (const collision of ["COLLIDE.$$$", "COLLIDE.BAK"]) {
    const collisionCase = prepareAndLoad(candidate, "COLLIDE.NU", {
      [collision]: textBytes("KEEP"),
    });
    const save = invoke(collisionCase.machine, "EditorSave");
    assert.equal(save.carry, true);
    assert.equal(collisionCase.machine.bdos.files.has("COLLIDE.NU"), false);
    assert.deepEqual(
      collisionCase.machine.bdos.files.get(collision),
      textBytes("KEEP"),
    );
  }

  const failures = {
    create: proveFailure(candidate, "make:NEW.$$$"),
    write: proveFailure(candidate, "write:NEW.$$$"),
    close: proveFailure(candidate, "close:NEW.$$$"),
    install: proveFailure(candidate, "rename:NEW.$$$->NEW.NU"),
    rollbackClose: proveFailure(candidate, "close:NEW.$$$", 2),
    rollbackDelete: proveRollbackDeleteFailure(candidate),
  };
  for (const result of Object.values(failures)) {
    record(result.failed);
    if (result.retry !== undefined) record(result.retry);
  }

  const race = prepareAndLoad(candidate, "RACE.NU");
  setBuffer(race.machine, textBytes("OURS"));
  const prior = physicalFile(textBytes("OTHER"));
  race.machine.bdos.files.set("RACE.NU", prior);
  const raceSave = record(invoke(race.machine, "EditorSave"));
  const preservesUnexpectedTarget =
    raceSave.carry &&
    Buffer.from(race.machine.bdos.files.get("RACE.NU")).equals(
      Buffer.from(prior),
    ) &&
    !race.machine.bdos.files.has("RACE.$$$") &&
    !race.machine.bdos.files.has("RACE.BAK");
  assert.equal(preservesUnexpectedTarget, candidate.name !== "save-probe");

  return {
    execution: {
      commandExplicit: explicit.command,
      loadMissingExplicit: explicit.load,
      saveEmptyFirst: emptySave,
      savePartialFirst: partialSave,
      saveExactFirst: exactSave,
      saveOrdinaryAfterFirst: ordinarySave,
      saveExisting: existingSave,
      maximumMeasuredStackBytes: Math.max(
        ...metrics.map((entry) => entry.stackBytes),
      ),
    },
    failures,
    preservesUnexpectedTarget,
    sound: preservesUnexpectedTarget,
  };
}

function accounts(candidate) {
  return {
    artifactBytes: candidate.bytes.length,
    codeBytes:
      symbol(candidate, "EditorCodeEnd") - symbol(candidate, "EditorCodeStart"),
    immutableBytes:
      symbol(candidate, "EditorImmutableEnd") -
      symbol(candidate, "EditorImmutableStart"),
    workspaceBytes:
      symbol(candidate, "EditorWorkspaceEnd") -
      symbol(candidate, "EditorWorkspaceBase"),
    textCapacityBytes: symbol(candidate, "EditorTextCapacity"),
    headroomBytes:
      symbol(candidate, "EditorCodeLimit") -
      symbol(candidate, "EditorResidentEnd"),
  };
}

const baseline = await assemble(
  "baseline",
  resolve(candidateDirectory, "baseline.asm"),
);
const candidates = {};
for (const name of ["persistent", "save-probe", "separate"]) {
  const candidate = await assemble(
    name,
    resolve(candidateDirectory, `${name}.asm`),
  );
  const candidateAccounts = accounts(candidate);
  candidates[name] = {
    accounts: candidateAccounts,
    delta: {
      artifactBytes:
        candidateAccounts.artifactBytes - accounts(baseline).artifactBytes,
      codeBytes: candidateAccounts.codeBytes - accounts(baseline).codeBytes,
      immutableBytes:
        candidateAccounts.immutableBytes - accounts(baseline).immutableBytes,
      workspaceBytes:
        candidateAccounts.workspaceBytes - accounts(baseline).workspaceBytes,
      textCapacityBytes:
        candidateAccounts.textCapacityBytes -
        accounts(baseline).textCapacityBytes,
    },
    proof: prove(candidate),
  };
}

assert.equal(accounts(baseline).artifactBytes, 2840);
assert.equal(candidates.persistent.delta.artifactBytes, 39);
assert.equal(candidates["save-probe"].delta.artifactBytes, 67);
assert.equal(candidates.separate.delta.artifactBytes, 108);
assert.equal(candidates.persistent.proof.sound, true);
assert.equal(candidates["save-probe"].proof.sound, false);
assert.equal(candidates.separate.proof.sound, true);

const report = {
  format: "debug80-cpm22-editor-new-file-candidates",
  version: 1,
  boundary:
    "complete native EDIT.COM with production buffer, navigation, search, screen, terminal, and immutable data; only command, missing-load, and first-save control vary",
  baseline: accounts(baseline),
  candidates,
  selection: "persistent",
  selectionReason:
    "the persistent flag is the smallest sound complete image; save-time probing is larger and overwrites a name that appears unexpectedly, while separate dispatch duplicates transaction control",
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
