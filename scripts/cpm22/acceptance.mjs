import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createCpm22PlatformRuntime } from "@jhlagado/debug80-runtime/platforms/cpm22/runtime";
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
const diskImage = installCpm22File(sourceDiskImage, "MAIN.COM", mainProgram);
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

function transcript(from = 0) {
  return Buffer.from(output.slice(from)).toString("latin1");
}

function stepUntil(predicate, description, maximum = 5_000_000) {
  for (let count = 1; count <= maximum; count += 1) {
    const step = cpu.step();
    instructions += 1;
    tStates += step.cycles ?? 0;
    if (predicate()) return count;
  }
  throw new Error(
    `timed out waiting for ${description}; transcript=${JSON.stringify(transcript())}`,
  );
}

function runCommand(command, expected) {
  const instructionStart = instructions;
  const tStateStart = tStates;
  const start = output.length;
  platform.terminal.enqueueInput(Buffer.from(`${command}\r`, "ascii"));
  stepUntil(() => transcript(start).endsWith("\r\nA>"), `${command} prompt`);
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
  "DIR\r\r\nA: README   TXT : SMOKE    COM : ATOM     COM : INPUT    ASM\r\nA: HELLO    ASM : LARGE    ASM : MAIN     COM\r\nA>",
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
assert.deepEqual(atomExecution, { instructions: 134186, tStates: 1968402 });
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
  instructions: 139810,
  tStates: 2016228,
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
  instructions: 1915556,
  tStates: 19329617,
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
  `CP/M 2.2 acceptance passed: boot, BIOS breakpoint, .COM injection, DIR, execution, TYPE, SMOKE, native Atom defaults (${atomExecution.instructions} instructions, ${atomExecution.tStates} T-states), named files (${namedAtomExecution.instructions} instructions, ${namedAtomExecution.tStates} T-states), 16.5 KiB source (${largeAtomExecution.instructions} instructions, ${largeAtomExecution.tStates} T-states), warm boot`,
);
