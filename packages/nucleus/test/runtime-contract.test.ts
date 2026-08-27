import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { DEFAULT_RUNTIME_STREAM_STATUS_POLICY } from "@jhlagado/z80-tool-services";

import { Service, ServiceError, Trap } from "../src/runtime-contract.js";

const contract = readFileSync(
  new URL("../docs/z80-runtime-contract.md", import.meta.url),
  "utf8",
);

const spelling = (name: string): string =>
  name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

type Assignment = readonly [name: string, value: number];

const tableAssignments = (heading: string): readonly Assignment[] => {
  const start = contract.indexOf(heading);
  if (start === -1) throw new Error(`Contract heading not found: ${heading}`);
  const next = contract.indexOf("\n### ", start + heading.length);
  const section = contract.slice(start, next === -1 ? undefined : next);
  return [
    ...section.matchAll(/^\|\s*`0x([0-9a-f]{2})`\s*\|\s*`([^`]+)`/gm),
  ].map(([, value, name]) => [name, Number.parseInt(value, 16)] as const);
};

describe("the direct Nucleus Z80 runtime contract", () => {
  it("locks the stable trap assignments", () => {
    expect(tableAssignments("### 7.2 Stable trap codes")).toEqual(
      Object.entries(Trap).map(
        ([name, value]) => [spelling(name), value] as const,
      ),
    );
    expect(new Set(Object.values(Trap)).size).toBe(6);
  });

  it("locks the service and service-error assignments", () => {
    expect(
      tableAssignments("### 8.1 Stable services").map(([name, value]) => [
        name.replace(/\(.*$/, ""),
        value,
      ]),
    ).toEqual(Object.entries(Service));
    expect(tableAssignments("### 8.2 Stable service errors")).toEqual(
      Object.entries(ServiceError),
    );
    expect(new Set(Object.values(Service)).size).toBe(6);
    expect(new Set(Object.values(ServiceError)).size).toBe(4);
  });

  it("matches the shared runtime byte-stream status policy", () => {
    expect(DEFAULT_RUNTIME_STREAM_STATUS_POLICY).toMatchObject({
      success: 0x00,
      endOfInput: ServiceError.endOfInput,
      inputFailure: ServiceError.inputFailure,
      outputFailure: ServiceError.outputFailure,
      storageFailure: ServiceError.storageFailure,
    });
  });

  it("defines a fresh service state for each run", () => {
    expect(contract).toMatch(
      /Before each new run, the adapter restores every service input, output, and\s+cursor/,
    );
    expect(contract).toContain(
      "A seek beyond the end fails with `storageFailure`.",
    );
  });

  it("excludes a public bytecode or virtual-machine path", () => {
    expect(contract).toContain(
      "does not have an active bytecode format or virtual-machine implementation path",
    );
    expect(contract).toContain(
      "The compiler may use an internal semantic-operation transcript",
    );
    expect(contract).not.toContain("Complete opcode assignment");
    expect(contract).not.toContain("argument-mask analysis");
  });
});
