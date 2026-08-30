import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createZ80Runtime } from "@jhlagado/debug80-runtime/z80/runtime";
import { assembleEditorCandidate } from "./editor-candidate-assembly.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "../..");
const candidateDirectory = resolve(
  scriptDirectory,
  "editor-replace-candidates",
);
const interfaceSource = resolve(
  scriptDirectory,
  "../../apps/debug80-vscode/roms/cpm22/editor-bdos.asmi",
);
const RETURN_ADDRESS = 0x0040;
const CALLER_SP = 0xe300;
const WORKSPACE_CANARY = 0xa5;
const TEXT_CANARY = 0xc7;

function word(memory, address) {
  return memory[address] | (memory[address + 1] << 8);
}

function setWord(memory, address, value) {
  memory[address] = value & 0xff;
  memory[address + 1] = (value >>> 8) & 0xff;
}

function bytes(text) {
  return Uint8Array.from(Buffer.from(text, "latin1"));
}

async function assemble(name) {
  return assembleEditorCandidate({
    name,
    source: resolve(candidateDirectory, `${name}.asm`),
    interfaceSource,
    includeRoots: [candidateDirectory, repositoryRoot],
  });
}

function symbol(candidate, name) {
  const value = candidate.symbols[name];
  assert.equal(typeof value, "number", `${candidate.name}: missing ${name}`);
  return value;
}

class FakeBdos {
  constructor(memory) {
    this.input = [];
    this.memory = memory;
    this.output = [];
  }

  queue(...values) {
    this.input.push(...values.flat());
  }

  invoke(cpu) {
    assert.equal(cpu.c & 0xff, 6, "replacement used a non-console BDOS call");
    let result = 0;
    if ((cpu.e & 0xff) === 0xff) result = this.input.shift() ?? 0;
    else this.output.push(cpu.e & 0xff);
    const returnAddress = word(this.memory, cpu.sp);
    cpu.sp = (cpu.sp + 2) & 0xffff;
    cpu.pc = returnAddress;
    cpu.a = result;
    cpu.flags.C = 0;
  }
}

function createMachine(candidate) {
  const initial = new Uint8Array(0x10000);
  initial.set(candidate.bytes, symbol(candidate, "EditorTransientStart"));
  const runtime = createZ80Runtime({ memory: initial, startAddress: 0 }, 0);
  const memory = runtime.hardware.memory;
  const workspaceUsedEnd =
    candidate.symbols.CandidateWorkspaceEnd ??
    symbol(candidate, "EditorWorkspaceEnd");
  memory.fill(
    WORKSPACE_CANARY,
    workspaceUsedEnd,
    symbol(candidate, "EditorWorkspaceLimit"),
  );
  memory.fill(
    TEXT_CANARY,
    symbol(candidate, "EditorTextBase"),
    symbol(candidate, "EditorTextLimit"),
  );
  return {
    bdos: new FakeBdos(memory),
    candidate,
    memory,
    runtime,
    workspaceUsedEnd,
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
    assert.ok(instructions < 30_000_000, `${candidate.name}:${routine} hung`);
    if (cpu.pc === 5) machine.bdos.invoke(cpu);
    else {
      const step = runtime.step();
      instructions += 1;
      tStates += step.cycles ?? 0;
    }
    minimumSp = Math.min(minimumSp, cpu.sp);
  }
  assert.equal(cpu.sp, CALLER_SP, `${candidate.name}:${routine} changed SP`);
  assert.equal(machine.bdos.input.length, 0, `${candidate.name}: unused input`);
  return {
    a: cpu.a,
    carry: cpu.flags.C !== 0,
    instructions,
    stackBytes: CALLER_SP - 2 - minimumSp,
    tStates,
  };
}

function install(machine, payload, cursor = 0, flags = 0) {
  const { candidate, memory } = machine;
  const base = symbol(candidate, "EditorTextBase");
  const limit = symbol(candidate, "EditorTextLimit");
  assert.ok(payload.length <= limit - base);
  memory.fill(TEXT_CANARY, base, limit);
  memory.set(payload, base);
  setWord(memory, symbol(candidate, "EditorLength"), payload.length);
  setWord(memory, symbol(candidate, "EditorCursor"), cursor);
  setWord(memory, symbol(candidate, "EditorTop"), 7);
  setWord(memory, symbol(candidate, "EditorHorizontal"), 3);
  setWord(memory, symbol(candidate, "EditorDesiredColumn"), 11);
  memory[symbol(candidate, "EditorFlags")] = flags;
  memory[symbol(candidate, "EditorStatus")] = 0;
  memory[symbol(candidate, "EditorSaveState")] = 0x5a;
}

function setQuery(machine, payload, tailSeed = 0x40) {
  const { candidate, memory } = machine;
  assert.ok(payload.length <= symbol(candidate, "EditorQueryCapacity"));
  memory[symbol(candidate, "EditorQueryLength")] = payload.length;
  memory.set(payload, symbol(candidate, "EditorQueryBuffer"));
  for (
    let index = payload.length;
    index < symbol(candidate, "EditorQueryCapacity");
    index += 1
  ) {
    memory[symbol(candidate, "EditorQueryBuffer") + index] =
      (tailSeed + index) & 0xff;
  }
}

function buffer(machine) {
  const { candidate, memory } = machine;
  const length = word(memory, symbol(candidate, "EditorLength"));
  const base = symbol(candidate, "EditorTextBase");
  return memory.slice(base, base + length);
}

function persistentSnapshot(machine) {
  const { candidate, memory } = machine;
  return {
    state: memory.slice(
      symbol(candidate, "EditorLength"),
      symbol(candidate, "EditorSaveState") + 1,
    ),
    text: memory.slice(
      symbol(candidate, "EditorTextBase"),
      symbol(candidate, "EditorTextLimit"),
    ),
  };
}

function assertCanaries(machine) {
  const { candidate, memory, workspaceUsedEnd } = machine;
  assert.ok(
    memory
      .slice(workspaceUsedEnd, symbol(candidate, "EditorWorkspaceLimit"))
      .every((value) => value === WORKSPACE_CANARY),
    `${candidate.name}: wrote above candidate workspace`,
  );
}

function runReplace(
  candidate,
  { text, query, cursor, input, flags = 0, tailSeed },
) {
  const machine = createMachine(candidate);
  install(machine, Uint8Array.from(text), cursor, flags);
  setQuery(machine, Uint8Array.from(query), tailSeed);
  machine.bdos.queue(input);
  const result = invoke(machine, "EditorReplaceBegin");
  assertCanaries(machine);
  return { machine, result };
}

function expectSuccess(candidate, test) {
  const { machine, result } = runReplace(candidate, test);
  assert.equal(result.carry, false, `${candidate.name}:${test.name} failed`);
  assert.deepEqual(buffer(machine), Uint8Array.from(test.expected));
  assert.equal(
    word(machine.memory, symbol(candidate, "EditorCursor")),
    test.expectedCursor,
  );
  assert.equal(
    machine.memory[symbol(candidate, "EditorStatus")],
    symbol(candidate, "EditorStatusReplaced"),
  );
  assert.ok(
    machine.memory[symbol(candidate, "EditorFlags")] &
      symbol(candidate, "EditorFlagDirty"),
  );
  assert.equal(
    machine.memory[symbol(candidate, "EditorFlags")] &
      symbol(candidate, "EditorFlagDesiredValid"),
    0,
  );
  assert.deepEqual(
    machine.memory.slice(
      symbol(candidate, "EditorQueryBuffer"),
      symbol(candidate, "EditorQueryBuffer") + test.query.length,
    ),
    Uint8Array.from(test.query),
  );
  return { machine, result };
}

function proveCommon(candidate) {
  const measurements = {};

  {
    const machine = createMachine(candidate);
    install(
      machine,
      bytes("alpha"),
      0,
      symbol(candidate, "EditorFlagDesiredValid") | 0x80,
    );
    setQuery(machine, new Uint8Array());
    const before = persistentSnapshot(machine);
    measurements.noQuery = invoke(machine, "EditorReplaceBegin");
    assert.equal(measurements.noQuery.carry, true);
    assert.equal(
      machine.memory[symbol(candidate, "EditorStatus")],
      symbol(candidate, "EditorStatusNoSearch"),
    );
    const after = persistentSnapshot(machine);
    after.state[
      symbol(candidate, "EditorStatus") - symbol(candidate, "EditorLength")
    ] =
      before.state[
        symbol(candidate, "EditorStatus") - symbol(candidate, "EditorLength")
      ];
    assert.deepEqual(after, before);
  }

  for (const [name, text, query, cursor] of [
    ["mismatch", "alpha", "beta", 0],
    ["partialEnd", "alpha", "phaX", 2],
    ["crossLf", "a\nb", "ab", 0],
    ["crossCrlf", "a\r\nb", "ab", 0],
  ]) {
    const machine = createMachine(candidate);
    install(machine, bytes(text), cursor, 0x85);
    setQuery(machine, bytes(query));
    const before = persistentSnapshot(machine);
    const result = invoke(machine, "EditorReplaceBegin");
    assert.equal(result.carry, true, `${candidate.name}:${name}`);
    assert.equal(
      machine.memory[symbol(candidate, "EditorStatus")],
      symbol(candidate, "EditorStatusNotFound"),
    );
    const after = persistentSnapshot(machine);
    after.state[
      symbol(candidate, "EditorStatus") - symbol(candidate, "EditorLength")
    ] =
      before.state[
        symbol(candidate, "EditorStatus") - symbol(candidate, "EditorLength")
      ];
    assert.deepEqual(after, before);
  }

  {
    const machine = createMachine(candidate);
    install(machine, bytes("alpha"), 0, 0x85);
    setQuery(machine, bytes("alpha"));
    const before = persistentSnapshot(machine);
    machine.bdos.queue(27);
    measurements.cancel = invoke(machine, "EditorReplaceBegin");
    assert.equal(measurements.cancel.carry, false);
    assert.equal(machine.memory[symbol(candidate, "EditorStatus")], 0);
    const after = persistentSnapshot(machine);
    after.state[
      symbol(candidate, "EditorStatus") - symbol(candidate, "EditorLength")
    ] =
      before.state[
        symbol(candidate, "EditorStatus") - symbol(candidate, "EditorLength")
      ];
    assert.deepEqual(after, before);
  }

  measurements.grow = expectSuccess(candidate, {
    name: "grow",
    text: bytes("abc def"),
    query: bytes("c"),
    cursor: 2,
    input: [...bytes("XYZ"), 13],
    expected: bytes("abXYZ def"),
    expectedCursor: 2,
    flags: symbol(candidate, "EditorFlagDesiredValid") | 0x80,
  }).result;
  measurements.shrink = expectSuccess(candidate, {
    name: "shrink",
    text: bytes("0123456789"),
    query: bytes("3456"),
    cursor: 3,
    input: [...bytes("Q"), 13],
    expected: bytes("012Q789"),
    expectedCursor: 3,
  }).result;
  measurements.equal = expectSuccess(candidate, {
    name: "equal",
    text: bytes("same"),
    query: bytes("same"),
    cursor: 0,
    input: [...bytes("same"), 13],
    expected: bytes("same"),
    expectedCursor: 0,
  }).result;
  measurements.delete = expectSuccess(candidate, {
    name: "delete",
    text: bytes("startEND"),
    query: bytes("END"),
    cursor: 5,
    input: [13],
    expected: bytes("start"),
    expectedCursor: 5,
  }).result;
  expectSuccess(candidate, {
    name: "start",
    text: bytes("one two"),
    query: bytes("one"),
    cursor: 0,
    input: [...bytes("1"), 13],
    expected: bytes("1 two"),
    expectedCursor: 0,
  });
  expectSuccess(candidate, {
    name: "end",
    text: bytes("one two"),
    query: bytes("two"),
    cursor: 4,
    input: [...bytes("THREE"), 13],
    expected: bytes("one THREE"),
    expectedCursor: 4,
  });
  const tab = expectSuccess(candidate, {
    name: "tab",
    text: bytes("a\tb\r\nc"),
    query: bytes("b"),
    cursor: 2,
    input: [9, 13],
    expected: bytes("a\t\t\r\nc"),
    expectedCursor: 2,
  });
  assert.ok(tab.machine.bdos.output.includes(">".charCodeAt(0)));
  assert.ok(
    Buffer.from(tab.machine.bdos.output)
      .toString("latin1")
      .includes("Replace: "),
  );

  {
    const machine = createMachine(candidate);
    install(machine, bytes("x"), 0);
    setQuery(machine, bytes("x"));
    machine.bdos.queue(8, 2, ...bytes("y"), 13);
    const result = invoke(machine, "EditorReplaceBegin");
    assert.equal(result.carry, false);
    assert.deepEqual(buffer(machine), bytes("y"));
    assert.equal(machine.bdos.output.filter((value) => value === 7).length, 2);
  }

  {
    const replacement = new Uint8Array(64).fill("R".charCodeAt(0));
    const accepted = expectSuccess(candidate, {
      name: "replacementCapacity",
      text: bytes("x"),
      query: bytes("x"),
      cursor: 0,
      input: [...replacement, "Z".charCodeAt(0), 13],
      expected: replacement,
      expectedCursor: 0,
    });
    assert.equal(
      accepted.machine.bdos.output.filter((value) => value === 7).length,
      1,
    );
  }

  {
    const capacity = symbol(candidate, "EditorTextCapacity");
    const payload = new Uint8Array(capacity - 1).fill("a".charCodeAt(0));
    const expected = new Uint8Array(capacity).fill("a".charCodeAt(0));
    expected[capacity - 2] = "b".charCodeAt(0);
    expected[capacity - 1] = "b".charCodeAt(0);
    const exact = expectSuccess(candidate, {
      name: "exactTextCapacity",
      text: payload,
      query: bytes("a"),
      cursor: capacity - 2,
      input: [...bytes("bb"), 13],
      expected,
      expectedCursor: capacity - 2,
    });
    assert.deepEqual(buffer(exact.machine).slice(capacity - 3), bytes("abb"));
    measurements.exactCapacity = exact.result;
  }

  {
    const capacity = symbol(candidate, "EditorTextCapacity");
    const machine = createMachine(candidate);
    install(
      machine,
      new Uint8Array(capacity).fill("a".charCodeAt(0)),
      capacity - 1,
      0x85,
    );
    setQuery(machine, bytes("a"), 0x71);
    const before = persistentSnapshot(machine);
    machine.bdos.queue(...bytes("bb"), 13);
    measurements.rejectedGrowth = invoke(machine, "EditorReplaceBegin");
    assert.equal(measurements.rejectedGrowth.carry, true);
    assert.equal(
      machine.memory[symbol(candidate, "EditorStatus")],
      symbol(candidate, "EditorStatusFull"),
    );
    const after = persistentSnapshot(machine);
    after.state[
      symbol(candidate, "EditorStatus") - symbol(candidate, "EditorLength")
    ] =
      before.state[
        symbol(candidate, "EditorStatus") - symbol(candidate, "EditorLength")
      ];
    assert.deepEqual(after, before);
  }

  {
    const first = expectSuccess(candidate, {
      name: "repeatedFirst",
      text: bytes("one one"),
      query: bytes("one"),
      cursor: 0,
      input: [...bytes("two"), 13],
      expected: bytes("two one"),
      expectedCursor: 0,
    });
    const repeat = invoke(first.machine, "EditorSearchRepeat");
    assert.equal(repeat.carry, false);
    assert.equal(
      word(first.machine.memory, symbol(candidate, "EditorCursor")),
      4,
    );
    first.machine.bdos.queue(...bytes("x"), 13);
    const second = invoke(first.machine, "EditorReplaceBegin");
    assert.equal(second.carry, false);
    assert.deepEqual(buffer(first.machine), bytes("two x"));
  }

  return measurements;
}

function proveAll(candidate) {
  const measurements = {};
  measurements.basic = expectSuccess(candidate, {
    name: "allBasic",
    text: bytes("one one one"),
    query: bytes("one"),
    cursor: 4,
    input: [...bytes("two"), 1],
    expected: bytes("two two two"),
    expectedCursor: 8,
  }).result;
  measurements.overlap = expectSuccess(candidate, {
    name: "allOverlap",
    text: bytes("aaa"),
    query: bytes("aa"),
    cursor: 0,
    input: [...bytes("X"), 1],
    expected: bytes("Xa"),
    expectedCursor: 0,
  }).result;
  measurements.insertedQuery = expectSuccess(candidate, {
    name: "allInsertedQuery",
    text: bytes("a a"),
    query: bytes("a"),
    cursor: 0,
    input: [...bytes("aa"), 1],
    expected: bytes("aa aa"),
    expectedCursor: 3,
  }).result;
  measurements.delete = expectSuccess(candidate, {
    name: "allDelete",
    text: bytes("aaaa"),
    query: bytes("aa"),
    cursor: 0,
    input: [1],
    expected: new Uint8Array(),
    expectedCursor: 0,
  }).result;
  expectSuccess(candidate, {
    name: "allTabsAndLines",
    text: bytes("x\ty\r\nx\ty\n"),
    query: bytes("x\ty"),
    cursor: 0,
    input: [...bytes("z"), 1],
    expected: bytes("z\r\nz\n"),
    expectedCursor: 3,
  });

  {
    const capacity = symbol(candidate, "EditorTextCapacity");
    const payload = new Uint8Array(capacity - 2).fill("x".charCodeAt(0));
    payload[capacity - 4] = "a".charCodeAt(0);
    payload[capacity - 3] = "a".charCodeAt(0);
    const expected = new Uint8Array(capacity).fill("x".charCodeAt(0));
    expected.set(bytes("aaaa"), capacity - 4);
    const exact = expectSuccess(candidate, {
      name: "allExactCapacity",
      text: payload,
      query: bytes("a"),
      cursor: capacity - 3,
      input: [...bytes("aa"), 1],
      expected,
      expectedCursor: capacity - 2,
    });
    assert.deepEqual(buffer(exact.machine).slice(capacity - 4), bytes("aaaa"));
  }

  {
    const capacity = symbol(candidate, "EditorTextCapacity");
    const payload = new Uint8Array(capacity - 1).fill("x".charCodeAt(0));
    payload[0] = "a".charCodeAt(0);
    payload[capacity - 2] = "a".charCodeAt(0);
    const machine = createMachine(candidate);
    install(machine, payload, 0, 0x85);
    setQuery(machine, bytes("a"), 0x82);
    const before = persistentSnapshot(machine);
    machine.bdos.queue(...bytes("aa"), 1);
    measurements.rejectedGrowth = invoke(machine, "EditorReplaceBegin");
    assert.equal(measurements.rejectedGrowth.carry, true);
    assert.equal(
      machine.memory[symbol(candidate, "EditorStatus")],
      symbol(candidate, "EditorStatusFull"),
    );
    const after = persistentSnapshot(machine);
    after.state[
      symbol(candidate, "EditorStatus") - symbol(candidate, "EditorLength")
    ] =
      before.state[
        symbol(candidate, "EditorStatus") - symbol(candidate, "EditorLength")
      ];
    assert.deepEqual(after, before);
  }
  return measurements;
}

function account(candidate) {
  return {
    artifact: candidate.bytes.length,
    code:
      symbol(candidate, "EditorCodeEnd") - symbol(candidate, "EditorCodeStart"),
    immutable:
      symbol(candidate, "EditorImmutableEnd") -
      symbol(candidate, "EditorImmutableStart"),
    textCapacity: symbol(candidate, "EditorTextCapacity"),
    workspace:
      (candidate.symbols.CandidateWorkspaceEnd ??
        symbol(candidate, "EditorWorkspaceEnd")) -
      symbol(candidate, "EditorWorkspaceBase"),
  };
}

const baseline = await assemble("baseline");
const single = await assemble("single");
const all = await assemble("all");
assert.equal(baseline.bytes.length, 2869);

const singleMeasurements = proveCommon(single);
const allCommonMeasurements = proveCommon(all);
const allMeasurements = proveAll(all);
const baselineAccount = account(baseline);
const singleAccount = account(single);
const allAccount = account(all);

console.log(
  JSON.stringify(
    {
      baseline: baselineAccount,
      candidates: {
        single: {
          ...singleAccount,
          delta: singleAccount.artifact - baselineAccount.artifact,
          measurements: singleMeasurements,
        },
        all: {
          ...allAccount,
          delta: allAccount.artifact - baselineAccount.artifact,
          measurements: {
            ...allCommonMeasurements,
            ...allMeasurements,
          },
        },
      },
      selected: "single",
    },
    undefined,
    2,
  ),
);
