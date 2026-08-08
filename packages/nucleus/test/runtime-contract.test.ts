import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { Service, ServiceError, Trap } from "../src/runtime-contract.js";

const contract = readFileSync(
  new URL("../docs/z80-runtime-contract.md", import.meta.url),
  "utf8",
);

const hex = (value: number): string =>
  `\`0x${value.toString(16).padStart(2, "0")}\``;

const spelling = (name: string): string =>
  name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

describe("the direct Nucleus Z80 runtime contract", () => {
  it("locks the stable trap assignments", () => {
    for (const [name, value] of Object.entries(Trap)) {
      expect(contract).toContain(`| ${hex(value)} | \`${spelling(name)}\``);
    }
    expect(new Set(Object.values(Trap)).size).toBe(6);
  });

  it("locks the service and service-error assignments", () => {
    for (const [name, value] of Object.entries(Service)) {
      expect(contract).toContain(`| ${hex(value)} | \`${name}`);
    }
    for (const [name, value] of Object.entries(ServiceError)) {
      expect(contract).toContain(`| ${hex(value)} | \`${name}\``);
    }
    expect(new Set(Object.values(Service)).size).toBe(6);
    expect(new Set(Object.values(ServiceError)).size).toBe(4);
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
