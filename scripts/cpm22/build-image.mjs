import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { installCpm22File } from "@jhlagado/debug80-runtime/platforms/cpm22/filesystem";
import {
  assembleProjectOwnedAtomArtifacts,
  assembleProjectOwnedWithAtom,
  projectOwnedCandidates,
} from "./atom-projection.mjs";
import { readVerifiedEditRelease } from "./edit-release.mjs";
import { readVerifiedNucleusRelease } from "./nucleus-release.mjs";
import { readVerifiedPortableCpmRelease } from "./portable-cpm-release.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..", "..");
const outputDirectory = join(
  repositoryRoot,
  "apps",
  "debug80-vscode",
  "roms",
  "cpm22",
);
const atomImage = new URL(import.meta.resolve("atom-z80/cpm22/image"));
const atomMeasurement = new URL(import.meta.resolve("atom-z80/cpm22/census"));

const diskBytes = 77 * 26 * 128;

function fail(message) {
  throw new Error(message);
}

function copyExact(destination, offset, source, maximum, label) {
  if (source.length > maximum)
    fail(`${label} is ${source.length} bytes; maximum is ${maximum}`);
  destination.set(source, offset);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function padSource(prefix, suffix, byteLength, label) {
  const paddingBytes = byteLength - prefix.length - suffix.length;
  if (paddingBytes < 3) fail(`${label} has no room for comment padding`);
  const padding = Buffer.from(`;${"x".repeat(paddingBytes - 3)}\r\n`, "ascii");
  const source = Buffer.concat([prefix, padding, suffix]);
  if (source.length !== byteLength) {
    fail(`${label} must be ${byteLength} bytes, got ${source.length}`);
  }
  return source;
}

async function main() {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "debug80-cpm22-build-"),
  );
  try {
    const [atom, atomSource, atomCensus, nucleus, editor, portableCpm] =
      await Promise.all([
        readFile(atomImage),
        readFile(join(scriptDirectory, "atom-example.asm")),
        readFile(atomMeasurement, "utf8").then(JSON.parse),
        readVerifiedNucleusRelease(repositoryRoot),
        readVerifiedEditRelease(repositoryRoot),
        readVerifiedPortableCpmRelease(repositoryRoot),
      ]);
    if (
      sha256(atom) !== atomCensus.sha256 ||
      atom.length !== atomCensus.residentBytes
    ) {
      fail("Atom CP/M artifact differs from its measured census");
    }
    const nucleusSource = Buffer.from(
      [
        "sub main() fails",
        "    writeOutputByte('O') else fail",
        "    writeOutputByte('K') else fail",
        "end",
        "",
      ].join("\r\n"),
      "ascii",
    );
    const largeAtomSourceBytes = 16_535;
    const largePaddingBytes = largeAtomSourceBytes - atomSource.length;
    if (largePaddingBytes < 3)
      fail("Atom example is too large for the LARGE.ASM fixture");
    const largeAtomSource = Buffer.concat([
      Buffer.from(`;${"x".repeat(largePaddingBytes - 3)}\r\n`, "ascii"),
      atomSource,
    ]);
    if (largeAtomSource.length !== largeAtomSourceBytes) {
      fail(
        `LARGE.ASM must be ${largeAtomSourceBytes} bytes, got ${largeAtomSource.length}`,
      );
    }
    const multipartPartBytes = 33_000;
    const multipartPart1 = padSource(
      Buffer.from("ORG $100\r\nLD C,9\r\nLD DE,MESSAGE\r\n", "ascii"),
      Buffer.alloc(0),
      multipartPartBytes,
      "PART1.ASM",
    );
    const multipartPart2 = padSource(
      Buffer.alloc(0),
      Buffer.from(
        "CALL 5\r\nRET\r\nMESSAGE:\r\nDB 72,101,108,108,111,32,102,114,111,109,32,110,97,116,105,118,101,32,65,116,111,109,13,10,36\r\n",
        "ascii",
      ),
      multipartPartBytes,
      "PART2.ASM",
    );
    const multipartRoot = Buffer.from(
      '%INCLUDE "PART1.ASM"\r\n%INCLUDE "PART2.ASM"\r\n',
      "ascii",
    );
    if (multipartPart1.length + multipartPart2.length <= 0xffff) {
      fail("multipart fixture must exceed one 65,535-byte source part");
    }
    const { ccp, bdos } = portableCpm;
    const projectOwnedByName = new Map(
      projectOwnedCandidates.map((candidate) => [candidate.name, candidate]),
    );
    const [bootstrap, bios, smoke] = await Promise.all([
      assembleProjectOwnedWithAtom({
        outputDirectory,
        temporaryDirectory,
        candidate: projectOwnedByName.get("bootstrap.asm"),
      }).then((bytes) => ({ bytes })),
      assembleProjectOwnedAtomArtifacts({
        outputDirectory,
        temporaryDirectory,
        candidate: projectOwnedByName.get("bios.asm"),
        base: 0xfa00,
        entryAddress: 0xfa00,
      }),
      assembleProjectOwnedWithAtom({
        outputDirectory,
        temporaryDirectory,
        candidate: projectOwnedByName.get("smoke.asm"),
      }).then((bytes) => ({ bytes })),
    ]);

    if (bootstrap.bytes.length !== 256)
      fail(`bootstrap must be 256 bytes, got ${bootstrap.bytes.length}`);
    if (bios.bytes.length !== 1024)
      fail(`BIOS must be 1024 bytes, got ${bios.bytes.length}`);
    if (smoke.bytes.length !== 256)
      fail(`SMOKE.COM must be 256 bytes, got ${smoke.bytes.length}`);
    if (editor.length > 0x1d00)
      fail(`EDIT.COM is ${editor.length} bytes; maximum is 7424`);

    let image = new Uint8Array(diskBytes).fill(0xe5);
    copyExact(image, 0x0000, ccp.bytes, 0x0800, "CCP");
    copyExact(image, 0x0800, bdos.bytes, 0x0e00, "BDOS");
    copyExact(image, 0x1600, bios.bytes, 0x0400, "BIOS");

    image = installCpm22File(
      image,
      "README.TXT",
      Buffer.from("Debug80 CP/M 2.2 platform\r\n", "ascii"),
    );
    image = installCpm22File(image, "SMOKE.COM", smoke.bytes);
    image = installCpm22File(image, "ATOM.COM", atom);
    image = installCpm22File(image, "INPUT.ASM", atomSource);
    image = installCpm22File(image, "HELLO.ASM", atomSource);
    image = installCpm22File(image, "LARGE.ASM", largeAtomSource);
    image = installCpm22File(image, "PART1.ASM", multipartPart1);
    image = installCpm22File(image, "PART2.ASM", multipartPart2);
    image = installCpm22File(image, "BUILD.ASM", multipartRoot);
    image = installCpm22File(image, "NUC.COM", nucleus);
    image = installCpm22File(image, "INPUT.NU", nucleusSource);
    image = installCpm22File(image, "EDIT.COM", editor);

    if (bios.debugMap === undefined)
      fail("Atom did not emit the BIOS debug map");
    const biosMapBytes = Buffer.from(
      `${JSON.stringify(bios.debugMap, undefined, 2)}\n`,
      "utf8",
    );

    const expected = JSON.parse(
      await readFile(join(scriptDirectory, "image-hashes.json"), "utf8"),
    );
    const actual = {
      bootstrap: sha256(bootstrap.bytes),
      ccp: sha256(ccp.bytes),
      bdos: sha256(bdos.bytes),
      bios: sha256(bios.bytes),
      smoke: sha256(smoke.bytes),
      atom: sha256(atom),
      nucleus: sha256(nucleus),
      editor: sha256(editor),
      atomSource: sha256(atomSource),
      nucleusSource: sha256(nucleusSource),
      largeAtomSource: sha256(largeAtomSource),
      multipartPart1: sha256(multipartPart1),
      multipartPart2: sha256(multipartPart2),
      multipartRoot: sha256(multipartRoot),
      disk: sha256(image),
      biosMap: sha256(biosMapBytes),
    };
    const mismatches = Object.keys(actual).filter(
      (name) => expected[name] !== actual[name],
    );
    if (process.argv.includes("--candidate")) {
      console.log(
        JSON.stringify(
          {
            status: "candidate-only",
            actual,
            mismatches,
            bytes: {
              bootstrap: bootstrap.bytes.length,
              ccp: ccp.bytes.length,
              bdos: bdos.bytes.length,
              bios: bios.bytes.length,
              smoke: smoke.bytes.length,
              atom: atom.length,
              nucleus: nucleus.length,
              editor: editor.length,
              disk: image.length,
              biosMap: biosMapBytes.length,
            },
          },
          null,
          2,
        ),
      );
      return;
    }
    if (mismatches.length !== 0) {
      fail(
        `generated CP/M artifacts do not match the frozen hashes:\n${JSON.stringify(actual, undefined, 2)}`,
      );
    }
    // Validate the complete candidate, including the map, before publishing anything.
    await writeFile(join(outputDirectory, "bootstrap.bin"), bootstrap.bytes);
    await writeFile(join(outputDirectory, "cpm22.img"), image);
    await writeFile(join(outputDirectory, "bios.d8m.json"), biosMapBytes);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

await main();
