import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { installCpm22File } from "@jhlagado/debug80-runtime/platforms/cpm22/filesystem";
import {
  assembleConvertedWithAtom,
  assembleProjectOwnedAtomArtifacts,
  assembleProjectOwnedWithAtom,
  converted8080Candidates,
  projectOwnedCandidates,
} from "./atom-projection.mjs";
import { compileAzmStrictSidecar } from "./azm-strict-sidecar.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..", "..");
const outputDirectory = join(
  repositoryRoot,
  "apps",
  "debug80-vscode",
  "roms",
  "cpm22",
);
const thirdPartyDirectory = join(repositoryRoot, "third_party", "cpm22");
const atomDirectory = join(repositoryRoot, "packages", "atom");
const nucleusDirectory = join(repositoryRoot, "third_party", "nucleus");
const converter = join(scriptDirectory, "convert-8080-to-z80.mjs");

const diskBytes = 77 * 26 * 128;
const systemBytes = 52 * 128;

function fail(message) {
  throw new Error(message);
}

async function assemble(
  source,
  includeDebugMap = false,
  registerContracts = "off",
  registerContractsInterfaces = [],
) {
  return compileAzmStrictSidecar({
    label: source,
    source,
    emitD8m: includeDebugMap,
    registerContracts,
    registerContractsInterfaces,
  });
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
    const [atom, atomSource, atomCensus, nucleus, nucleusProvenance] =
      await Promise.all([
        readFile(join(atomDirectory, "assets", "atom-cpm22.com")),
        readFile(join(scriptDirectory, "atom-example.asm")),
        readFile(
          join(atomDirectory, "proofs", "cpm22-census.json"),
          "utf8",
        ).then(JSON.parse),
        readFile(join(nucleusDirectory, "NUC.COM")),
        readFile(join(nucleusDirectory, "PROVENANCE.json"), "utf8").then(
          JSON.parse,
        ),
      ]);
    if (
      sha256(atom) !== atomCensus.sha256 ||
      atom.length !== atomCensus.residentBytes
    ) {
      fail("Atom CP/M artifact differs from its measured census");
    }
    if (
      sha256(nucleus) !== nucleusProvenance.artifactSha256 ||
      nucleus.length !== nucleusProvenance.artifactBytes
    ) {
      fail("vendored Nucleus CP/M artifact differs from its provenance record");
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
    const convertedCcp = join(temporaryDirectory, "ccp.asm");
    const convertedBdos = join(temporaryDirectory, "bdos.asm");
    for (const [input, output, origin] of [
      ["ccp.asm", convertedCcp, "$E400"],
      ["bdos.asm", convertedBdos, "$EC00"],
    ]) {
      const converted = spawnSync(
        process.execPath,
        [converter, join(thirdPartyDirectory, input), output, origin],
        {
          cwd: repositoryRoot,
          encoding: "utf8",
        },
      );
      if (converted.status !== 0)
        fail(
          converted.stderr ||
            converted.stdout ||
            `conversion failed for ${input}`,
        );
    }

    const [bootstrapAzm, ccpAzm, bdosAzm, biosAzm, smokeAzm, editorAzm] =
      await Promise.all([
        assemble(join(outputDirectory, "bootstrap.asm")),
        assemble(convertedCcp),
        assemble(convertedBdos),
        assemble(join(outputDirectory, "bios.asm"), true),
        assemble(join(outputDirectory, "smoke.asm")),
        assemble(join(outputDirectory, "editor.asm"), true, "strict", [
          join(outputDirectory, "editor-bdos.asmi"),
        ]),
      ]);
    const convertedByName = new Map(
      converted8080Candidates.map((candidate) => [candidate.name, candidate]),
    );
    const projectOwnedByName = new Map(
      projectOwnedCandidates.map((candidate) => [candidate.name, candidate]),
    );
    const withDebugMap = (assembled, debugSource) => ({
      bytes: assembled,
      debugMap: debugSource.debugMap,
    });
    const [bootstrap, ccp, bdos, bios, smoke, editor] = await Promise.all([
      assembleProjectOwnedWithAtom({
        outputDirectory,
        temporaryDirectory,
        candidate: projectOwnedByName.get("bootstrap.asm"),
        azmBytes: bootstrapAzm.bytes,
      }).then((bytes) => withDebugMap(bytes, bootstrapAzm)),
      assembleConvertedWithAtom({
        repositoryRoot,
        thirdPartyDirectory,
        converter,
        temporaryDirectory,
        candidate: convertedByName.get("ccp"),
        azmBytes: ccpAzm.bytes,
      }).then((bytes) => withDebugMap(bytes, ccpAzm)),
      assembleConvertedWithAtom({
        repositoryRoot,
        thirdPartyDirectory,
        converter,
        temporaryDirectory,
        candidate: convertedByName.get("bdos"),
        azmBytes: bdosAzm.bytes,
      }).then((bytes) => withDebugMap(bytes, bdosAzm)),
      assembleProjectOwnedAtomArtifacts({
        outputDirectory,
        temporaryDirectory,
        candidate: projectOwnedByName.get("bios.asm"),
        azmBytes: biosAzm.bytes,
        base: 0xfa00,
        entryAddress: 0xfa00,
      }),
      assembleProjectOwnedWithAtom({
        outputDirectory,
        temporaryDirectory,
        candidate: projectOwnedByName.get("smoke.asm"),
        azmBytes: smokeAzm.bytes,
      }).then((bytes) => withDebugMap(bytes, smokeAzm)),
      assembleProjectOwnedAtomArtifacts({
        outputDirectory,
        temporaryDirectory,
        candidate: projectOwnedByName.get("editor.asm"),
        azmBytes: editorAzm.bytes,
        base: 0x0100,
        entryAddress: 0x0100,
      }),
    ]);

    if (bootstrap.bytes.length !== 256)
      fail(`bootstrap must be 256 bytes, got ${bootstrap.bytes.length}`);
    if (bios.bytes.length !== 1024)
      fail(`BIOS must be 1024 bytes, got ${bios.bytes.length}`);
    if (smoke.bytes.length !== 256)
      fail(`SMOKE.COM must be 256 bytes, got ${smoke.bytes.length}`);
    if (editor.bytes.length > 0x1d00)
      fail(`EDIT.COM is ${editor.bytes.length} bytes; maximum is 7424`);

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
    image = installCpm22File(image, "EDIT.COM", editor.bytes);

    await writeFile(join(outputDirectory, "bootstrap.bin"), bootstrap.bytes);
    await writeFile(join(outputDirectory, "cpm22.img"), image);
    if (bios.debugMap === undefined)
      fail("Atom did not emit the BIOS debug map");
    const biosMapBytes = Buffer.from(
      `${JSON.stringify(bios.debugMap, undefined, 2)}\n`,
      "utf8",
    );
    await writeFile(join(outputDirectory, "bios.d8m.json"), biosMapBytes);

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
      editor: sha256(editor.bytes),
      atomSource: sha256(atomSource),
      nucleusSource: sha256(nucleusSource),
      largeAtomSource: sha256(largeAtomSource),
      multipartPart1: sha256(multipartPart1),
      multipartPart2: sha256(multipartPart2),
      multipartRoot: sha256(multipartRoot),
      disk: sha256(image),
      biosMap: sha256(biosMapBytes),
    };
    if (
      Object.entries(actual).some(([name, hash]) => expected[name] !== hash)
    ) {
      fail(
        `generated CP/M artifacts do not match the frozen hashes:\n${JSON.stringify(actual, undefined, 2)}`,
      );
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

await main();
