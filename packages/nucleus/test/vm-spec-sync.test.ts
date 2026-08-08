import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  instructionWidth,
  OPCODES,
  Service,
  ServiceError,
  Trap,
  type OperandKind,
} from "../src/vm-definition.js";

describe("NVM specification synchronization", () => {
  it("keeps every normative opcode number, name, and width equal to the executable definition", () => {
    const specification = readFileSync(
      new URL("../docs/virtual-machine-specification.md", import.meta.url),
      "utf8",
    );
    const chapter = specification.slice(
      specification.indexOf("### 9.2 Complete opcode assignment"),
      specification.indexOf("### 9.3 Source-first order"),
    );
    const rows = chapter
      .split("\n")
      .filter((line) => line.startsWith("| `0x"))
      .map((line) => {
        const cells = line.split("|").map((cell) => cell.trim());
        return {
          code: Number.parseInt(cells[1].slice(3, 5), 16),
          mnemonic: cells[2].slice(1, -1).toLowerCase(),
          operands: parseOperands(cells[3]),
          width: Number.parseInt(cells[4], 10),
        };
      });

    expect(rows).toEqual(
      OPCODES.map((opcode) => ({
        code: opcode.code,
        mnemonic: opcode.mnemonic,
        operands: opcode.operands,
        width: instructionWidth(opcode),
      })),
    );
  });

  it("keeps trap, service, and service-error numbers equal to the executable definition", () => {
    const specification = readFileSync(
      new URL("../docs/virtual-machine-specification.md", import.meta.url),
      "utf8",
    );
    expect(numberedNames(specification, "### 15.1", "### 15.2")).toEqual(
      entries(Trap),
    );
    expect(numberedNames(specification, "### 16.1", "### 16.2")).toEqual(
      entries(Service),
    );
    expect(numberedNames(specification, "### 16.2", "### 16.3")).toEqual(
      entries(ServiceError),
    );
  });

  it("records the settled aggregate-copy and counted-loop lowerings", () => {
    const specification = readFileSync(
      new URL("../docs/virtual-machine-specification.md", import.meta.url),
      "utf8",
    );
    expect(specification).toContain(
      "Exact-type aggregate assignment copies the complete `N + 1` byte string representation, including the length byte",
    );
    expect(specification).toContain(
      "It may instead emit a counted byte-copy loop that walks the common extent with `INDEX` at unit stride",
    );
    expect(specification).not.toContain("fixed-size byte-copy loop");
    expect(specification).toContain(
      "The counter is a scalar local that source statements cannot change while the loop is active",
    );
  });
});

function parseOperands(cell: string): readonly OperandKind[] {
  if (cell === "—") return [];
  const mapping: Readonly<Record<string, OperandKind>> = {
    s: "slot",
    a: "slot",
    b: "slot",
    d: "slot",
    q: "argument",
    r: "routine",
    v: "service",
    t: "trap",
    i8: "u8",
    i16: "u16",
    x: "u16",
    p: "code-offset",
  };
  return cell
    .slice(1, -1)
    .split(", ")
    .map((name) => mapping[name]);
}

function numberedNames(
  specification: string,
  start: string,
  end: string,
): readonly { readonly name: string; readonly value: number }[] {
  const section = specification.slice(
    specification.indexOf(start),
    specification.indexOf(end),
  );
  return section
    .split("\n")
    .filter((line) => /^\|\s+`0x[0-9a-f]{2}`/.test(line))
    .map((line) => {
      const cells = line.split("|").map((cell) => cell.trim());
      return {
        name: normalize(cells[2].replaceAll("`", "").replace(/\(.*/, "")),
        value: Number.parseInt(cells[1].slice(3, 5), 16),
      };
    });
}

function entries(
  values: Readonly<Record<string, number>>,
): readonly { readonly name: string; readonly value: number }[] {
  return Object.entries(values).map(([name, value]) => ({
    name: normalize(name),
    value,
  }));
}

function normalize(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}
