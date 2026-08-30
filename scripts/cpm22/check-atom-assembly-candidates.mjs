#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { compile } from "@jhlagado/azm/compile";

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
const converter = join(scriptDirectory, "convert-8080-to-z80.mjs");

const converted8080Candidates = Object.freeze([
  {
    name: "ccp",
    input: "ccp.asm",
    origin: "$E400",
    projection: "short-symbols",
  },
  {
    name: "bdos",
    input: "bdos.asm",
    origin: "$EC00",
    projection: "short-symbols",
  },
]);

const projectOwnedCandidates = Object.freeze([
  { name: "bootstrap.asm", projection: "small-symbols" },
  { name: "bios.asm", projection: "small-symbols" },
  { name: "smoke.asm", projection: "small-symbols" },
  "editor.asm",
]);

const expectedBlockers = Object.freeze({
  "editor.asm": "unsupported-directive",
});

const smallSourceSymbolMaps = Object.freeze({
  "bootstrap.asm": Object.freeze({
    BIOS_BASE: "BIOSBASE",
    BootError: "BOOTERR",
    CurrentSector: "CURSEC",
    CurrentTrack: "CURTRK",
    DISK_COMMAND_READ: "DISKRD",
    PORT_DISK_DATA: "PDATA",
    PORT_DISK_DRIVE: "PDRIVE",
    PORT_DISK_SECTOR: "PSECTOR",
    PORT_DISK_STATUS: "PSTATUS",
    PORT_DISK_TRACK_HIGH: "PTRKHIGH",
    PORT_DISK_TRACK_LOW: "PTRKLOW",
    ReadNextSector: "READSEC",
    SectorAdvanced: "SECADV",
    SectorsRemaining: "SECREM",
    SECTORS_PER_TRACK: "SECSTRK",
    SECTOR_BYTES: "SECBYTES",
    StoreSector: "STORESEC",
    SYSTEM_BASE: "SYSBASE",
    SYSTEM_SECTORS: "SYSSECTS",
  }),
  "bios.asm": Object.freeze({
    AllocationVector: "ALLOCVEC",
    BDOS_ENTRY: "BDOSENT",
    BIOS_BASE: "BIOSBASE",
    BootDiskError: "BOOTERR",
    BootErrorMessage: "BOOTMSG",
    BootSector: "BOOTSEC",
    BootSectorsRemaining: "BOOTREM",
    BootStackTop: "BOOTSTK",
    BootTrack: "BOOTTRK",
    ChecksumVector: "CHKSVEC",
    ConsoleInput: "CONIN",
    ConsoleOutput: "CONOUT",
    ConsoleStatus: "CONSTAT",
    CURRENT_DISK: "CURDISK",
    CurrentDma: "CURDMA",
    CurrentSector: "CURSEC",
    CurrentTrack: "CURTRK",
    DEFAULT_DMA: "DEFDMA",
    DirectoryBuffer: "DIRBUF",
    DISK_COMMAND_READ: "DISKRD",
    DISK_COMMAND_WRITE: "DISKWR",
    DiskError: "DSKERR",
    DiskParameterBlock: "DPB",
    DiskParameterHeader: "DPH",
    InstallPageZero: "INSTPG0",
    ListOutput: "LISTOUT",
    ListStatus: "LISTSTA",
    PORT_DISK_DATA: "PDATA",
    PORT_DISK_DRIVE: "PDRIVE",
    PORT_DISK_SECTOR: "PSECTOR",
    PORT_DISK_STATUS: "PSTATUS",
    PORT_DISK_TRACK_HIGH: "PTRKHIGH",
    PORT_DISK_TRACK_LOW: "PTRKLOW",
    PORT_TERMINAL_RX: "PTRX",
    PORT_TERMINAL_STATUS: "PTSTAT",
    PORT_TERMINAL_TX: "PTTX",
    PrintZeroTerminated: "PRINTZ",
    PunchOutput: "PUNCHOUT",
    ReaderInput: "READERIN",
    ReadSector: "READSEC",
    SECTOR_BYTES: "SECBYTES",
    SECTORS_PER_TRACK: "SECSTRK",
    SectorTranslate: "SECTRAN",
    SelectCurrentAddress: "SELCADR",
    SelectCurrentSector: "SELCSEC",
    SelectDisk: "SELDISK",
    SetSector: "SETSEC",
    WarmBootRead: "WBOOTRD",
    WarmBootSectorAdvanced: "WBOOTADV",
    WarmBootStoreSector: "WBOOTSTR",
    WARM_BOOT_SECTORS: "WBOOTSEC",
    WriteSector: "WRITSEC",
  }),
  "smoke.asm": Object.freeze({
    BDOS_CLOSE_FILE: "BCLOSE",
    BDOS_DELETE_FILE: "BDELETE",
    BDOS_MAKE_FILE: "BMAKE",
    BDOS_PRINT_STRING: "BPRINT",
    BDOS_SET_DMA: "BSETDMA",
    BDOS_WRITE_SEQUENTIAL: "BWRITE",
    ErrorMessage: "ERRMSG",
    FileError: "FILERR",
    ResultFcb: "RESFCB",
    ResultRecord: "RESREC",
    SuccessMessage: "SUCMSG",
  }),
});

function fail(message) {
  throw new Error(message);
}

function parseFixedNumber(text) {
  const value = text.trim();
  if (/^\$[0-9a-f]+$/i.test(value)) {
    return Number.parseInt(value.slice(1), 16);
  }
  if (/^[0-9a-f]+h$/i.test(value)) {
    return Number.parseInt(value.slice(0, -1), 16);
  }
  if (/^[0-9]+$/.test(value)) {
    return Number.parseInt(value, 10);
  }
  fail(`unsupported fixed numeric value ${text}`);
}

function hexWord(value) {
  return `$${value.toString(16).toUpperCase().padStart(4, "0")}`;
}

async function assembleAzm(source) {
  const result = await compile(source, {
    emitBin: true,
    emitHex: false,
    emitD8m: false,
    emitLst: false,
    registerContracts: "off",
  });
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
  if (binary?.kind !== "bin") fail(`AZM omitted binary for ${source}`);
  return binary.bytes;
}

function projectConvertedAtomSource(candidate, source, azmBytes) {
  let projected = source;
  if (candidate.name === "bdos") {
    projected = projectBdosBiosEqu(candidate, projected, azmBytes);
  }
  projected = projectConvertedStorageAliases(projected);
  if (candidate.projection === "short-symbols") {
    projected = projectShortSymbols(candidate.name, projected);
  }
  return projected;
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

function projectBdosBiosEqu(candidate, source, azmBytes) {
  const origin = parseFixedNumber(candidate.origin);
  const finalCursor = origin + azmBytes.length;
  const biosAddress = (finalCursor & 0xff00) + 0x100;
  let inserted = false;
  let removedDerivedDefinition = false;
  const projected = source
    .split(/\r\n|\n|\r/)
    .map((line) => {
      if (!inserted && /^\s*bootf\s+EQU\s+bios\+3\*0\b/i.test(line)) {
        inserted = true;
        return `bios EQU ${hexWord(biosAddress)}; projected from final BDOS extent\n${line}`;
      }
      if (/^\s*bios\s+EQU\s+\(\$\s*&\s*0ff00h\)\+100h\b/i.test(line)) {
        removedDerivedDefinition = true;
        return `; projected ${line.trim()}`;
      }
      return line;
    })
    .join("\n");
  if (!inserted) fail(`${candidate.name}: could not insert projected bios EQU`);
  if (!removedDerivedDefinition) {
    fail(`${candidate.name}: could not remove derived bios EQU`);
  }
  return projected;
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

function projectShortSymbols(name, source) {
  const words = codeIdentifierWords(source);
  const occupied = new Set(
    words.filter((word) => word.length <= 8).map((word) => word.toUpperCase()),
  );
  const longWords = words
    .filter((word) => word.length > 8)
    .sort((left, right) => left.localeCompare(right));
  const replacements = new Map();
  for (const word of longWords) {
    let replacement = "";
    for (let index = 0; index < 256; index += 1) {
      const candidate = shortSymbolCandidate(word, index);
      if (!/^[A-Z_][A-Z0-9_]*$/.test(candidate) || candidate.length > 8) {
        continue;
      }
      if (!occupied.has(candidate)) {
        replacement = candidate;
        break;
      }
    }
    if (replacement === "") {
      fail(`${name}: could not shorten symbol ${word}`);
    }
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

async function assembleAtom(root, entry) {
  const result = await assembleAtomProject({
    root,
    entry,
    target: { start: 0, capacity: 0xffff },
    maxInstructions: 50_000_000,
    maxCycles: 500_000_000,
  });
  const base = result.generation.images.reduce(
    (minimum, image) => Math.min(minimum, image.address),
    0xffff,
  );
  return materializeAtomGeneration(result.generation, {
    base,
  }).bytes;
}

async function assembleAtomRange(root, entry, start, end) {
  const result = await assembleAtomProject({
    root,
    entry,
    target: { start: 0, capacity: 0xffff },
    maxInstructions: 50_000_000,
    maxCycles: 500_000_000,
  });
  const bytes = new Uint8Array(end - start + 1);
  for (const operation of [...result.generation.images, ...result.generation.patches]) {
    operation.bytes.forEach((byte, index) => {
      const address = operation.address + index;
      if (address >= start && address <= end) {
        bytes[address - start] = byte;
      }
    });
  }
  return bytes;
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
    if (character === ";") {
      return `${output}${rewrite(segment)}${line.slice(index)}`;
    }
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

function projectOwnedAtomProjection(name, source) {
  const symbolMap = smallSourceSymbolMaps[name] ?? {};
  return source
    .split(/\r\n|\n|\r/)
    .map((line) =>
      rewriteCodeOutsideText(line, (code) => {
        const withoutOutputRange = code.replace(
          /^(\s*)\.binto\s+(.+?)\s*$/i,
          (_match, indent, end) => `${indent};@AZM-BINTO ${end.trim()}`,
        );
        return withoutOutputRange.replace(
          /\b[A-Za-z_][A-Za-z0-9_]*\b/g,
          (word) => symbolMap[word] ?? word,
        );
      }),
    )
    .join("\n");
}

function bintoEnd(source) {
  const match = /^\s*\.binto\s+(\$[0-9A-Fa-f]+|[0-9]+[Hh]|[0-9]+)\s*$/im.exec(source);
  if (match === null) return undefined;
  const text = match[1];
  if (text.startsWith("$")) return Number.parseInt(text.slice(1), 16);
  if (text.toLowerCase().endsWith("h")) return Number.parseInt(text.slice(0, -1), 16);
  return Number.parseInt(text, 10);
}

function orgStart(source) {
  const match = /^\s*\.org\s+(\$[0-9A-Fa-f]+|[0-9]+[Hh]|[0-9]+)\s*$/im.exec(source);
  if (match === null) return undefined;
  const text = match[1];
  if (text.startsWith("$")) return Number.parseInt(text.slice(1), 16);
  if (text.toLowerCase().endsWith("h")) return Number.parseInt(text.slice(0, -1), 16);
  return Number.parseInt(text, 10);
}

async function checkConverted8080Candidate(temporaryDirectory, candidate) {
  const azmSource = join(temporaryDirectory, `${candidate.name}.azm.asm`);
  const atomSource = join(temporaryDirectory, `${candidate.name}.atom.asm`);
  for (const [dialect, output] of [
    ["azm", azmSource],
    ["atom", atomSource],
  ]) {
    const converted = spawnSync(
      process.execPath,
      [
        converter,
        join(thirdPartyDirectory, candidate.input),
        output,
        candidate.origin,
        dialect,
      ],
      { cwd: repositoryRoot, encoding: "utf8" },
    );
    if (converted.status !== 0) {
      fail(
        converted.stderr ||
          converted.stdout ||
          `conversion failed for ${candidate.input}`,
      );
    }
  }
  const azmBytes = await assembleAzm(azmSource);
  const projectedAtomSource = projectConvertedAtomSource(
    candidate,
    await readFile(atomSource, "utf8"),
    azmBytes,
  );
  await writeFile(atomSource, projectedAtomSource, "utf8");
  try {
    translateAzmSourceToAtom(projectedAtomSource, {
      sourceName: `${candidate.name}.atom.asm`,
    });
  } catch (error) {
    return {
      name: candidate.name,
      status: "blocked",
      code: error.code ?? "unknown",
      message: error.message,
      line: error.diagnostic?.line,
      column: error.diagnostic?.column,
    };
  }
  const origin = parseFixedNumber(candidate.origin);
  const atomBytes = await assembleAtomRange(
    temporaryDirectory,
    `${candidate.name}.atom.asm`,
    origin,
    origin + azmBytes.length - 1,
  );
  if (
    azmBytes.length !== atomBytes.length ||
    azmBytes.some((byte, index) => byte !== atomBytes[index])
  ) {
    fail(`${candidate.name}: Atom output differs from AZM output`);
  }
  return { name: candidate.name, status: "ready", bytes: atomBytes.length };
}

async function classifyProjectOwnedCandidate(candidate) {
  const name = typeof candidate === "string" ? candidate : candidate.name;
  const source = await readFile(join(outputDirectory, name), "utf8");
  const projected =
    typeof candidate === "object" && candidate.projection === "small-symbols"
      ? projectOwnedAtomProjection(name, source)
      : source;
  try {
    const atomSource = translateAzmSourceToAtom(projected, { sourceName: name });
    const temporaryDirectory = await mkdtemp(
      join(tmpdir(), "debug80-cpm22-project-owned-"),
    );
    try {
      const atomPath = join(temporaryDirectory, name);
      await writeFile(atomPath, atomSource, "utf8");
      const [azmBytes, atomBytes] = await Promise.all([
        assembleAzm(join(outputDirectory, name)),
        bintoEnd(source) === undefined || orgStart(source) === undefined
          ? assembleAtom(temporaryDirectory, name)
          : assembleAtomRange(
              temporaryDirectory,
              name,
              orgStart(source),
              bintoEnd(source),
            ),
      ]);
      if (
        azmBytes.length !== atomBytes.length ||
        azmBytes.some((byte, index) => byte !== atomBytes[index])
      ) {
        fail(`${name}: Atom output differs from AZM output`);
      }
      return { name, status: "ready", bytes: atomBytes.length };
    } finally {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  } catch (error) {
    return {
      name,
      status: "blocked",
      code: error.code ?? "unknown",
      message: error.message,
      line: error.diagnostic?.line,
      column: error.diagnostic?.column,
    };
  }
}

const temporaryDirectory = await mkdtemp(
  join(tmpdir(), "debug80-cpm22-atom-candidates-"),
);
try {
  const results = [];
  for (const candidate of converted8080Candidates) {
    results.push(await checkConverted8080Candidate(temporaryDirectory, candidate));
  }

  for (const candidate of projectOwnedCandidates) {
    const result = await classifyProjectOwnedCandidate(candidate);
    results.push(result);
  }

  for (const result of results) {
    if (result.status === "ready") continue;
    if (result.status !== "blocked") {
      fail(`${result.name}: expected ready or blocked, got ${result.status}`);
    }
    if (result.code !== expectedBlockers[result.name]) {
      fail(`${result.name}: expected ${expectedBlockers[result.name]}, got ${result.code}`);
    }
  }

  process.stdout.write("CP/M Atom assembly candidates\n");
  for (const result of results.filter((result) => result.status === "ready")) {
    process.stdout.write(`ready\t${result.name}\t${result.bytes} bytes byte-identical\n`);
  }
  for (const result of results.filter((result) => result.status === "blocked")) {
    process.stdout.write(
      `blocked\t${result.name}\t${result.code}\t${result.line}:${result.column}\t${result.message}\n`,
    );
  }
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}
