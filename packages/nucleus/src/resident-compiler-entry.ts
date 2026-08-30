import {
  Z80_ADDRESS_SPACE_BYTES,
  Z80_WORD_MAX,
  isUnsignedIntegerUpTo,
} from "@jhlagado/z80-tool-services";

import {
  installNucleusResidentSourceImage,
  NUCLEUS_RESIDENT_SOURCE_DESCRIPTOR_SIZE,
  type NucleusResidentSourceImage,
} from "./source-descriptor.js";

export type NucleusResidentCompilerEntrySymbol = number | string;

export interface NucleusResidentCompilerEntrySymbols {
  readonly executionEntry: NucleusResidentCompilerEntrySymbol;
  readonly sourceDescriptorBase: NucleusResidentCompilerEntrySymbol;
  readonly sourceBase: NucleusResidentCompilerEntrySymbol;
  readonly sourceCapacity: number;
  readonly targetDescriptor: NucleusResidentCompilerEntrySymbol;
  readonly partBankTable: NucleusResidentCompilerEntrySymbol;
  readonly outputLogBase: NucleusResidentCompilerEntrySymbol;
  readonly outputLogLength: NucleusResidentCompilerEntrySymbol;
  readonly outputLogLimit: NucleusResidentCompilerEntrySymbol;
}

export interface NucleusResidentCompilerEntry {
  readonly executionEntry: number;
  readonly sourceDescriptorBase: number;
  readonly sourceBase: number;
  readonly sourceCapacity: number;
  readonly targetDescriptor: number;
  readonly partBankTable: number;
  readonly outputLogBase: number;
  readonly outputLogLength: number;
  readonly outputLogLimit: number;
}

export type NucleusResidentCompilerSymbolResolver = (name: string) => number;

const requireU16 = (name: string, value: number): void => {
  if (!isUnsignedIntegerUpTo(value, Z80_WORD_MAX)) {
    throw new RangeError(`${name} is outside 0..65535`);
  }
};

const requireCapacity = (name: string, value: number): void => {
  if (!isUnsignedIntegerUpTo(value, Z80_ADDRESS_SPACE_BYTES)) {
    throw new RangeError(`${name} is outside 0..65536`);
  }
};

const resolveEntryField = (
  name: string,
  value: NucleusResidentCompilerEntrySymbol,
  resolve: NucleusResidentCompilerSymbolResolver,
): number => {
  const resolved = typeof value === "string" ? resolve(value) : value;
  requireU16(name, resolved);
  return resolved;
};

export function resolveNucleusResidentCompilerEntry(
  entry: NucleusResidentCompilerEntrySymbols,
  resolve: NucleusResidentCompilerSymbolResolver,
): NucleusResidentCompilerEntry {
  const resolved = {
    executionEntry: resolveEntryField(
      "execution entry",
      entry.executionEntry,
      resolve,
    ),
    sourceDescriptorBase: resolveEntryField(
      "source descriptor base",
      entry.sourceDescriptorBase,
      resolve,
    ),
    sourceBase: resolveEntryField("source base", entry.sourceBase, resolve),
    sourceCapacity: entry.sourceCapacity,
    targetDescriptor: resolveEntryField(
      "target descriptor",
      entry.targetDescriptor,
      resolve,
    ),
    partBankTable: resolveEntryField(
      "part bank table",
      entry.partBankTable,
      resolve,
    ),
    outputLogBase: resolveEntryField(
      "output log base",
      entry.outputLogBase,
      resolve,
    ),
    outputLogLength: resolveEntryField(
      "output log length",
      entry.outputLogLength,
      resolve,
    ),
    outputLogLimit: resolveEntryField(
      "output log limit",
      entry.outputLogLimit,
      resolve,
    ),
  };

  validateNucleusResidentCompilerEntry(resolved);
  return Object.freeze(resolved);
}

export function validateNucleusResidentCompilerEntry(
  entry: NucleusResidentCompilerEntry,
): void {
  requireU16("execution entry", entry.executionEntry);
  requireU16("source descriptor base", entry.sourceDescriptorBase);
  requireU16("source base", entry.sourceBase);
  requireCapacity("source capacity", entry.sourceCapacity);
  requireU16("target descriptor", entry.targetDescriptor);
  requireU16("part bank table", entry.partBankTable);
  requireU16("output log base", entry.outputLogBase);
  requireU16("output log length", entry.outputLogLength);
  requireU16("output log limit", entry.outputLogLimit);

  if (entry.sourceBase + entry.sourceCapacity > Z80_ADDRESS_SPACE_BYTES) {
    throw new RangeError("source region crosses the Z80 address space");
  }
  if (entry.outputLogBase > entry.outputLogLimit) {
    throw new RangeError("output log base is after output log limit");
  }
}

export function validateNucleusResidentSourceForEntry(
  entry: NucleusResidentCompilerEntry,
  image: NucleusResidentSourceImage,
): void {
  validateNucleusResidentCompilerEntry(entry);
  if (image.sourceBase !== entry.sourceBase) {
    throw new RangeError("source image base does not match compiler entry");
  }
  if (image.sourceEnd > entry.sourceBase + entry.sourceCapacity) {
    throw new RangeError("source image exceeds compiler entry source region");
  }
  if (
    entry.sourceDescriptorBase + image.descriptorBytes.length >
    Z80_ADDRESS_SPACE_BYTES
  ) {
    throw new RangeError(
      "source descriptor table crosses the Z80 address space",
    );
  }
  if (
    image.descriptorBytes.length % NUCLEUS_RESIDENT_SOURCE_DESCRIPTOR_SIZE !==
    0
  ) {
    throw new RangeError("source descriptor table has a partial record");
  }
}

export function installNucleusResidentCompilerSource(
  memory: Uint8Array,
  entry: NucleusResidentCompilerEntry,
  image: NucleusResidentSourceImage,
): void {
  validateNucleusResidentSourceForEntry(entry, image);
  installNucleusResidentSourceImage(memory, image, entry.sourceDescriptorBase);
}
