import { readFileSync } from "node:fs";

import { assembleSource } from "./assemble.js";
import {
  LOWERING,
  SECTION_TITLES,
  type Section,
  displayName,
} from "./lowering-manifest.js";

/**
 * Generates `docs/level0-lowering.md`'s tables from the manifest.
 *
 * Review finding 28: the document held a third copy of the sequences, so it
 * could drift from both the source and the tests without anything failing.
 * Its tables are now generated between markers, the prose around them stays
 * hand-written, and `test/lowering-doc.test.ts` fails when the checked-in
 * document no longer matches.
 */

export const BEGIN = (section: string) => `<!-- generated:${section} -->`;
export const END = "<!-- /generated -->";

function byteCount(mnemonics: readonly string[]): number {
  const text = [".org $0000", "Start:", ...mnemonics.map((m) => `    ${m}`)].join("\n");
  return assembleSource(`${text}\n`).bytes.length;
}

export function renderSection(section: Section): string {
  const rows = LOWERING.filter((shape) => shape.section === section).map((shape) => {
    // `$1234` is a hole fixed later and reads as `nn`; a literal
    // operand is shown as the literal it is.
    const sequence = shape.mnemonics
      .map((m) => `\`${m.replace(/\$1234/g, "nn").replace(/\$0*([0-9a-fA-F]+)/g, (_, digits) => String(parseInt(digits, 16)))}\``)
      .join(" / ");
    return `| ${shape.construct} | ${sequence} | ${byteCount(shape.mnemonics)} |`;
  });
  return [
    "| Construct | Sequence | Bytes |",
    "| --- | --- | --- |",
    ...rows,
  ].join("\n");
}

/** Replaces every marked region in the document with freshly rendered text. */
export function renderDocument(existing: string): string {
  let text = existing;
  for (const section of Object.keys(SECTION_TITLES) as Section[]) {
    const begin = BEGIN(section);
    const start = text.indexOf(begin);
    if (start < 0) throw new Error(`document has no ${begin} marker`);
    const from = start + begin.length;
    const to = text.indexOf(END, from);
    if (to < 0) throw new Error(`${begin} has no closing marker`);
    text = `${text.slice(0, from)}\n${renderSection(section)}\n${text.slice(to)}`;
  }
  return text;
}

export function documentFrom(path: string): string {
  return renderDocument(readFileSync(path, "utf8"));
}

/** Every shape's display name, for a coverage claim the document can state. */
export function shapeNames(): readonly string[] {
  return LOWERING.map(displayName);
}
