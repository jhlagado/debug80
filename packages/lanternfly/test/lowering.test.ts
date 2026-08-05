import { describe, expect, it } from "vitest";

import {
  HOLE,
  LOWERING,
  NOT_EXTRACTED,
  type EmittedByte,
  assembleSource,
  displayName,
  emitterBytes,
  opcodeConstants,
  readSource,
} from "../src/bootstrap/index.js";

/**
 * The level-0 lowering table, pinned across three representations.
 *
 * Review finding 28: the earlier version of this file carried its own copy of
 * the mnemonics and its own copy of the bytes, so it proved that two things
 * written in the same file agreed. Changing an emitter left it green.
 *
 * Now there is one manifest. Each shape's mnemonics are assembled through AZM,
 * the same shape's bytes are read out of the Lanternfly source, and the two
 * are compared. An emitter that changes fails here; a manifest that drifts
 * from the emitters fails here; and `docs/level0-lowering.md` is generated
 * from the manifest, so a document that drifts fails in `lowering-doc.test.ts`.
 */

const SOURCES = [
  "candlemoth/expression.lafy",
  "candlemoth/symbols.lafy",
  "candlemoth/statement.lafy",
];

const source = readSource(SOURCES);

function assemble(mnemonics: readonly string[]): number[] {
  const text = [".org $0000", "Start:", ...mnemonics.map((m) => `    ${m}`)].join("\n");
  return Array.from(assembleSource(`${text}\n`).bytes);
}

/** Compares an extracted sequence against assembled bytes, holes wild. */
function agrees(extracted: readonly EmittedByte[], assembled: readonly number[]): void {
  expect(extracted.length).toBe(assembled.length);
  for (const [at, byte] of extracted.entries()) {
    if (byte === HOLE) continue;
    expect(byte, `byte ${at}`).toBe(assembled[at]);
  }
}

describe("every opcode constant in the source is the instruction it is named for", () => {
  // The constants are read from the Lanternfly source rather than listed
  // here, so a constant added to the source without a mnemonic below is a
  // failure rather than an omission.
  const named: Record<string, string> = {
    opLoadHlFromAddress: "LD HL,($1234)",
    opStoreHlToAddress: "LD ($1234),HL",
    opLoadAFromAddress: "LD A,($1234)",
    opStoreAToAddress: "LD ($1234),A",
    opLoadHlImmediate: "LD HL,$1234",
    opLoadDeImmediate: "LD DE,$1234",
    opAddHlDe: "ADD HL,DE",
    opExDeHl: "EX DE,HL",
    opOrA: "OR A",
    opEdPrefix: "SBC HL,DE",
    opSbcHlDe: "SBC HL,DE",
    opPushHl: "PUSH HL",
    opPopDe: "POP DE",
    opAddHlHl: "ADD HL,HL",
    opLoadAFromHl: "LD A,(HL)",
    opLoadEFromHl: "LD E,(HL)",
    opLoadDFromHl: "LD D,(HL)",
    opIncHl: "INC HL",
    opStoreEToHl: "LD (HL),E",
    opStoreDToHl: "LD (HL),D",
    opStoreAToDe: "LD (DE),A",
    opLoadAFromL: "LD A,L",
    opLoadLFromA: "LD L,A",
    opOrE: "OR E",
    opAndE: "AND E",
    opXorImmediate: "XOR $01",
    opLoadHImmediate: "LD H,$00",
    opCall: "CALL $1234",
    opJump: "JP $1234",
    opJumpIfZero: "JP Z,$1234",
    opJumpIfNotZero: "JP NZ,$1234",
    opReturn: "RET",
    opOrH: "OR H",
  };

  const opcodes = opcodeConstants(source);

  it("names every opcode constant the source declares", () => {
    expect([...opcodes.keys()].sort()).toEqual(Object.keys(named).sort());
  });

  for (const [name, mnemonic] of Object.entries(named)) {
    it(`${name} is ${mnemonic}`, () => {
      const value = opcodes.get(name);
      expect(value, `${name} is not declared in the source`).toBeDefined();
      const bytes = assemble([mnemonic]);
      // `SBC HL,DE` is two bytes: the prefix constant is the first and the
      // opcode constant the second, which is why both map to one mnemonic.
      const expected = name === "opSbcHlDe" ? bytes[1] : bytes[0];
      expect(value).toBe(expected);
    });
  }
});

describe("the lowering table agrees with the emitters in the source", () => {
  for (const shape of LOWERING) {
    const name = displayName(shape);
    const extracted = !NOT_EXTRACTED.includes(name);

    it(`${name}: ${shape.construct}`, () => {
      const assembled = assemble(shape.mnemonics);
      expect(assembled.length).toBeGreaterThan(0);

      if (!extracted) {
        // Emitted inline rather than through a routine. The assembler still
        // checks the mnemonics; nothing checks the source, and NOT_EXTRACTED
        // is where that is admitted.
        return;
      }
      const emitter = emitterBytes(source, shape.routine!, shape.guard, shape.branch);
      agrees(emitter.bytes, assembled);
    });
  }

  it("admits exactly which shapes are not read from the source", () => {
    const names = LOWERING.map(displayName);
    for (const admitted of NOT_EXTRACTED) expect(names).toContain(admitted);
    expect(NOT_EXTRACTED).toHaveLength(6);
  });
});
