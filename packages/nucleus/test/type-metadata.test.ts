import { describe, expect, it } from "vitest";

import {
  encodeType,
  metadataStorageReport,
  sameType,
  TYPE_DESCRIPTOR_SIZE,
  TypeTag,
  type NucleusType,
} from "../src/type-metadata.js";

describe("compact Nucleus compiler type metadata", () => {
  it("represents every admitted top-level type in four bytes", () => {
    const types: readonly NucleusType[] = [
      { kind: "u8" },
      { kind: "u16" },
      { kind: "boolean" },
      { kind: "record", id: 17 },
      { kind: "string", capacity: 255 },
      { kind: "array", length: 65_535, element: { kind: "u8" } },
      { kind: "array", length: 19, element: { kind: "record", id: 23 } },
      {
        kind: "array",
        length: 257,
        element: { kind: "string", capacity: 31 },
      },
    ];

    for (const type of types) expect(encodeType(type)).toHaveLength(4);
    expect(TYPE_DESCRIPTOR_SIZE).toBe(4);
    expect(Array.from(encodeType(types[7]))).toEqual([
      TypeTag.arrayString,
      31,
      1,
      1,
    ]);
  });

  it("keeps alias category outside exact type identity", () => {
    const array = encodeType({
      kind: "array",
      length: 8,
      element: { kind: "record", id: 4 },
    });
    const aliasReferent = encodeType({
      kind: "array",
      length: 8,
      element: { kind: "record", id: 4 },
    });
    const otherLength = encodeType({
      kind: "array",
      length: 9,
      element: { kind: "record", id: 4 },
    });

    expect(sameType(array, aliasReferent)).toBe(true);
    expect(sameType(array, otherLength)).toBe(false);
  });

  it("shows why interning remains a measurement rather than a free win", () => {
    const distinct: readonly NucleusType[] = [
      { kind: "u8" },
      { kind: "u16" },
      { kind: "boolean" },
      { kind: "string", capacity: 16 },
    ];
    expect(metadataStorageReport(distinct)).toEqual({
      symbols: 4,
      uniqueTypes: 4,
      inlineBytes: 16,
      internedBytes: 20,
    });

    const repeated = Array.from({ length: 12 }, () => ({
      kind: "u16" as const,
    }));
    expect(metadataStorageReport(repeated)).toEqual({
      symbols: 12,
      uniqueTypes: 1,
      inlineBytes: 48,
      internedBytes: 16,
    });
  });

  it("rejects capacities that would truncate identity", () => {
    expect(() => encodeType({ kind: "record", id: 256 })).toThrow(/record id/);
    expect(() => encodeType({ kind: "string", capacity: 0 })).toThrow(
      /capacity/,
    );
    expect(() =>
      encodeType({ kind: "array", length: 65_536, element: { kind: "u8" } }),
    ).toThrow(/array length/);
  });
});
