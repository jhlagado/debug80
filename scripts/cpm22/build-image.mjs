import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { compile, defaultFormatWriters } from "@jhlagado/azm/compile";
import { installCpm22File } from "@jhlagado/debug80-runtime/platforms/cpm22/filesystem";
import {
  assembleAtomProject,
  materializeAtomGeneration,
  translateAzmSourceToAtom,
} from "../../packages/atom/src/host/index.mjs";

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
  const result = await compile(
    source,
    {
      emitBin: true,
      emitHex: false,
      emitD8m: includeDebugMap,
      emitLst: false,
      emitAsm80: false,
      registerContracts,
      registerContractsInterfaces,
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

function parseFixedNumber(text) {
  const value = text.trim();
  if (/^\$[0-9a-f]+$/i.test(value)) return Number.parseInt(value.slice(1), 16);
  if (/^[0-9a-f]+h$/i.test(value)) return Number.parseInt(value.slice(0, -1), 16);
  if (/^[0-9]+$/.test(value)) return Number.parseInt(value, 10);
  fail(`unsupported fixed numeric value ${text}`);
}

function hexWord(value) {
  return `$${value.toString(16).toUpperCase().padStart(4, "0")}`;
}

function rewriteCodeOutsideText(line, rewrite) {
  let output = "";
  let segment = "";
  let quote = "";
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quote !== "") {
      output += character;
      if (character === quote) quote = "";
      continue;
    }
    if (character === ";") return `${output}${rewrite(segment)}${line.slice(index)}`;
    if (character === '"' || character === "'") {
      output += rewrite(segment);
      segment = "";
      quote = character;
      output += character;
      continue;
    }
    segment += character;
  }
  return `${output}${rewrite(segment)}`;
}

function codeIdentifierWords(source) {
  const words = new Set();
  for (const line of source.split(/\r\n|\n|\r/)) {
    rewriteCodeOutsideText(line, (code) => {
      for (const match of code.matchAll(/\b[A-Za-z_][A-Za-z0-9_]*\b/g)) {
        words.add(match[0]);
      }
      return code;
    });
  }
  return [...words];
}

function shortSymbolCandidate(word, index) {
  const compact = word.replace(/_/g, "").toUpperCase();
  if (index === 0 && compact.length <= 8) return compact;
  if (index === 0) return compact.slice(0, 8);
  const suffix = index.toString(36).toUpperCase();
  return `${compact.slice(0, 8 - suffix.length)}${suffix}`;
}

function projectShortSymbols(source, label) {
  const words = codeIdentifierWords(source);
  const occupied = new Set(
    words.filter((word) => word.length <= 8).map((word) => word.toUpperCase()),
  );
  const replacements = new Map();
  for (const word of words
    .filter((candidate) => candidate.length > 8)
    .sort((left, right) => left.localeCompare(right))) {
    let replacement = "";
    for (let index = 0; index < 256; index += 1) {
      const candidate = shortSymbolCandidate(word, index);
      if (/^[A-Z_][A-Z0-9_]*$/.test(candidate) && !occupied.has(candidate)) {
        replacement = candidate;
        break;
      }
    }
    if (replacement === "") fail(`${label}: could not shorten symbol ${word}`);
    occupied.add(replacement);
    replacements.set(word, replacement);
  }
  return source
    .split(/\r\n|\n|\r/)
    .map((line) =>
      rewriteCodeOutsideText(line, (code) =>
        code.replace(/\b[A-Za-z_][A-Za-z0-9_]*\b/g, (word) => {
          const direct = replacements.get(word);
          if (direct !== undefined) return direct;
          const folded = [...replacements.entries()].find(
            ([original]) => original.toUpperCase() === word.toUpperCase(),
          );
          return folded?.[1] ?? word;
        }),
      ),
    )
    .join("\n");
}

function projectConvertedStorageAliases(source) {
  return source
    .split(/\r\n|\n|\r/)
    .map((line) =>
      rewriteCodeOutsideText(line, (code) =>
        code
          .replace(/\bDS\s+byte\b/gi, "DS 1")
          .replace(/\bDS\s+word\b/gi, "DS 2")
          .replace(/\(~fwfmsk\)&0ffh/gi, "$7F"),
      ),
    )
    .join("\n");
}

function projectBdosBiosEqu(source, originText, azmBytes) {
  const finalCursor = parseFixedNumber(originText) + azmBytes.length;
  const biosAddress = (finalCursor & 0xff00) + 0x100;
  let inserted = false;
  let removed = false;
  const projected = source
    .split(/\r\n|\n|\r/)
    .map((line) => {
      if (!inserted && /^\s*bootf\s+EQU\s+bios\+3\*0\b/i.test(line)) {
        inserted = true;
        return `bios EQU ${hexWord(biosAddress)}; projected from final BDOS extent\n${line}`;
      }
      if (/^\s*bios\s+EQU\s+\(\$\s*&\s*0ff00h\)\+100h\b/i.test(line)) {
        removed = true;
        return `; projected ${line.trim()}`;
      }
      return line;
    })
    .join("\n");
  if (!inserted || !removed) fail("BDOS BIOS extent projection failed");
  return projected;
}

function assembleRange(generation, start, end) {
  const bytes = new Uint8Array(end - start + 1);
  for (const operation of [...generation.images, ...generation.patches]) {
    operation.bytes.forEach((byte, index) => {
      const address = operation.address + index;
      if (address >= start && address <= end) bytes[address - start] = byte;
    });
  }
  return bytes;
}

async function assembleAtomSource(root, entry, { start, length } = {}) {
  const result = await assembleAtomProject({
    root,
    entry,
    target: { start: 0, capacity: 0xffff },
    maxInstructions: 50_000_000,
    maxCycles: 500_000_000,
  });
  if (start !== undefined && length !== undefined) {
    return assembleRange(result.generation, start, start + length - 1);
  }
  const base = result.generation.images.reduce(
    (minimum, image) => Math.min(minimum, image.address),
    0xffff,
  );
  return materializeAtomGeneration(result.generation, { base }).bytes;
}

function requireByteIdentity(label, expected, actual) {
  if (
    expected.length !== actual.length ||
    expected.some((byte, index) => byte !== actual[index])
  ) {
    fail(`${label}: Atom output differs from AZM output`);
  }
}

async function expandProjectTextualIncludes(name, includeStack = []) {
  const source = await readFile(join(outputDirectory, name), "utf8");
  const lines = [];
  for (const line of source.split(/\r\n|\n|\r/)) {
    const include = /^\s*\.include\s+"([^"]+)"\s*(?:;.*)?$/i.exec(line);
    if (include === null) {
      lines.push(line);
      continue;
    }
    if (includeStack.includes(include[1])) {
      fail(`${name}: textual include cycle ${[...includeStack, include[1]].join(" -> ")}`);
    }
    lines.push(await expandProjectTextualIncludes(include[1], [...includeStack, include[1]]));
  }
  return lines.join("\n");
}

function projectOutputRangeDirective(source) {
  return source
    .split(/\r\n|\n|\r/)
    .map((line) =>
      rewriteCodeOutsideText(line, (code) =>
        code.replace(
          /^(\s*)\.binto\s+(.+?)\s*$/i,
          (_match, indent, end) => `${indent};@AZM-BINTO ${end.trim()}`,
        ),
      ),
    )
    .join("\n");
}

function bintoEnd(source) {
  const match = /^\s*\.binto\s+(\$[0-9A-Fa-f]+|[0-9]+[Hh]|[0-9]+)\s*$/im.exec(source);
  return match === null ? undefined : parseFixedNumber(match[1]);
}

function orgStart(source) {
  const match = /^\s*\.org\s+(\$[0-9A-Fa-f]+|[0-9]+[Hh]|[0-9]+)\s*$/im.exec(source);
  return match === null ? undefined : parseFixedNumber(match[1]);
}

async function assembleProjectOwnedWithAtom(temporaryDirectory, name, azmResult) {
  const original = await readFile(join(outputDirectory, name), "utf8");
  const expanded = name === "editor.asm"
    ? await expandProjectTextualIncludes(name, [name])
    : original;
  const projected = projectShortSymbols(projectOutputRangeDirective(expanded), name);
  const atomSource = translateAzmSourceToAtom(projected, { sourceName: name });
  await writeFile(join(temporaryDirectory, name), atomSource, "utf8");
  const start = orgStart(original);
  const end = bintoEnd(original);
  const atomBytes = start === undefined || end === undefined
    ? await assembleAtomSource(temporaryDirectory, name)
    : await assembleAtomSource(temporaryDirectory, name, {
        start,
        length: end - start + 1,
      });
  requireByteIdentity(name, azmResult.bytes, atomBytes);
  return { bytes: atomBytes, debugMap: azmResult.debugMap };
}

async function assembleConvertedWithAtom(
  temporaryDirectory,
  name,
  input,
  origin,
  azmResult,
) {
  const atomSource = join(temporaryDirectory, `${name}.atom.asm`);
  const converted = spawnSync(
    process.execPath,
    [converter, join(thirdPartyDirectory, input), atomSource, origin, "atom"],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  if (converted.status !== 0) {
    fail(converted.stderr || converted.stdout || `Atom conversion failed for ${input}`);
  }
  let projected = await readFile(atomSource, "utf8");
  if (name === "bdos") projected = projectBdosBiosEqu(projected, origin, azmResult.bytes);
  projected = projectShortSymbols(projectConvertedStorageAliases(projected), name);
  await writeFile(atomSource, projected, "utf8");
  const start = parseFixedNumber(origin);
  const atomBytes = await assembleAtomSource(temporaryDirectory, `${name}.atom.asm`, {
    start,
    length: azmResult.bytes.length,
  });
  requireByteIdentity(name, azmResult.bytes, atomBytes);
  return { bytes: atomBytes, debugMap: azmResult.debugMap };
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
        readFile(join(atomDirectory, "proofs", "cpm22-census.json"), "utf8").then(
          JSON.parse,
        ),
        readFile(join(nucleusDirectory, "NUCLEUS.COM")),
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

    const [
      bootstrapAzm,
      ccpAzm,
      bdosAzm,
      biosAzm,
      smokeAzm,
      editorAzm,
    ] = await Promise.all([
      assemble(join(outputDirectory, "bootstrap.asm")),
      assemble(convertedCcp),
      assemble(convertedBdos),
      assemble(join(outputDirectory, "bios.asm"), true),
      assemble(join(outputDirectory, "smoke.asm")),
      assemble(join(outputDirectory, "editor.asm"), true, "strict", [
        join(outputDirectory, "editor-bdos.asmi"),
      ]),
    ]);
    const [bootstrap, ccp, bdos, bios, smoke, editor] = await Promise.all([
      assembleProjectOwnedWithAtom(temporaryDirectory, "bootstrap.asm", bootstrapAzm),
      assembleConvertedWithAtom(
        temporaryDirectory,
        "ccp",
        "ccp.asm",
        "$E400",
        ccpAzm,
      ),
      assembleConvertedWithAtom(
        temporaryDirectory,
        "bdos",
        "bdos.asm",
        "$EC00",
        bdosAzm,
      ),
      assembleProjectOwnedWithAtom(temporaryDirectory, "bios.asm", biosAzm),
      assembleProjectOwnedWithAtom(temporaryDirectory, "smoke.asm", smokeAzm),
      assembleProjectOwnedWithAtom(temporaryDirectory, "editor.asm", editorAzm),
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
    image = installCpm22File(image, "NUCLEUS.COM", nucleus);
    image = installCpm22File(image, "INPUT.NU", nucleusSource);
    image = installCpm22File(image, "EDIT.COM", editor.bytes);

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
