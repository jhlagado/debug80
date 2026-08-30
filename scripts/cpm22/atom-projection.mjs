import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, normalize } from "node:path";

import {
  assembleAtomProject,
  materializeAtomGeneration,
  translateAzmSourceToAtom,
} from "../../packages/atom/src/host/index.mjs";

export const converted8080Candidates = Object.freeze([
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

export const projectOwnedCandidates = Object.freeze([
  { name: "bootstrap.asm", projection: "small-symbols" },
  { name: "bios.asm", projection: "small-symbols" },
  { name: "smoke.asm", projection: "small-symbols" },
  {
    name: "editor.asm",
    projection: "inline-includes-and-short-symbols",
  },
]);

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

export function parseFixedNumber(text) {
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

export function projectShortSymbols(source, label) {
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

export function projectConvertedStorageAliases(source) {
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

export function projectBdosBiosEqu(source, originText, azmBytes) {
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

export function projectConvertedAtomSource(candidate, source, azmBytes) {
  let projected = source;
  if (candidate.name === "bdos") {
    projected = projectBdosBiosEqu(projected, candidate.origin, azmBytes);
  }
  projected = projectConvertedStorageAliases(projected);
  if (candidate.projection === "short-symbols") {
    projected = projectShortSymbols(projected, candidate.name);
  }
  return projected;
}

export function projectOutputRangeDirective(source) {
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

export function bintoEnd(source) {
  const match = /^\s*\.binto\s+(\$[0-9A-Fa-f]+|[0-9]+[Hh]|[0-9]+)\s*$/im.exec(source);
  return match === null ? undefined : parseFixedNumber(match[1]);
}

export function orgStart(source) {
  const match = /^\s*\.org\s+(\$[0-9A-Fa-f]+|[0-9]+[Hh]|[0-9]+)\s*$/im.exec(source);
  return match === null ? undefined : parseFixedNumber(match[1]);
}

export async function expandProjectTextualIncludes(outputDirectory, name, includeStack = []) {
  const source = await readFile(join(outputDirectory, name), "utf8");
  const lines = [];
  for (const line of source.split(/\r\n|\n|\r/)) {
    const include = /^\s*\.include\s+"([^"]+)"\s*(?:;.*)?$/i.exec(line);
    if (include === null) {
      lines.push(line);
      continue;
    }
    const includeName = normalize(include[1]).replaceAll("\\", "/");
    if (isAbsolute(includeName) || includeName.startsWith("../")) {
      fail(`${name}: invalid textual include ${include[1]}`);
    }
    if (includeStack.includes(includeName)) {
      fail(`${name}: textual include cycle ${[...includeStack, includeName].join(" -> ")}`);
    }
    lines.push(
      await expandProjectTextualIncludes(
        outputDirectory,
        includeName,
        [...includeStack, includeName],
      ),
    );
  }
  return lines.join("\n");
}

export async function projectOwnedAtomProjection(outputDirectory, name, source, projection) {
  let projected = source;
  if (projection === "inline-includes-and-short-symbols") {
    projected = await expandProjectTextualIncludes(outputDirectory, name, [name]);
  }
  const symbolMap = smallSourceSymbolMaps[name] ?? {};
  projected = projectOutputRangeDirective(projected)
    .split(/\r\n|\n|\r/)
    .map((line) =>
      rewriteCodeOutsideText(line, (code) =>
        code.replace(
          /\b[A-Za-z_][A-Za-z0-9_]*\b/g,
          (word) => symbolMap[word] ?? word,
        ),
      ),
    )
    .join("\n");
  if (projection === "inline-includes-and-short-symbols") {
    projected = projectShortSymbols(projected, name);
  }
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

export async function assembleAtomSource(root, entry, { start, length } = {}) {
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

export function requireByteIdentity(label, expected, actual) {
  if (
    expected.length !== actual.length ||
    expected.some((byte, index) => byte !== actual[index])
  ) {
    fail(`${label}: Atom output differs from AZM output`);
  }
}

export async function writeConvertedAtomCandidate({
  repositoryRoot,
  thirdPartyDirectory,
  converter,
  temporaryDirectory,
  candidate,
  azmBytes,
}) {
  const atomSource = join(temporaryDirectory, `${candidate.name}.atom.asm`);
  const converted = spawnSync(
    process.execPath,
    [
      converter,
      join(thirdPartyDirectory, candidate.input),
      atomSource,
      candidate.origin,
      "atom",
    ],
    { cwd: repositoryRoot, encoding: "utf8" },
  );
  if (converted.status !== 0) {
    fail(
      converted.stderr ||
        converted.stdout ||
        `Atom conversion failed for ${candidate.input}`,
    );
  }
  const projected = projectConvertedAtomSource(
    candidate,
    await readFile(atomSource, "utf8"),
    azmBytes,
  );
  await writeFile(atomSource, projected, "utf8");
  return atomSource;
}

export async function assembleConvertedWithAtom(options) {
  await writeConvertedAtomCandidate(options);
  const start = parseFixedNumber(options.candidate.origin);
  const atomBytes = await assembleAtomSource(
    options.temporaryDirectory,
    `${options.candidate.name}.atom.asm`,
    { start, length: options.azmBytes.length },
  );
  requireByteIdentity(options.candidate.name, options.azmBytes, atomBytes);
  return atomBytes;
}

export async function assembleProjectOwnedWithAtom({
  outputDirectory,
  temporaryDirectory,
  candidate,
  azmBytes,
}) {
  const name = typeof candidate === "string" ? candidate : candidate.name;
  const source = await readFile(join(outputDirectory, name), "utf8");
  const projected =
    typeof candidate === "object"
      ? await projectOwnedAtomProjection(outputDirectory, name, source, candidate.projection)
      : source;
  const atomSource = translateAzmSourceToAtom(projected, { sourceName: name });
  await writeFile(join(temporaryDirectory, name), atomSource, "utf8");
  const start = orgStart(source);
  const end = bintoEnd(source);
  const atomBytes = start === undefined || end === undefined
    ? await assembleAtomSource(temporaryDirectory, name)
    : await assembleAtomSource(temporaryDirectory, name, {
        start,
        length: end - start + 1,
      });
  requireByteIdentity(name, azmBytes, atomBytes);
  return atomBytes;
}
