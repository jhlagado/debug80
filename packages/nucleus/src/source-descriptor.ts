import type { SourcePart } from "./source-part.js";

export const NUCLEUS_RESIDENT_SOURCE_DESCRIPTOR_SIZE = 5;
export const NUCLEUS_RESIDENT_SOURCE_PART_CAPACITY = 255;

export interface NucleusResidentSourceDescriptorOptions {
  readonly sourceParts: readonly SourcePart[];
  readonly sourceBase: number;
  readonly sourceCapacity?: number;
  readonly partCapacity?: number;
}

export interface NucleusResidentSourceDescriptor {
  readonly ordinal: number;
  readonly start: number;
  readonly end: number;
  readonly diagnosticName: string;
}

export interface NucleusResidentSourceImage {
  readonly sourceBase: number;
  readonly sourceEnd: number;
  readonly sourceBytes: Uint8Array;
  readonly descriptorBytes: Uint8Array;
  readonly descriptors: readonly NucleusResidentSourceDescriptor[];
}

const requireU16 = (name: string, value: number): void => {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new RangeError(`${name} is outside 0..65535`);
  }
};

const requireByte = (name: string, value: number): void => {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new RangeError(`${name} is outside 0..255`);
  }
};

const requireCapacity = (name: string, value: number): void => {
  if (!Number.isInteger(value) || value < 0 || value > 0x10000) {
    throw new RangeError(`${name} is outside 0..65536`);
  }
};

const writeU16 = (bytes: Uint8Array, offset: number, value: number): void => {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = value >>> 8;
};

export function buildNucleusResidentSourceImage({
  sourceParts,
  sourceBase,
  sourceCapacity,
  partCapacity = NUCLEUS_RESIDENT_SOURCE_PART_CAPACITY,
}: NucleusResidentSourceDescriptorOptions): NucleusResidentSourceImage {
  requireU16("source base", sourceBase);
  if (sourceCapacity !== undefined) {
    requireCapacity("source capacity", sourceCapacity);
  }
  requireByte("source part capacity", partCapacity);
  if (partCapacity === 0) {
    throw new RangeError("source part capacity must be nonzero");
  }
  if (sourceParts.length === 0) {
    throw new RangeError("at least one source part is required");
  }
  if (sourceParts.length > partCapacity) {
    throw new RangeError("source part count exceeds resident capacity");
  }

  const totalBytes = sourceParts.reduce(
    (total, part) => total + part.bytes.length,
    0,
  );
  const sourceEnd = sourceBase + totalBytes;
  if (sourceEnd > 0x10000) {
    throw new RangeError("source image crosses the Z80 address space");
  }
  if (sourceCapacity !== undefined && totalBytes > sourceCapacity) {
    throw new RangeError("source image exceeds configured capacity");
  }

  const sourceBytes = new Uint8Array(totalBytes);
  const descriptorBytes = new Uint8Array(
    sourceParts.length * NUCLEUS_RESIDENT_SOURCE_DESCRIPTOR_SIZE,
  );
  const descriptors: NucleusResidentSourceDescriptor[] = [];
  let cursor = sourceBase;
  let sourceOffset = 0;
  for (const [index, part] of sourceParts.entries()) {
    requireByte(`source part ${index + 1} ordinal`, part.ordinal);
    if (part.ordinal === 0) {
      throw new RangeError(`source part ${index + 1} ordinal must be nonzero`);
    }
    const start = cursor;
    const end = cursor + part.bytes.length;
    requireU16(`source part ${index + 1} start`, start);
    requireU16(`source part ${index + 1} end`, end);
    sourceBytes.set(part.bytes, sourceOffset);
    const descriptorOffset = index * NUCLEUS_RESIDENT_SOURCE_DESCRIPTOR_SIZE;
    descriptorBytes[descriptorOffset] = part.ordinal;
    writeU16(descriptorBytes, descriptorOffset + 1, start);
    writeU16(descriptorBytes, descriptorOffset + 3, end);
    descriptors.push(
      Object.freeze({
        ordinal: part.ordinal,
        start,
        end,
        diagnosticName: part.diagnosticName,
      }),
    );
    cursor = end;
    sourceOffset += part.bytes.length;
  }

  return Object.freeze({
    sourceBase,
    sourceEnd,
    sourceBytes,
    descriptorBytes,
    descriptors: Object.freeze(descriptors),
  });
}

const checkMemoryWrite = (
  memory: Uint8Array,
  name: string,
  address: number,
  bytes: Uint8Array,
): void => {
  requireU16(`${name} address`, address);
  if (address + bytes.length > memory.length) {
    throw new RangeError(`${name} crosses memory end`);
  }
};

export function installNucleusResidentSourceImage(
  memory: Uint8Array,
  image: NucleusResidentSourceImage,
  descriptorBase: number,
): void {
  checkMemoryWrite(memory, "source image", image.sourceBase, image.sourceBytes);
  checkMemoryWrite(
    memory,
    "source descriptor table",
    descriptorBase,
    image.descriptorBytes,
  );
  memory.set(image.sourceBytes, image.sourceBase);
  memory.set(image.descriptorBytes, descriptorBase);
}
