import type {
  NucleusPreparedSourceTargetPublication,
  NucleusProofTargetPublication,
} from "./publication.js";

export type NucleusPublication =
  | NucleusPreparedSourceTargetPublication
  | NucleusProofTargetPublication;

export type NucleusSourceSegmentKind =
  | "code"
  | "data"
  | "directive"
  | "unknown";

export type NucleusSourceSegmentConfidence = "high" | "medium" | "low";

export interface NucleusPublishedSourcePart {
  readonly ordinal: number;
  readonly logicalIdentity: string;
}

export interface NucleusGeneratedSourceSegment {
  readonly partOrdinal: number;
  readonly line: number;
  readonly column: number;
  readonly bank: number;
  readonly start: number;
  readonly end: number;
  readonly kind: NucleusSourceSegmentKind;
  readonly confidence: NucleusSourceSegmentConfidence;
}

export const NUCLEUS_SOURCE_PROVENANCE_RECORD_BYTES = 12;

const sourceSegmentKinds = [
  "unknown",
  "code",
  "data",
  "directive",
] as const satisfies readonly NucleusSourceSegmentKind[];

const sourceSegmentConfidences = [
  "low",
  "medium",
  "high",
] as const satisfies readonly NucleusSourceSegmentConfidence[];

export interface NucleusD8Options {
  readonly sourceParts?: readonly NucleusPublishedSourcePart[];
  readonly sourceSegments?: readonly NucleusGeneratedSourceSegment[];
}

const publicationInput = (
  publication: NucleusPublication,
): string | undefined =>
  "entry" in publication ? publication.entry : publication.manifest;

const publicationSourceParts = (
  publication: NucleusPublication,
  options: NucleusD8Options,
): readonly NucleusPublishedSourcePart[] => {
  if (options.sourceParts !== undefined) return options.sourceParts;
  if ("sourcePartIdentities" in publication) {
    return publication.sourcePartIdentities.map((logicalIdentity, index) =>
      Object.freeze({
        ordinal: index + 1,
        logicalIdentity,
      }),
    );
  }
  const input = publicationInput(publication);
  return input === undefined
    ? []
    : [Object.freeze({ ordinal: 1, logicalIdentity: input })];
};

const publicationSourceSegments = (
  publication: NucleusPublication,
  options: NucleusD8Options,
): readonly NucleusGeneratedSourceSegment[] =>
  options.sourceSegments ??
  (options.sourceParts === undefined && "sourceProvenance" in publication
    ? (publication.sourceProvenance ?? [])
    : []);

const requirePositiveInteger = (name: string, value: number): void => {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`D8 source segment ${name} must be a positive integer`);
  }
};

const requireU16 = (name: string, value: number): void => {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new Error(`D8 source segment ${name} is outside 0..65535`);
  }
};

const readU16Le = (bytes: Uint8Array, offset: number): number =>
  (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);

export function decodeNucleusSourceProvenanceLog(
  memory: Uint8Array,
  start: number,
  length: number,
  maxBytes: number,
): readonly NucleusGeneratedSourceSegment[] {
  if (!Number.isInteger(start) || start < 0 || start > memory.length) {
    throw new Error("source provenance log start is outside proof memory");
  }
  if (!Number.isInteger(length) || length < 0) {
    throw new Error("source provenance log length must be non-negative");
  }
  if (!Number.isInteger(maxBytes) || maxBytes < 0) {
    throw new Error("source provenance log byte limit must be non-negative");
  }
  if (length > maxBytes) {
    throw new Error(
      `source provenance log uses ${length} bytes, limit ${maxBytes}`,
    );
  }
  if (start + length > memory.length) {
    throw new Error("source provenance log exceeds proof memory");
  }
  if (length % NUCLEUS_SOURCE_PROVENANCE_RECORD_BYTES !== 0) {
    throw new Error("source provenance log has a truncated record");
  }

  const segments: NucleusGeneratedSourceSegment[] = [];
  const end = start + length;
  for (
    let cursor = start;
    cursor < end;
    cursor += NUCLEUS_SOURCE_PROVENANCE_RECORD_BYTES
  ) {
    const partOrdinal = memory[cursor] ?? 0;
    const bank = memory[cursor + 1] ?? 0;
    const line = readU16Le(memory, cursor + 2);
    const column = readU16Le(memory, cursor + 4);
    const segmentStart = readU16Le(memory, cursor + 6);
    const segmentEnd = readU16Le(memory, cursor + 8);
    const kind = sourceSegmentKinds[memory[cursor + 10] ?? 0];
    const confidence =
      sourceSegmentConfidences[memory[cursor + 11] ?? 0];

    if (partOrdinal < 1) {
      throw new Error("source provenance record part ordinal must be positive");
    }
    if (line < 1) {
      throw new Error("source provenance record line must be positive");
    }
    if (column < 1) {
      throw new Error("source provenance record column must be positive");
    }
    if (segmentStart >= segmentEnd) {
      throw new Error("source provenance record start must precede end");
    }
    if (kind === undefined) {
      throw new Error("source provenance record has an unknown segment kind");
    }
    if (confidence === undefined) {
      throw new Error(
        "source provenance record has an unknown confidence value",
      );
    }

    segments.push({
      partOrdinal,
      line,
      column,
      bank,
      start: segmentStart,
      end: segmentEnd,
      kind,
      confidence,
    });
  }

  return segments;
}

const validateSourceSegment = (
  segment: NucleusGeneratedSourceSegment,
  imageBase: number,
  imageEnd: number,
): void => {
  requirePositiveInteger("part ordinal", segment.partOrdinal);
  requirePositiveInteger("line", segment.line);
  requirePositiveInteger("column", segment.column);
  requireU16("start", segment.start);
  requireU16("end", segment.end);
  if (segment.start >= segment.end) {
    throw new Error("D8 source segment start must precede end");
  }
  if (segment.start < imageBase || segment.end > imageEnd) {
    throw new Error("D8 source segment is outside the committed image range");
  }
};

export function renderNucleusD8(
  publication: NucleusPublication,
  options: NucleusD8Options = {},
): string {
  const parsed = publication.nobj.parsed;
  const bank = parsed.map.banks[0];
  if (parsed.begin.banked || bank === undefined) {
    throw new Error("D8 output currently requires a flat NOBJ target");
  }
  const imageBase = parsed.begin.imageBase;
  const imageEnd = imageBase + bank.usedLength;
  const sourceParts = publicationSourceParts(publication, options);
  const partByOrdinal = new Map(
    sourceParts.map((part) => [part.ordinal, part.logicalIdentity]),
  );
  const fileList = sourceParts.map((part) => part.logicalIdentity);
  const files = Object.fromEntries(fileList.map((file) => [file, {}]));
  for (const segment of publicationSourceSegments(publication, options)) {
    if (segment.bank !== 0) {
      throw new Error("D8 source segments currently require a flat NOBJ target");
    }
    validateSourceSegment(segment, imageBase, imageEnd);
    const file = partByOrdinal.get(segment.partOrdinal);
    if (file === undefined) {
      throw new Error(
        `D8 source segment references unknown source part ${segment.partOrdinal}`,
      );
    }
    const entry = files[file] as {
      segments?: unknown[];
    };
    const segments = entry.segments ?? [];
    segments.push({
      start: segment.start,
      end: segment.end,
      line: segment.line,
      column: segment.column,
      kind: segment.kind,
      confidence: segment.confidence,
    });
    entry.segments = segments;
  }
  const input = publicationInput(publication);
  const map = {
    format: "d8-debug-map",
    version: 1,
    arch: "z80",
    addressWidth: 16,
    endianness: "little",
    files,
    segments: [{
      start: imageBase,
      end: imageEnd,
    }],
    fileList,
    symbols: [],
    generator: {
      name: "nucleus",
      tool: "nucleus",
      inputs: input === undefined ? {} : { entry: input },
      entryAddress: parsed.map.entryAddress,
    },
  };
  return `${JSON.stringify(map, null, 2)}\n`;
}
