import assert from "node:assert/strict";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { compile, defaultFormatWriters } from "@jhlagado/azm/compile";
import { createZ80Runtime } from "@jhlagado/debug80-runtime/z80/runtime";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const candidateDirectory = join(scriptDirectory, "editor-buffer-candidates");
const BUFFER_BASE = 0x2000;
const BUFFER_LIMIT = 0xd800;
const BUFFER_CAPACITY = BUFFER_LIMIT - BUFFER_BASE;
const RETURN_ADDRESS = 0xff00;
const INITIAL_SP = 0xfefe;

function word(memory, address) {
  return memory[address] | (memory[address + 1] << 8);
}

function setWord(memory, address, value) {
  memory[address] = value & 0xff;
  memory[address + 1] = (value >>> 8) & 0xff;
}

async function assemble(name) {
  const source = resolve(candidateDirectory, `${name}.asm`);
  const result = await compile(
    source,
    {
      emitBin: true,
      emitD8m: true,
      emitHex: false,
      emitLst: false,
      emitAsm80: false,
      registerContracts: "strict",
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
    map.json.symbols.flatMap((symbol) => {
      const value = symbol.address ?? symbol.value;
      return value === undefined ? [] : [[symbol.name, value]];
    }),
  );
  return { bytes: binary.bytes, name, symbols };
}

function createMemory(candidate) {
  const memory = new Uint8Array(0x10000);
  memory.set(candidate.bytes, candidate.symbols.CandidateCodeStart);
  memory[RETURN_ADDRESS] = 0x76;
  memory[INITIAL_SP] = RETURN_ADDRESS & 0xff;
  memory[INITIAL_SP + 1] = RETURN_ADDRESS >>> 8;
  return memory;
}

function installState(candidate, memory, bytes, cursor) {
  assert.ok(cursor >= 0 && cursor <= bytes.length);
  assert.ok(bytes.length <= BUFFER_CAPACITY);
  if (candidate.name === "contiguous") {
    memory.set(bytes, BUFFER_BASE);
    setWord(memory, candidate.symbols.CandidateLength, bytes.length);
    setWord(memory, candidate.symbols.CandidateCursor, cursor);
    return;
  }
  memory.set(bytes.subarray(0, cursor), BUFFER_BASE);
  const post = bytes.subarray(cursor);
  const high = BUFFER_LIMIT - post.length;
  memory.set(post, high);
  setWord(memory, candidate.symbols.CandidateGapLow, BUFFER_BASE + cursor);
  setWord(memory, candidate.symbols.CandidateGapHigh, high);
}

function readState(candidate, memory) {
  if (candidate.name === "contiguous") {
    const length = word(memory, candidate.symbols.CandidateLength);
    return {
      bytes: memory.slice(BUFFER_BASE, BUFFER_BASE + length),
      cursor: word(memory, candidate.symbols.CandidateCursor),
    };
  }
  const low = word(memory, candidate.symbols.CandidateGapLow);
  const high = word(memory, candidate.symbols.CandidateGapHigh);
  const before = memory.slice(BUFFER_BASE, low);
  const after = memory.slice(high, BUFFER_LIMIT);
  const bytes = new Uint8Array(before.length + after.length);
  bytes.set(before);
  bytes.set(after, before.length);
  return { bytes, cursor: before.length };
}

function invoke(candidate, memory, routine, registers = {}) {
  const runtime = createZ80Runtime({
    memory,
    startAddress: candidate.symbols[routine],
  });
  runtime.cpu.pc = candidate.symbols[routine];
  runtime.cpu.sp = INITIAL_SP;
  for (const [register, value] of Object.entries(registers)) {
    runtime.cpu[register] = value;
  }
  let instructions = 0;
  let tStates = 0;
  let minimumSp = runtime.cpu.sp;
  while (runtime.cpu.pc !== RETURN_ADDRESS && instructions < 5_000_000) {
    const step = runtime.step();
    instructions += 1;
    tStates += step.cycles ?? 0;
    minimumSp = Math.min(minimumSp, runtime.cpu.sp);
  }
  assert.equal(
    runtime.cpu.pc,
    RETURN_ADDRESS,
    `${candidate.name}:${routine} did not return`,
  );
  assert.equal(
    runtime.cpu.sp,
    INITIAL_SP + 2,
    `${candidate.name}:${routine} changed stack shape`,
  );
  memory.set(runtime.hardware.memory);
  return {
    a: runtime.cpu.a,
    carry: runtime.cpu.flags.C === 1,
    hl: (runtime.cpu.h << 8) | runtime.cpu.l,
    instructions,
    stackBytes: INITIAL_SP - minimumSp,
    tStates,
  };
}

function pattern(length) {
  const bytes = new Uint8Array(length);
  for (let index = 0; index < length; index += 1) {
    bytes[index] = index % 17 === 16 ? 10 : 0x41 + (index % 26);
  }
  return bytes;
}

function inserted(source, cursor, value) {
  const result = new Uint8Array(source.length + 1);
  result.set(source.subarray(0, cursor));
  result[cursor] = value;
  result.set(source.subarray(cursor), cursor + 1);
  return result;
}

function deleted(source, index) {
  const result = new Uint8Array(source.length - 1);
  result.set(source.subarray(0, index));
  result.set(source.subarray(index + 1), index);
  return result;
}

function measureInsert(candidate, length, cursor) {
  const source = pattern(length);
  const memory = createMemory(candidate);
  installState(candidate, memory, source, cursor);
  const execution = invoke(candidate, memory, "CandidateInsert", { a: 0x5a });
  if (length === BUFFER_CAPACITY) {
    assert.equal(execution.carry, true);
    assert.deepEqual(readState(candidate, memory), { bytes: source, cursor });
  } else {
    assert.equal(execution.carry, false);
    assert.deepEqual(readState(candidate, memory), {
      bytes: inserted(source, cursor, 0x5a),
      cursor: cursor + 1,
    });
  }
  return execution;
}

function measureDelete(candidate, length, cursor, backward) {
  const source = pattern(length);
  const memory = createMemory(candidate);
  installState(candidate, memory, source, cursor);
  const routine = backward ? "CandidateBackspace" : "CandidateDelete";
  const execution = invoke(candidate, memory, routine);
  const index = backward ? cursor - 1 : cursor;
  if (index < 0 || index >= length) {
    assert.equal(execution.carry, true);
    assert.deepEqual(readState(candidate, memory), { bytes: source, cursor });
  } else {
    assert.equal(execution.carry, false);
    assert.deepEqual(readState(candidate, memory), {
      bytes: deleted(source, index),
      cursor: backward ? cursor - 1 : cursor,
    });
  }
  return execution;
}

function measureTraverse(candidate, length, cursor) {
  const source = pattern(length);
  const memory = createMemory(candidate);
  installState(candidate, memory, source, cursor);
  const execution = invoke(candidate, memory, "CandidateTraverse");
  const expected = source.reduce((sum, byte) => (sum + byte) & 0xff, 0);
  assert.equal(execution.a, expected);
  assert.deepEqual(readState(candidate, memory), { bytes: source, cursor });
  return execution;
}

function measureLoaded(candidate, length) {
  const source = pattern(length);
  const memory = createMemory(candidate);
  memory.set(source, BUFFER_BASE);
  const execution = invoke(candidate, memory, "CandidateSetLoaded", {
    h: length >>> 8,
    l: length & 0xff,
  });
  assert.equal(execution.carry, false);
  assert.deepEqual(readState(candidate, memory), { bytes: source, cursor: 0 });
  return execution;
}

function measureReset(candidate) {
  const source = pattern(95);
  const memory = createMemory(candidate);
  installState(candidate, memory, source, 47);
  const execution = invoke(candidate, memory, "CandidateReset");
  assert.deepEqual(readState(candidate, memory), {
    bytes: new Uint8Array(),
    cursor: 0,
  });
  return execution;
}

function measureMove(candidate, length, cursor, direction) {
  const source = pattern(length);
  const memory = createMemory(candidate);
  installState(candidate, memory, source, cursor);
  const execution = invoke(
    candidate,
    memory,
    direction === "left" ? "CandidateLeft" : "CandidateRight",
  );
  const expectedCursor = direction === "left" ? cursor - 1 : cursor + 1;
  const boundary = expectedCursor < 0 || expectedCursor > length;
  assert.equal(execution.carry, boundary);
  assert.deepEqual(readState(candidate, memory), {
    bytes: source,
    cursor: boundary ? cursor : expectedCursor,
  });
  return execution;
}

function invokeAt(candidate, memory, routine, offset) {
  return invoke(candidate, memory, routine, {
    h: offset >>> 8,
    l: offset & 0xff,
  });
}

function proveByteMapping(candidate, length, cursor, allBytes = false) {
  const source = pattern(length);
  const memory = createMemory(candidate);
  installState(candidate, memory, source, cursor);
  const indices = allBytes
    ? [...source.keys()]
    : [...new Set([0, cursor - 1, cursor, cursor + 1, length - 1])].filter(
        (index) => index >= 0 && index < length,
      );
  for (const index of indices) {
    const execution = invokeAt(candidate, memory, "CandidateByteAt", index);
    assert.equal(execution.carry, false);
    assert.equal(execution.a, source[index]);
  }
  const eof = invokeAt(candidate, memory, "CandidateByteAt", length);
  assert.equal(eof.carry, true);
}

function measureLineLookup(candidate, length, cursor) {
  const source = pattern(length);
  const memory = createMemory(candidate);
  installState(candidate, memory, source, cursor);
  const previousLf = source.lastIndexOf(10, Math.max(0, cursor - 1));
  const expectedStart = previousLf === -1 ? 0 : previousLf + 1;
  const nextLf = source.indexOf(10, cursor);
  const expectedNext = nextLf === -1 ? length : nextLf + 1;
  const start = invokeAt(candidate, memory, "CandidateFindLineStart", cursor);
  const next = invokeAt(candidate, memory, "CandidateFindNextLine", cursor);
  assert.equal(start.hl, expectedStart);
  assert.equal(next.hl, expectedNext);
  assert.equal(next.carry, nextLf === -1);
  return { start, next };
}

function measurements(candidate) {
  const representative = 95;
  const nearlyFull = BUFFER_CAPACITY - 1;
  proveByteMapping(candidate, representative, representative >>> 1, true);
  proveByteMapping(candidate, BUFFER_CAPACITY, BUFFER_CAPACITY >>> 1);
  return {
    codeBytes:
      candidate.symbols.CandidateCodeEnd - candidate.symbols.CandidateCodeStart,
    representationBytes:
      candidate.symbols.CandidateRepresentationEnd -
      candidate.symbols.CandidateRepresentationStart,
    commonBytes:
      candidate.symbols.CandidateCommonEnd -
      candidate.symbols.CandidateRepresentationEnd,
    workspaceBytes: candidate.name === "contiguous" ? 6 : 7,
    usableTextBytes: BUFFER_CAPACITY,
    reset: measureReset(candidate),
    load: {
      empty: measureLoaded(candidate, 0),
      representative: measureLoaded(candidate, representative),
      full: measureLoaded(candidate, BUFFER_CAPACITY),
    },
    insert: {
      empty: measureInsert(candidate, 0, 0),
      representativeStart: measureInsert(candidate, representative, 0),
      representativeMiddle: measureInsert(
        candidate,
        representative,
        representative >>> 1,
      ),
      representativeEnd: measureInsert(
        candidate,
        representative,
        representative,
      ),
      nearlyFullStart: measureInsert(candidate, nearlyFull, 0),
      nearlyFullMiddle: measureInsert(candidate, nearlyFull, nearlyFull >>> 1),
      nearlyFullEnd: measureInsert(candidate, nearlyFull, nearlyFull),
      fullRejected: measureInsert(
        candidate,
        BUFFER_CAPACITY,
        BUFFER_CAPACITY >>> 1,
      ),
    },
    backspace: {
      empty: measureDelete(candidate, 0, 0, true),
      representativeStart: measureDelete(candidate, representative, 1, true),
      representativeMiddle: measureDelete(
        candidate,
        representative,
        representative >>> 1,
        true,
      ),
      representativeEnd: measureDelete(
        candidate,
        representative,
        representative,
        true,
      ),
      fullStart: measureDelete(candidate, BUFFER_CAPACITY, 1, true),
      fullMiddle: measureDelete(
        candidate,
        BUFFER_CAPACITY,
        BUFFER_CAPACITY >>> 1,
        true,
      ),
      fullEnd: measureDelete(candidate, BUFFER_CAPACITY, BUFFER_CAPACITY, true),
    },
    delete: {
      empty: measureDelete(candidate, 0, 0, false),
      representativeStart: measureDelete(candidate, representative, 0, false),
      representativeMiddle: measureDelete(
        candidate,
        representative,
        representative >>> 1,
        false,
      ),
      representativeEnd: measureDelete(
        candidate,
        representative,
        representative - 1,
        false,
      ),
      fullStart: measureDelete(candidate, BUFFER_CAPACITY, 0, false),
      fullMiddle: measureDelete(
        candidate,
        BUFFER_CAPACITY,
        BUFFER_CAPACITY >>> 1,
        false,
      ),
      fullEnd: measureDelete(
        candidate,
        BUFFER_CAPACITY,
        BUFFER_CAPACITY - 1,
        false,
      ),
    },
    movement: {
      leftBoundary: measureMove(candidate, representative, 0, "left"),
      leftMiddle: measureMove(
        candidate,
        representative,
        representative >>> 1,
        "left",
      ),
      rightMiddle: measureMove(
        candidate,
        representative,
        representative >>> 1,
        "right",
      ),
      rightBoundary: measureMove(
        candidate,
        representative,
        representative,
        "right",
      ),
    },
    lineLookup: {
      representative: measureLineLookup(
        candidate,
        representative,
        representative >>> 1,
      ),
      full: measureLineLookup(
        candidate,
        BUFFER_CAPACITY,
        BUFFER_CAPACITY >>> 1,
      ),
    },
    traverse: {
      representativeStart: measureTraverse(candidate, representative, 0),
      representativeMiddle: measureTraverse(
        candidate,
        representative,
        representative >>> 1,
      ),
      fullMiddle: measureTraverse(
        candidate,
        BUFFER_CAPACITY,
        BUFFER_CAPACITY >>> 1,
      ),
    },
  };
}

const candidates = await Promise.all([assemble("contiguous"), assemble("gap")]);
const report = Object.fromEntries(
  candidates.map((candidate) => [candidate.name, measurements(candidate)]),
);
report.lineDescriptors = {
  classification: "measured capacity rejection",
  maximumLogicalLines: BUFFER_CAPACITY + 1,
  minimumDescriptorBytes: (BUFFER_CAPACITY + 1) * 2,
  fixedWorkspaceBytes: 512,
  workspaceShortfallBytes: (BUFFER_CAPACITY + 1) * 2 - 512,
  fitsFixedPartition: false,
};

console.log(JSON.stringify(report, undefined, 2));
