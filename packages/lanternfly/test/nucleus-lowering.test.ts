import { readFileSync, writeFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  NUCLEUS_LOWERING,
  NUCLEUS_SECTIONS,
  type NucleusSection,
  assembleSource,
} from "../src/bootstrap/index.js";

/**
 * Every nucleus lowering sequence, assembled.
 *
 * Two claims in `docs/nucleus/lowering.md` were written from memory and were
 * wrong — `SUB (nn)` is not an instruction, and "build a word" was two bytes
 * only when both halves were already in registers. The assembler was available
 * throughout. This test is what makes it impossible to skip.
 *
 * Byte counts live nowhere but here: the manifest carries mnemonics, the
 * assembler produces the lengths, and the generator writes them into the
 * document. A count cannot disagree with the assembler by construction.
 */

const DOCUMENT = "docs/nucleus/lowering.md";
const BEGIN = (section: string) => `<!-- generated:${section} -->`;
const END = "<!-- /generated -->";

function assemble(mnemonics: readonly string[]): Uint8Array {
  const source = [".org $0100", "Start:", ...mnemonics.map((m) => `    ${m}`)].join("\n");
  return assembleSource(`${source}\n`).bytes;
}

describe("every nucleus sequence assembles", () => {
  for (const shape of NUCLEUS_LOWERING) {
    it(`${shape.label}: ${shape.mnemonics.join(" / ")}`, () => {
      const bytes = assemble(shape.mnemonics);
      expect(bytes.length).toBeGreaterThan(0);
    });
  }

  it("rejects the two sequences that were quoted and do not exist", () => {
    // `SUB (nn)` — the byte-subtract lowering as first written.
    expect(() => assemble(["LD A,($9000)", "SUB ($9001)"])).toThrow(/invalid SUB operand/);
    // "build a word" at two bytes, from memory rather than registers.
    expect(assemble(["LD A,($9000)", "LD H,A", "LD A,($9001)", "LD L,A"]).length).toBe(8);
  });
});

describe("the nucleus lowering document", () => {
  it("has tables generated from the assembler", () => {
    const existing = readFileSync(DOCUMENT, "utf8");
    let text = existing;

    for (const section of Object.keys(NUCLEUS_SECTIONS) as NucleusSection[]) {
      const rows = NUCLEUS_LOWERING.filter((s) => s.section === section).map((shape) => {
        const bytes = assemble(shape.mnemonics).length;
        const sequence = shape.mnemonics.map((m) => `\`${m}\``).join(" / ");
        const given = shape.given === undefined ? "—" : shape.given;
        return `| ${shape.construct} | ${sequence} | ${bytes} | ${given} |`;
      });
      const table = [
        "| Construct | Sequence | Bytes | Given |",
        "| --- | --- | --- | --- |",
        ...rows,
      ].join("\n");

      const begin = BEGIN(section);
      const start = text.indexOf(begin);
      expect(start, `${DOCUMENT} has no ${begin} marker`).toBeGreaterThanOrEqual(0);
      const from = start + begin.length;
      const to = text.indexOf(END, from);
      text = `${text.slice(0, from)}\n${table}\n${text.slice(to)}`;
    }

    if (process.env.UPDATE_NUCLEUS === "1") {
      writeFileSync(DOCUMENT, text, "utf8");
      console.log(`wrote ${DOCUMENT}`);
      return;
    }
    expect(existing).toBe(text);
  });
});
