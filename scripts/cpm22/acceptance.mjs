import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createCpm22PlatformRuntime } from "@jhlagado/debug80-runtime/platforms/cpm22/runtime";
import { CPM22_TERMINAL_ATTR_REVERSE } from "@jhlagado/debug80-runtime/platforms/cpm22/terminal";
import {
  installCpm22File,
  readCpm22File,
} from "@jhlagado/debug80-runtime/platforms/cpm22/filesystem";
import { createZ80Runtime } from "@jhlagado/debug80-runtime/z80/runtime";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..", "..");
const romDirectory = join(
  repositoryRoot,
  "apps",
  "debug80-vscode",
  "roms",
  "cpm22",
);

const bootstrap = new Uint8Array(
  await readFile(join(romDirectory, "bootstrap.bin")),
);
const sourceDiskImage = new Uint8Array(
  await readFile(join(romDirectory, "cpm22.img")),
);
const mainProgram = Uint8Array.from([
  0x0e, 0x09, 0x11, 0x09, 0x01, 0xcd, 0x05, 0x00, 0xc9, 0x48, 0x69, 0x0d, 0x0a,
  0x24,
]);
const oldKeepProgram = Uint8Array.of(0xc9, 0x4b, 0x45, 0x45, 0x50);
const reservedKeepTemporary = Uint8Array.of(0xa5);
const diskImage = installCpm22File(
  installCpm22File(
    installCpm22File(sourceDiskImage, "MAIN.COM", mainProgram),
    "KEEP.COM",
    oldKeepProgram,
  ),
  "KEEP.$$$",
  reservedKeepTemporary,
);
const debugMap = JSON.parse(
  await readFile(join(romDirectory, "bios.d8m.json"), "utf8"),
);
const consoleOutput = debugMap.symbols.find(
  (symbol) => symbol.name === "ConsoleOutput",
);
assert.equal(
  typeof consoleOutput?.address,
  "number",
  "BIOS debug map must expose ConsoleOutput",
);

const memory = new Uint8Array(0x10000);
memory.set(bootstrap);
const platform = createCpm22PlatformRuntime({ diskImage });
const output = [];
const ioHandlers = {
  read: platform.ioHandlers.read,
  write(port, value) {
    if ((port & 0xff) === 0) output.push(value & 0xff);
    platform.ioHandlers.write(port, value);
  },
};
const cpu = createZ80Runtime({ memory, startAddress: 0 }, 0, ioHandlers);
let instructions = 0;
let tStates = 0;
const bdosCalls = [];

function transcript(from = 0) {
  return Buffer.from(output.slice(from)).toString("latin1");
}

function logicalCpmBytes(file, name) {
  assert.ok(file, `${name} is missing from the bundled disk`);
  const eof = file.bytes.indexOf(0x1a);
  return file.bytes.slice(0, eof === -1 ? file.bytes.length : eof);
}

function terminalRow(row) {
  const snapshot = platform.terminal.snapshot();
  return Buffer.from(
    snapshot.cells.slice(row * snapshot.columns, (row + 1) * snapshot.columns),
  ).toString("ascii");
}

function stepUntil(predicate, description, maximum = 5_000_000) {
  for (let count = 1; count <= maximum; count += 1) {
    if (cpu.getPC() === 0x0005) {
      const registers = cpu.getRegisters();
      bdosCalls.push({
        function: registers.c,
        returnAddress:
          cpu.hardware.memory[registers.sp] |
          (cpu.hardware.memory[registers.sp + 1] << 8),
      });
    }
    const step = cpu.step();
    instructions += 1;
    tStates += step.cycles ?? 0;
    if (predicate()) return count;
  }
  throw new Error(
    `timed out waiting for ${description}; transcript=${JSON.stringify(transcript())}`,
  );
}

function runCommand(command, expected, maximum = 5_000_000) {
  const instructionStart = instructions;
  const tStateStart = tStates;
  const start = output.length;
  platform.terminal.enqueueInput(Buffer.from(`${command}\r`, "ascii"));
  stepUntil(
    () => transcript(start).endsWith("\r\nA>"),
    `${command} prompt`,
    maximum,
  );
  assert.equal(transcript(start), expected);
  return {
    instructions: instructions - instructionStart,
    tStates: tStates - tStateStart,
  };
}

stepUntil(
  () => cpu.getPC() === consoleOutput.address,
  "BIOS ConsoleOutput breakpoint",
);
assert.equal(cpu.getPC(), consoleOutput.address);
assert.equal(
  cpu.getRegisters().c,
  13,
  "first BIOS ConsoleOutput call should print carriage return",
);

stepUntil(() => transcript().endsWith("A>"), "cold-boot prompt");
assert.equal(transcript(), "\r\nA>");

runCommand(
  "DIR",
  "DIR\r\r\nA: README   TXT : SMOKE    COM : ATOM     COM : INPUT    ASM\r\nA: HELLO    ASM : LARGE    ASM : PART1    ASM : PART2    ASM\r\nA: BUILD    ASM : NUCLEUS  COM : INPUT    NU  : EDIT     COM\r\nA: MAIN     COM : KEEP     COM : KEEP     $$$\r\nA>",
);
runCommand("MAIN", "MAIN\r\r\nHi\r\n\r\nA>");
runCommand(
  "TYPE README.TXT",
  "TYPE README.TXT\r\r\nDebug80 CP/M 2.2 platform\r\n\r\nA>",
);
runCommand("SMOKE", "SMOKE\r\r\nWrote RESULT.TXT\r\n\r\nA>");
runCommand(
  "TYPE RESULT.TXT",
  "TYPE RESULT.TXT\r\r\nCP/M file services are working\r\n\r\nA>",
);
const atomExecution = runCommand(
  "ATOM",
  "ATOM\r\r\n\r\nOUTPUT.COM written\r\n\r\nA>",
);
assert.deepEqual(atomExecution, {
  instructions: 205925,
  tStates: 2675545,
});
const expectedOutput = Uint8Array.from([
  0x0e,
  0x09,
  0x11,
  0x09,
  0x01,
  0xcd,
  0x05,
  0x00,
  0xc9,
  ...Buffer.from("Hello from native Atom\r\n$", "ascii"),
]);
const outputFile = readCpm22File(platform.disk.exportImage(), "OUTPUT.COM");
assert.ok(outputFile, "native Atom did not publish OUTPUT.COM");
assert.deepEqual(
  outputFile.bytes.slice(0, expectedOutput.length),
  expectedOutput,
);
runCommand("OUTPUT", "OUTPUT\r\r\nHello from native Atom\r\n\r\nA>");
const namedAtomExecution = runCommand(
  "ATOM HELLO.ASM MADE.COM",
  "ATOM HELLO.ASM MADE.COM\r\r\n\r\nMADE.COM written\r\n\r\nA>",
);
assert.deepEqual(namedAtomExecution, {
  instructions: 216825,
  tStates: 2780784,
});
const namedOutputFile = readCpm22File(platform.disk.exportImage(), "MADE.COM");
assert.ok(namedOutputFile, "native Atom did not publish selected MADE.COM");
assert.deepEqual(
  namedOutputFile.bytes.slice(0, expectedOutput.length),
  expectedOutput,
);
runCommand("MADE", "MADE\r\r\nHello from native Atom\r\n\r\nA>");
const largeAtomExecution = runCommand(
  "ATOM LARGE.ASM LARGE.COM",
  "ATOM LARGE.ASM LARGE.COM\r\r\n\r\nLARGE.COM written\r\n\r\nA>",
);
assert.deepEqual(largeAtomExecution, {
  instructions: 4299448,
  tStates: 42151783,
});
const largeOutputFile = readCpm22File(platform.disk.exportImage(), "LARGE.COM");
assert.ok(
  largeOutputFile,
  "native Atom did not publish LARGE.COM from the 16.5 KiB source",
);
assert.deepEqual(
  largeOutputFile.bytes.slice(0, expectedOutput.length),
  expectedOutput,
);
runCommand("LARGE", "LARGE\r\r\nHello from native Atom\r\n\r\nA>");
const multipartPart1 = readCpm22File(sourceDiskImage, "PART1.ASM");
const multipartPart2 = readCpm22File(sourceDiskImage, "PART2.ASM");
const multipartRoot = readCpm22File(sourceDiskImage, "BUILD.ASM");
const multipartPart1Bytes = logicalCpmBytes(multipartPart1, "PART1.ASM");
const multipartPart2Bytes = logicalCpmBytes(multipartPart2, "PART2.ASM");
const multipartRootBytes = logicalCpmBytes(multipartRoot, "BUILD.ASM");
assert.equal(multipartPart1Bytes.length, 33_000);
assert.equal(multipartPart2Bytes.length, 33_000);
assert.ok(
  multipartPart1Bytes.length + multipartPart2Bytes.length > 0xffff,
  "multipart integration source must exceed one 65,535-byte part",
);
assert.equal(
  Buffer.from(multipartRootBytes).toString("ascii"),
  '%INCLUDE "PART1.ASM"\r\n%INCLUDE "PART2.ASM"\r\n',
);
const multipartAtomExecution = runCommand(
  "ATOM BUILD.ASM MULTI.COM",
  "ATOM BUILD.ASM MULTI.COM\r\r\n\r\nMULTI.COM written\r\n\r\nA>",
  20_000_000,
);
assert.deepEqual(multipartAtomExecution, {
  instructions: 16686554,
  tStates: 161621679,
});
const multipartOutputFile = readCpm22File(
  platform.disk.exportImage(),
  "MULTI.COM",
);
assert.ok(
  multipartOutputFile,
  "native Atom did not publish MULTI.COM from the 66,000-byte include graph",
);
assert.deepEqual(
  multipartOutputFile.bytes.slice(0, expectedOutput.length),
  expectedOutput,
);
runCommand("MULTI", "MULTI\r\r\nHello from native Atom\r\n\r\nA>");
const rejectedNucleusExecution = runCommand(
  "NUCLEUS INPUT.NU KEEP.COM",
  "NUCLEUS INPUT.NU KEEP.COM\r\r\n\r\nNucleus host error 61\r\n\r\nA>",
);
assert.deepEqual(rejectedNucleusExecution, {
  instructions: 98155,
  tStates: 1347814,
});
assert.deepEqual(
  readCpm22File(platform.disk.exportImage(), "KEEP.COM")?.bytes.slice(
    0,
    oldKeepProgram.length,
  ),
  oldKeepProgram,
);
assert.deepEqual(
  readCpm22File(platform.disk.exportImage(), "KEEP.$$$")?.bytes.slice(
    0,
    reservedKeepTemporary.length,
  ),
  reservedKeepTemporary,
);
const nucleusExecution = runCommand("NUCLEUS", "NUCLEUS\r\r\n\r\nA>");
assert.deepEqual(nucleusExecution, {
  instructions: 330838,
  tStates: 4673329,
});
const nucleusOutputFile = readCpm22File(
  platform.disk.exportImage(),
  "OUTPUT.COM",
);
assert.ok(nucleusOutputFile, "native Nucleus did not publish OUTPUT.COM");
assert.equal(nucleusOutputFile.bytes[0], 0xcd);
assert.equal(nucleusOutputFile.bytes[0x0700], 0xc3);
const nucleusProgramBdosStart = bdosCalls.length;
const nucleusProgramExecution = runCommand("OUTPUT", "OUTPUT\r\r\nOK\r\nA>");
assert.deepEqual(nucleusProgramExecution, {
  instructions: 98478,
  tStates: 1443506,
});
assert.equal(
  bdosCalls.slice(nucleusProgramBdosStart).filter(
    (call) =>
      call.function === 2 &&
      call.returnAddress >= 0x0100 &&
      call.returnAddress < 0x0800,
  ).length,
  2,
  "generated Nucleus console output must enter public BDOS twice",
);

const originalNucleusSource = logicalCpmBytes(
  readCpm22File(sourceDiskImage, "INPUT.NU"),
  "INPUT.NU",
);
const editorInstructionStart = instructions;
const editorTStateStart = tStates;
const editorOutputStart = output.length;
platform.terminal.enqueueInput(Buffer.from("EDIT\r", "ascii"));
stepUntil(() => {
  const snapshot = platform.terminal.snapshot();
  return (
    terminalRow(23).includes("^S Save  ^Q Quit") &&
    snapshot.cursorRow === 0 &&
    snapshot.cursorColumn === 0
  );
}, "EDIT initial screen");
assert.equal(
  terminalRow(0),
  "sub main() fails".padEnd(80),
  "EDIT must render the first source line",
);
assert.equal(
  terminalRow(1),
  "    writeOutputByte('O') else fail".padEnd(80),
  "EDIT must render the second source line",
);
assert.equal(
  terminalRow(23),
  "EDIT INPUT   .NU       ^S Save  ^Q Quit".padEnd(80),
  "EDIT must render its exact status row",
);
assert.ok(
  platform.terminal
    .snapshot()
    .attributes.slice(23 * 80, 24 * 80)
    .every((attribute) => attribute === CPM22_TERMINAL_ATTR_REVERSE),
  "EDIT must render the complete status row in reverse video",
);

platform.terminal.enqueueInput([0x06]);
stepUntil(() => {
  const snapshot = platform.terminal.snapshot();
  return (
    terminalRow(23) === "Find: ".padEnd(80) &&
    snapshot.cursorRow === 23 &&
    snapshot.cursorColumn === 6
  );
}, "EDIT search prompt");
assert.ok(
  platform.terminal
    .snapshot()
    .attributes.slice(23 * 80, 24 * 80)
    .every((attribute) => attribute === CPM22_TERMINAL_ATTR_REVERSE),
  "EDIT must render the complete search row in reverse video",
);
platform.terminal.enqueueInput([0x73, 0x75, 0x62, 0x0d]);
stepUntil(() => {
  const snapshot = platform.terminal.snapshot();
  return (
    terminalRow(23).includes("Found") &&
    snapshot.cursorRow === 0 &&
    snapshot.cursorColumn === 0
  );
}, "EDIT forward search");

platform.terminal.enqueueInput([0x12]);
stepUntil(() => {
  const snapshot = platform.terminal.snapshot();
  return (
    terminalRow(23) === "Replace: ".padEnd(80) &&
    snapshot.cursorRow === 23 &&
    snapshot.cursorColumn === 9
  );
}, "EDIT replacement prompt");
assert.ok(
  platform.terminal
    .snapshot()
    .attributes.slice(23 * 80, 24 * 80)
    .every((attribute) => attribute === CPM22_TERMINAL_ATTR_REVERSE),
  "EDIT must render the complete replacement row in reverse video",
);
platform.terminal.enqueueInput([0x53, 0x55, 0x42, 0x0d]);
stepUntil(() => {
  const snapshot = platform.terminal.snapshot();
  return (
    terminalRow(23).includes("Replaced") &&
    snapshot.cursorRow === 0 &&
    snapshot.cursorColumn === 0
  );
}, "EDIT literal replacement");

// After replacing the selected literal at byte zero, insert XY, erase Y with
// backspace, insert Z, move left, delete Z, save, and quit. Queuing the complete
// edit sequence also proves editor control keys are not consumed as CP/M
// cooked-console flow control during full repaints.
platform.terminal.enqueueInput([
  0x58, 0x59, 0x08, 0x5a, 0x1b, 0x5b, 0x44, 0x7f, 0x13, 0x11,
]);
stepUntil(
  () => transcript(editorOutputStart).endsWith("\r\nA>"),
  "EDIT save and quit",
  10_000_000,
);
const editorExecution = {
  instructions: instructions - editorInstructionStart,
  tStates: tStates - editorTStateStart,
};
assert.deepEqual(editorExecution, {
  instructions: 373986,
  tStates: 3680840,
});
const editedNucleusSource = logicalCpmBytes(
  readCpm22File(platform.disk.exportImage(), "INPUT.NU"),
  "edited INPUT.NU",
);
const replacedNucleusSource = Uint8Array.from(originalNucleusSource);
replacedNucleusSource.set(Buffer.from("SUB", "ascii"), 0);
assert.deepEqual(
  editedNucleusSource,
  Uint8Array.from([0x58, ...replacedNucleusSource]),
  "EDIT must publish exactly the retained replacement and insertion",
);
assert.equal(
  readCpm22File(platform.disk.exportImage(), "INPUT.$$$"),
  undefined,
  "successful EDIT save must remove its temporary file",
);
assert.equal(
  readCpm22File(platform.disk.exportImage(), "INPUT.BAK"),
  undefined,
  "successful EDIT save must remove its backup file",
);

const newDiscardInstructionStart = instructions;
const newDiscardTStateStart = tStates;
const newDiscardOutputStart = output.length;
platform.terminal.enqueueInput(Buffer.from("EDIT THROW.NU\r", "ascii"));
stepUntil(() => {
  const snapshot = platform.terminal.snapshot();
  return (
    terminalRow(23).includes("^S Save  ^Q Quit") &&
    snapshot.cursorRow === 0 &&
    snapshot.cursorColumn === 0
  );
}, "EDIT new discard initial screen");
assert.equal(
  terminalRow(23),
  "EDIT THROW   .NU  *    ^S Save  ^Q Quit".padEnd(80),
  "EDIT must show an absent explicit name as a dirty empty buffer",
);
platform.terminal.enqueueInput([0x11, 0x11]);
stepUntil(
  () => transcript(newDiscardOutputStart).endsWith("\r\nA>"),
  "EDIT new discard",
);
const newDiscardExecution = {
  instructions: instructions - newDiscardInstructionStart,
  tStates: tStates - newDiscardTStateStart,
};
assert.deepEqual(newDiscardExecution, {
  instructions: 52244,
  tStates: 559122,
});
assert.equal(
  readCpm22File(platform.disk.exportImage(), "THROW.NU"),
  undefined,
  "discarding a new buffer must not create a directory entry",
);

const newCreateInstructionStart = instructions;
const newCreateTStateStart = tStates;
const newCreateOutputStart = output.length;
platform.terminal.enqueueInput(Buffer.from("EDIT CREATED.NU\r", "ascii"));
stepUntil(() => {
  const snapshot = platform.terminal.snapshot();
  return (
    terminalRow(23).includes("^S Save  ^Q Quit") &&
    snapshot.cursorRow === 0 &&
    snapshot.cursorColumn === 0
  );
}, "EDIT new create initial screen");
assert.equal(
  terminalRow(23),
  "EDIT CREATED .NU  *    ^S Save  ^Q Quit".padEnd(80),
  "EDIT must render the selected new filename exactly",
);
platform.terminal.enqueueInput([0x58, 0x13, 0x11]);
stepUntil(
  () => transcript(newCreateOutputStart).endsWith("\r\nA>"),
  "EDIT new create save and quit",
  10_000_000,
);
const newCreateExecution = {
  instructions: instructions - newCreateInstructionStart,
  tStates: tStates - newCreateTStateStart,
};
assert.deepEqual(newCreateExecution, {
  instructions: 113476,
  tStates: 1144430,
});
assert.deepEqual(
  logicalCpmBytes(
    readCpm22File(platform.disk.exportImage(), "CREATED.NU"),
    "CREATED.NU",
  ),
  Uint8Array.of(0x58),
  "EDIT must publish the exact first saved content",
);
assert.equal(
  readCpm22File(platform.disk.exportImage(), "CREATED.$$$"),
  undefined,
  "new-file save must remove its temporary file",
);
assert.equal(
  readCpm22File(platform.disk.exportImage(), "CREATED.BAK"),
  undefined,
  "new-file save must not leave a backup file",
);
assert.notDeepEqual(
  platform.disk.exportImage(),
  diskImage,
  "SMOKE must persist its file to disk",
);
assert.deepEqual(
  new Uint8Array(await readFile(join(romDirectory, "cpm22.img"))),
  sourceDiskImage,
  "session injection and guest writes must not change the bundled disk",
);
assert.equal(
  cpu.getRegisters().sp,
  0xef3b,
  "CCP prompt stack should return to its stable depth",
);

console.log(
  `CP/M 2.2 acceptance passed: boot, BIOS breakpoint, .COM injection, DIR, execution, TYPE, SMOKE, native Atom defaults (${atomExecution.instructions} instructions, ${atomExecution.tStates} T-states), named files (${namedAtomExecution.instructions} instructions, ${namedAtomExecution.tStates} T-states), 16.5 KiB source (${largeAtomExecution.instructions} instructions, ${largeAtomExecution.tStates} T-states), 66,000-byte multipart source (${multipartAtomExecution.instructions} instructions, ${multipartAtomExecution.tStates} T-states), Nucleus rejected transaction (${rejectedNucleusExecution.instructions} instructions, ${rejectedNucleusExecution.tStates} T-states), native Nucleus compile (${nucleusExecution.instructions} instructions, ${nucleusExecution.tStates} T-states), generated program (${nucleusProgramExecution.instructions} instructions, ${nucleusProgramExecution.tStates} T-states), native editor (${editorExecution.instructions} instructions, ${editorExecution.tStates} T-states), new editor discard (${newDiscardExecution.instructions} instructions, ${newDiscardExecution.tStates} T-states), new editor create (${newCreateExecution.instructions} instructions, ${newCreateExecution.tStates} T-states), warm boot`,
);
