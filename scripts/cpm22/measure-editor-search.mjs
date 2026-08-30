import assert from "node:assert/strict";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createZ80Runtime } from "@jhlagado/debug80-runtime/z80/runtime";
import { assembleEditorCandidate } from "./editor-candidate-assembly.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const candidateDirectory = join(scriptDirectory, "editor-search-candidates");
const RETURN_ADDRESS = 0xff00;
const INITIAL_SP = 0xfefe;
const TEXT_CANARY = 0xc7;
const WORKSPACE_CANARY = 0xa5;

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
  });
}

function symbol(candidate, name) {
  const value = candidate.symbols[name];
  assert.equal(typeof value, "number", `${candidate.name}: missing ${name}`);
  return value;
}

function createMemory(candidate) {
  const memory = new Uint8Array(0x10000);
  memory.fill(WORKSPACE_CANARY);
  memory.set(candidate.bytes, symbol(candidate, "CandidateCodeStart"));
  memory[RETURN_ADDRESS] = 0x76;
  memory[INITIAL_SP] = RETURN_ADDRESS & 0xff;
  memory[INITIAL_SP + 1] = RETURN_ADDRESS >>> 8;
  memory[symbol(candidate, "CandidateBellCount")] = 0;
  memory[symbol(candidate, "CandidatePromptCursor")] = 0;
  return memory;
}

function invoke(candidate, memory, routine, registers = {}) {
  memory[INITIAL_SP] = RETURN_ADDRESS & 0xff;
  memory[INITIAL_SP + 1] = RETURN_ADDRESS >>> 8;
  const runtime = createZ80Runtime({
    memory,
    startAddress: symbol(candidate, routine),
  });
  runtime.cpu.pc = symbol(candidate, routine);
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
    instructions,
    stackBytes: INITIAL_SP - minimumSp,
    tStates,
  };
}

function queryBlock(payload, tailSeed = 0x40) {
  assert.ok(payload.length <= 64);
  const block = new Uint8Array(65);
  block[0] = payload.length;
  block.set(payload, 1);
  for (let index = 1 + payload.length; index < block.length; index += 1) {
    block[index] = (tailSeed + index) & 0xff;
  }
  return block;
}

function setQueryAt(memory, address, payload, tailSeed) {
  memory.set(queryBlock(payload, tailSeed), address);
}

function queryAt(memory, address) {
  const length = memory[address];
  assert.ok(length <= 64);
  return memory.slice(address + 1, address + 1 + length);
}

function activeAddress(candidate) {
  return symbol(candidate, "CandidateActiveLength");
}

function committedAddress(candidate) {
  return symbol(candidate, "CandidateCommittedLength");
}

function setText(candidate, memory, payload) {
  const base = symbol(candidate, "CandidateTextBase");
  memory.fill(TEXT_CANARY, base - 1, base + payload.length + 1);
  memory.set(payload, base);
  setWord(memory, symbol(candidate, "CandidateTextLength"), payload.length);
}

function setCursor(candidate, memory, cursor) {
  setWord(memory, symbol(candidate, "CandidateCursor"), cursor);
}

function queryKey(candidate, memory, value) {
  return invoke(candidate, memory, "CandidateKey", { a: value });
}

function proveStorage(candidate) {
  const committed = committedAddress(candidate);
  const active = activeAddress(candidate);
  const previous = bytes("OLD");

  const cancelledMemory = createMemory(candidate);
  const previousBlock = queryBlock(previous, 0x20);
  cancelledMemory.set(previousBlock, committed);
  const beginCancel = invoke(candidate, cancelledMemory, "CandidateBegin");
  assert.deepEqual(cancelledMemory.slice(active, active + 65), previousBlock);
  assert.equal(queryKey(candidate, cancelledMemory, 8).carry, false);
  assert.equal(
    queryKey(candidate, cancelledMemory, "X".charCodeAt(0)).carry,
    false,
  );
  const cancel = queryKey(candidate, cancelledMemory, 27);
  assert.equal(cancel.a, 2);
  assert.equal(cancel.carry, false);
  assert.deepEqual(
    cancelledMemory.slice(committed, committed + 65),
    previousBlock,
  );

  const committedMemory = createMemory(candidate);
  committedMemory.set(previousBlock, committed);
  const beginCommit = invoke(candidate, committedMemory, "CandidateBegin");
  queryKey(candidate, committedMemory, 8);
  queryKey(candidate, committedMemory, "X".charCodeAt(0));
  const commit = queryKey(candidate, committedMemory, 13);
  assert.equal(commit.a, 1);
  assert.equal(commit.carry, false);
  assert.deepEqual(queryAt(committedMemory, committed), bytes("OLX"));

  const emptyReturnMemory = createMemory(candidate);
  setQueryAt(emptyReturnMemory, committed, new Uint8Array(), 0x50);
  invoke(candidate, emptyReturnMemory, "CandidateBegin");
  const emptyReturn = queryKey(candidate, emptyReturnMemory, 13);
  assert.equal(emptyReturn.a, 2);
  assert.equal(emptyReturn.carry, false);
  assert.equal(emptyReturnMemory[committed], 0);

  const boundaryMemory = createMemory(candidate);
  setQueryAt(boundaryMemory, committed, new Uint8Array(64).fill(0x41), 0x60);
  invoke(candidate, boundaryMemory, "CandidateBegin");
  const beforeBoundary = boundaryMemory.slice(active, active + 65);
  const overflow = queryKey(candidate, boundaryMemory, 0x42);
  assert.equal(overflow.carry, true);
  assert.deepEqual(boundaryMemory.slice(active, active + 65), beforeBoundary);
  assert.equal(boundaryMemory[symbol(candidate, "CandidateBellCount")], 1);

  const acceptedBoundaryMemory = createMemory(candidate);
  setQueryAt(
    acceptedBoundaryMemory,
    committed,
    new Uint8Array(63).fill(0x41),
    0x70,
  );
  invoke(candidate, acceptedBoundaryMemory, "CandidateBegin");
  const acceptedBoundary = queryKey(candidate, acceptedBoundaryMemory, 0x42);
  assert.equal(acceptedBoundary.carry, false);
  assert.equal(acceptedBoundaryMemory[active], 64);

  const controlsMemory = createMemory(candidate);
  setQueryAt(controlsMemory, committed, new Uint8Array(), 0x80);
  invoke(candidate, controlsMemory, "CandidateBegin");
  const emptyDelete = queryKey(candidate, controlsMemory, 127);
  assert.equal(emptyDelete.carry, true);
  assert.equal(controlsMemory[active], 0);
  const unsupported = queryKey(candidate, controlsMemory, 1);
  assert.equal(unsupported.carry, true);
  assert.equal(controlsMemory[active], 0);
  assert.equal(controlsMemory[symbol(candidate, "CandidateBellCount")], 2);
  assert.equal(queryKey(candidate, controlsMemory, 9).carry, false);
  assert.deepEqual(queryAt(controlsMemory, active), Uint8Array.of(9));

  return {
    beginCancel,
    cancel,
    beginCommit,
    commit,
    emptyReturn,
    acceptedBoundary,
    overflow,
    emptyDelete,
    unsupported,
  };
}

function provePrompt(candidate) {
  const memory = createMemory(candidate);
  setQueryAt(memory, committedAddress(candidate), bytes("A\tB"), 0x30);
  invoke(candidate, memory, "CandidateBegin");
  const execution = invoke(candidate, memory, "CandidateRenderPrompt");
  const row = memory.slice(
    symbol(candidate, "CandidatePromptRow"),
    symbol(candidate, "CandidatePromptRow") + 80,
  );
  const expected = new Uint8Array(80).fill(0x20);
  expected.set(bytes("Find: A>B"));
  assert.deepEqual(row, expected);
  assert.deepEqual(
    memory.slice(
      symbol(candidate, "CandidatePromptAttributes"),
      symbol(candidate, "CandidatePromptAttributes") + 80,
    ),
    new Uint8Array(80).fill(1),
  );
  assert.equal(memory[symbol(candidate, "CandidatePromptCursor")], 9);

  setQueryAt(memory, activeAddress(candidate), new Uint8Array(), 0x10);
  const empty = invoke(candidate, memory, "CandidateRenderPrompt");
  assert.equal(memory[symbol(candidate, "CandidatePromptCursor")], 6);

  setQueryAt(
    memory,
    activeAddress(candidate),
    new Uint8Array(64).fill(0x41),
    0,
  );
  const full = invoke(candidate, memory, "CandidateRenderPrompt");
  assert.equal(memory[symbol(candidate, "CandidatePromptCursor")], 70);
  assert.deepEqual(
    memory.slice(
      symbol(candidate, "CandidatePromptRow"),
      symbol(candidate, "CandidatePromptRow") + 70,
    ),
    bytes(`Find: ${"A".repeat(64)}`),
  );
  assert.deepEqual(
    memory.slice(
      symbol(candidate, "CandidatePromptRow") + 70,
      symbol(candidate, "CandidatePromptRow") + 80,
    ),
    new Uint8Array(10).fill(0x20),
  );
  return { populated: execution, empty, full };
}

function search(candidate, payload, query, cursor, repeat = false) {
  const memory = createMemory(candidate);
  setText(candidate, memory, payload);
  setQueryAt(memory, committedAddress(candidate), query, 0x44);
  setCursor(candidate, memory, cursor);
  memory[symbol(candidate, "CandidateStatus")] = 0;
  memory[symbol(candidate, "CandidateBellCount")] = 0;
  const originalText = memory.slice(
    symbol(candidate, "CandidateTextBase"),
    symbol(candidate, "CandidateTextBase") + payload.length,
  );
  const execution = invoke(
    candidate,
    memory,
    repeat ? "CandidateSearchRepeat" : "CandidateSearchInitial",
  );
  assert.deepEqual(
    memory.slice(
      symbol(candidate, "CandidateTextBase"),
      symbol(candidate, "CandidateTextBase") + payload.length,
    ),
    originalText,
  );
  assert.equal(memory[symbol(candidate, "CandidateTextBase") - 1], TEXT_CANARY);
  assert.equal(
    memory[symbol(candidate, "CandidateTextBase") + payload.length],
    TEXT_CANARY,
  );
  return {
    bell: memory[symbol(candidate, "CandidateBellCount")],
    cursor: word(memory, symbol(candidate, "CandidateCursor")),
    execution,
    status: memory[symbol(candidate, "CandidateStatus")],
  };
}

function expectSearch(result, { bell = 0, carry = false, cursor, status }) {
  assert.equal(result.bell, bell);
  assert.equal(result.execution.carry, carry);
  assert.equal(result.cursor, cursor);
  assert.equal(result.status, status);
  return result.execution;
}

function proveSearch(candidate) {
  const found = symbol(candidate, "CandidateStatusFound");
  const wrapped = symbol(candidate, "CandidateStatusWrapped");
  const missing = symbol(candidate, "CandidateStatusMissing");
  const noQuery = symbol(candidate, "CandidateStatusNoQuery");
  const sequence = bytes("ABABA\r\nX\tY\nABA");
  const query = bytes("ABA");

  const first = expectSearch(search(candidate, sequence, query, 0), {
    cursor: 0,
    status: found,
  });
  const overlap = expectSearch(search(candidate, sequence, query, 0, true), {
    cursor: 2,
    status: found,
  });
  const later = expectSearch(search(candidate, sequence, query, 2, true), {
    cursor: 11,
    status: found,
  });
  const wrap = expectSearch(search(candidate, sequence, query, 11, true), {
    cursor: 0,
    status: wrapped,
  });
  const selfAfterRing = expectSearch(
    search(candidate, bytes("ABA"), query, 0, true),
    { cursor: 0, status: wrapped },
  );
  const noWrapSpanning = expectSearch(
    search(candidate, bytes("AB"), bytes("BA"), 1),
    { bell: 1, carry: true, cursor: 1, status: missing },
  );
  const afterLf = expectSearch(
    search(candidate, bytes("A\nTARGET"), bytes("TARGET"), 0),
    { cursor: 2, status: found },
  );
  const afterCrlf = expectSearch(
    search(candidate, bytes("A\r\nTARGET"), bytes("TARGET"), 0),
    { cursor: 3, status: found },
  );
  const tab = expectSearch(
    search(candidate, bytes("A\tB"), Uint8Array.of(9), 0),
    {
      cursor: 1,
      status: found,
    },
  );
  const finalComplete = expectSearch(
    search(candidate, bytes("XYZZ"), bytes("ZZ"), 0),
    { cursor: 2, status: found },
  );
  const tooLong = expectSearch(
    search(candidate, bytes("ABC"), bytes("ABCDE"), 2),
    { bell: 1, carry: true, cursor: 2, status: missing },
  );
  const failed = expectSearch(
    search(candidate, bytes("ABCDEFGHI"), bytes("XYZ"), 4),
    { bell: 1, carry: true, cursor: 4, status: missing },
  );
  const emptyText = expectSearch(
    search(candidate, new Uint8Array(), bytes("A"), 0),
    { bell: 1, carry: true, cursor: 0, status: missing },
  );
  const absent = expectSearch(
    search(candidate, bytes("ABC"), new Uint8Array(), 1, true),
    { bell: 1, carry: true, cursor: 1, status: noQuery },
  );
  const maxQueryMatch = expectSearch(
    search(
      candidate,
      new Uint8Array(64).fill(0x41),
      new Uint8Array(64).fill(0x41),
      0,
    ),
    { cursor: 0, status: found },
  );
  const fullText = new Uint8Array(47_104).fill(0x41);
  const fullMiss = expectSearch(
    search(candidate, fullText, Uint8Array.of(0x42), 23_552),
    { bell: 1, carry: true, cursor: 23_552, status: missing },
  );
  const finalText = fullText.slice();
  finalText[finalText.length - 1] = 0x42;
  const fullFinal = expectSearch(
    search(candidate, finalText, Uint8Array.of(0x42), 0),
    { cursor: 47_103, status: found },
  );

  const resetMemory = createMemory(candidate);
  setQueryAt(resetMemory, committedAddress(candidate), query, 0x20);
  setCursor(candidate, resetMemory, 2);
  resetMemory[symbol(candidate, "CandidateStatus")] = 0xff;
  resetMemory[symbol(candidate, "CandidateBellCount")] = 0xff;
  const reset = invoke(candidate, resetMemory, "CandidateReset");
  assert.equal(resetMemory[committedAddress(candidate)], 0);
  assert.equal(word(resetMemory, symbol(candidate, "CandidateCursor")), 0);
  assert.equal(resetMemory[symbol(candidate, "CandidateStatus")], 0);
  assert.equal(resetMemory[symbol(candidate, "CandidateBellCount")], 0);

  return {
    first,
    overlap,
    later,
    wrap,
    selfAfterRing,
    noWrapSpanning,
    afterLf,
    afterCrlf,
    tab,
    finalComplete,
    tooLong,
    failed,
    emptyText,
    absent,
    maxQueryMatch,
    fullMiss,
    fullFinal,
    reset,
  };
}

function measure(candidate) {
  const accounts = {
    completeBytes:
      symbol(candidate, "CandidateCodeEnd") -
      symbol(candidate, "CandidateCodeStart"),
    executableBytes:
      symbol(candidate, "CandidateImmutableStart") -
      symbol(candidate, "CandidateCodeStart"),
    storageCodeBytes:
      symbol(candidate, "CandidateStorageCodeEnd") -
      symbol(candidate, "CandidateStorageCodeStart"),
    sharedCodeBytes:
      symbol(candidate, "CandidateCommonCodeEnd") -
      symbol(candidate, "CandidateStorageCodeEnd"),
    scanCodeBytes:
      symbol(candidate, "CandidateScanCodeEnd") -
      symbol(candidate, "CandidateScanCodeStart"),
    immutableBytes:
      symbol(candidate, "CandidateImmutableEnd") -
      symbol(candidate, "CandidateImmutableStart"),
    newWorkspaceBytes:
      symbol(candidate, "CandidateNewWorkspaceEnd") -
      symbol(candidate, "CandidateNewWorkspaceStart"),
    overlaidExistingBytes: symbol(candidate, "CandidateOverlayBytes"),
  };
  assert.equal(candidate.bytes.length, accounts.completeBytes);
  return {
    accounts,
    prompt: provePrompt(candidate),
    search: proveSearch(candidate),
    storage: proveStorage(candidate),
  };
}

const candidates = {};
for (const name of ["dedicated", "dma-staging", "dma-rollback"]) {
  const candidate = await assemble(name);
  candidates[name] = measure(candidate);
}

const scanCandidates = {};
for (const name of ["scan-endpoint", "scan-counted"]) {
  const candidate = await assemble(name);
  scanCandidates[name] = {
    completePrototypeBytes:
      symbol(candidate, "CandidateCodeEnd") -
      symbol(candidate, "CandidateCodeStart"),
    scanCodeBytes:
      symbol(candidate, "CandidateScanCodeEnd") -
      symbol(candidate, "CandidateScanCodeStart"),
    search: proveSearch(candidate),
  };
}

assert.equal(
  candidates.dedicated.accounts.completeBytes,
  candidates["dma-staging"].accounts.completeBytes,
);
assert.equal(
  candidates.dedicated.accounts.completeBytes,
  candidates["dma-rollback"].accounts.completeBytes,
);
assert.equal(candidates.dedicated.accounts.newWorkspaceBytes, 130);
assert.equal(candidates["dma-staging"].accounts.newWorkspaceBytes, 65);
assert.equal(candidates["dma-rollback"].accounts.newWorkspaceBytes, 65);
assert.equal(scanCandidates["scan-endpoint"].scanCodeBytes, 190);
assert.equal(scanCandidates["scan-counted"].scanCodeBytes, 183);

const report = {
  format: "debug80-cpm22-editor-search-candidates",
  version: 1,
  boundary:
    "complete candidate-specific query storage plus shared query-key, prompt-cell, bounded literal-scan, status, and reset paths; excludes existing editor key input, terminal byte output, full-screen render, and viewport code",
  candidates,
  scanCandidates,
  scanSelection: "scan-counted",
  scanSelectionReason:
    "the counted ring proves the same exact visit order and wrap behavior in seven fewer executable bytes by retaining a remaining-candidate count instead of comparing a saved endpoint in two phases",
  selection: "dma-rollback",
  selectionReason:
    "ties the other designs in resident bytes, uses 65 rather than 130 new workspace bytes, and makes the common accepted-query path the shortest and fastest by snapshotting to inactive DMA only on entry",
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
