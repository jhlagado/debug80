import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { compile, defaultFormatWriters } from "@jhlagado/azm/compile";
import { installCpm22File } from "@jhlagado/debug80-runtime/platforms/cpm22/filesystem";

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
const atomDirectory = join(repositoryRoot, "third_party", "atom");
const converter = join(scriptDirectory, "convert-8080-to-z80.mjs");

const diskBytes = 77 * 26 * 128;
const systemBytes = 52 * 128;

function fail(message) {
  throw new Error(message);
}

async function assemble(source, includeDebugMap = false) {
  const result = await compile(
    source,
    {
      emitBin: true,
      emitHex: false,
      emitD8m: includeDebugMap,
      emitLst: false,
      emitAsm80: false,
      registerContracts: "off",
    },
    { formats: defaultFormatWriters },
  );
  const errors = result.diagnostics.filter(
    (diagnostic) => diagnostic.severity === "error",
  );
  if (errors.length !== 0) {
    fail(
      errors
        .map(
          (diagnostic) =>
            `${diagnostic.sourceName}:${diagnostic.line}:${diagnostic.column}: ${diagnostic.message}`,
        )
        .join("\n"),
    );
  }
  const binary = result.artifacts.find((artifact) => artifact.kind === "bin");
  if (binary?.kind !== "bin") fail(`AZM did not emit a binary for ${source}`);
  const debugMap = result.artifacts.find((artifact) => artifact.kind === "d8m");
  return {
    bytes: binary.bytes,
    debugMap: debugMap?.kind === "d8m" ? debugMap.json : undefined,
  };
}

function copyExact(destination, offset, source, maximum, label) {
  if (source.length > maximum)
    fail(`${label} is ${source.length} bytes; maximum is ${maximum}`);
  destination.set(source, offset);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function main() {
  const temporaryDirectory = await mkdtemp(
    join(tmpdir(), "debug80-cpm22-build-"),
  );
  try {
    const [atom, atomSource, atomProvenance] = await Promise.all([
      readFile(join(atomDirectory, "ATOM.COM")),
      readFile(join(scriptDirectory, "atom-example.asm")),
      readFile(join(atomDirectory, "PROVENANCE.json"), "utf8").then(JSON.parse),
    ]);
    if (
      sha256(atom) !== atomProvenance.artifactSha256 ||
      atom.length !== atomProvenance.artifactBytes
    ) {
      fail("vendored Atom CP/M artifact differs from its provenance record");
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

    const [bootstrap, ccp, bdos, bios, smoke] = await Promise.all([
      assemble(join(outputDirectory, "bootstrap.asm")),
      assemble(convertedCcp),
      assemble(convertedBdos),
      assemble(join(outputDirectory, "bios.asm"), true),
      assemble(join(outputDirectory, "smoke.asm")),
    ]);

    if (bootstrap.bytes.length !== 256)
      fail(`bootstrap must be 256 bytes, got ${bootstrap.bytes.length}`);
    if (bios.bytes.length !== 1024)
      fail(`BIOS must be 1024 bytes, got ${bios.bytes.length}`);
    if (smoke.bytes.length !== 256)
      fail(`SMOKE.COM must be 256 bytes, got ${smoke.bytes.length}`);

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

    await writeFile(join(outputDirectory, "bootstrap.bin"), bootstrap.bytes);
    await writeFile(join(outputDirectory, "cpm22.img"), image);
    if (bios.debugMap === undefined)
      fail("AZM did not emit the BIOS debug map");
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
      atomSource: sha256(atomSource),
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
