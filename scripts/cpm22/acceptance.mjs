import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createCpm22PlatformRuntime } from "@jhlagado/debug80-runtime/platforms/cpm22/runtime";
import { installCpm22File } from "@jhlagado/debug80-runtime/platforms/cpm22/filesystem";
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

function transcript(from = 0) {
  return Buffer.from(output.slice(from)).toString("latin1");
}

function stepUntil(predicate, description, maximum = 5_000_000) {
  for (let count = 1; count <= maximum; count += 1) {
    cpu.step();
    if (predicate()) return count;
  }
  throw new Error(
    `timed out waiting for ${description}; transcript=${JSON.stringify(transcript())}`,
  );
}

function runCommand(command, expected) {
  const start = output.length;
  platform.terminal.enqueueInput(Buffer.from(`${command}\r`, "ascii"));
  stepUntil(() => transcript(start).endsWith("\r\nA>"), `${command} prompt`);
  assert.equal(transcript(start), expected);
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
  "DIR\r\r\nA: README   TXT : SMOKE    COM : MAIN     COM\r\nA>",
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
  "CP/M 2.2 acceptance passed: boot, BIOS breakpoint, .COM injection, DIR, execution, TYPE, SMOKE, warm boot",
);
