import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * The name hashes, checked against Candlemoth's own identifiers.
 *
 * Names are two sixteen-bit hashes and nothing else — the spellings are gone,
 * and 9,920 bytes of name storage became 4,352. **The scheme is not sound.**
 * Two identifiers whose hashes both agree become the same name, and with no
 * spellings the compiler cannot tell. That is a silent miscompile.
 *
 * This test covers the one input the compiler must handle to exist at all. It
 * cannot cover arbitrary level-0 source, and nothing can.
 */

const SOURCES = [
  "candlemoth/tokenizer.lafy",
  "candlemoth/expression.lafy",
  "candlemoth/symbols.lafy",
  "candlemoth/statement.lafy",
  "candlemoth/runtime.lafy",
];

/**
 * The multiplier `mixName` actually computes, read out of its recurrence.
 *
 * Reading the declared constant instead is what let the recurrence drift to
 * 130 while the constant said 131 and this test stayed green — it validated an
 * algorithm the compiler did not run. The recurrence is the algorithm, so the
 * recurrence is what gets read.
 *
 * `scanHashA * 32 - scanHashA` sums to 31; `scanHashB * 128 + scanHashB +
 * scanHashB + scanHashB` sums to 131.
 */
function recurrence(register: "scanHashA" | "scanHashB"): number {
  const text = readFileSync("candlemoth/tokenizer.lafy", "utf8");
  const body = /^sub mixName\(value as u8\)\n([\s\S]*?)\n^end/m.exec(text);
  expect(body, "mixName is not defined").not.toBeNull();

  const line = body![1]
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, "").trim())
    .find((l) => l.startsWith(`${register} =`));
  expect(line, `${register} is not assigned in mixName`).toBeDefined();

  // The scanned byte must be mixed in, or the hash ignores the name entirely.
  expect(line, `${register} does not mix in the byte`).toContain("u16(value)");

  let total = 0;
  let terms = 0;
  const rhs = line!.slice(line!.indexOf("=") + 1);
  const pattern = new RegExp(`([+-])?\\s*${register}(?:\\s*\\*\\s*(\\d+))?`, "g");
  for (const term of rhs.matchAll(pattern)) {
    const sign = term[1] === "-" ? -1 : 1;
    total += sign * (term[2] === undefined ? 1 : Number(term[2]));
    terms += 1;
  }
  expect(terms, `${register} appears in no term`).toBeGreaterThan(0);
  return total;
}

/** The declared constants, which must agree with the recurrences. */
function declared(): { a: number; b: number } {
  const text = readFileSync("candlemoth/tokenizer.lafy", "utf8");
  const a = /^const hashMultiplierA as u16 = (\d+)/m.exec(text);
  const b = /^const hashMultiplierB as u16 = (\d+)/m.exec(text);
  expect(a, "hashMultiplierA is not declared").not.toBeNull();
  expect(b, "hashMultiplierB is not declared").not.toBeNull();
  return { a: Number(a![1]), b: Number(b![1]) };
}

function multipliers(): { a: number; b: number } {
  return { a: recurrence("scanHashA"), b: recurrence("scanHashB") };
}

function hash(word: string, multiplier: number): number {
  let value = 0;
  for (const ch of word) value = (value * multiplier + ch.charCodeAt(0)) & 0xffff;
  return value;
}

function identifiers(): string[] {
  const found = new Set<string>();
  for (const path of SOURCES) {
    const text = readFileSync(path, "utf8")
      .split("\n")
      .map((l) => l.replace(/\/\/.*$/, ""))
      .join("\n");
    for (const m of text.matchAll(/\b[A-Za-z][A-Za-z0-9]*\b/g)) {
      found.add(m[0].toLowerCase()); // case folds at intern time
    }
  }
  return [...found].sort();
}

describe("the name hashes", () => {
  const { a, b } = multipliers();
  const names = identifiers();

  it("computes the multipliers it declares", () => {
    // The check that would have caught the 130-against-131 drift. The
    // constants are documentation; the recurrence is the algorithm.
    expect({ a, b }).toEqual(declared());
  });

  it("gives every Candlemoth identifier a distinct pair", () => {
    const seen = new Map<string, string>();
    const collisions: string[] = [];
    for (const name of names) {
      const key = `${hash(name, a)}:${hash(name, b)}`;
      const previous = seen.get(key);
      if (previous !== undefined) collisions.push(`${previous} / ${name}`);
      seen.set(key, name);
    }
    console.log(`${names.length} case-folded identifiers, ${collisions.length} collisions`);
    expect(collisions).toEqual([]);
  });

  it("needs both hashes, because one is not enough", () => {
    // The measurement that decided the pair: a single sixteen-bit hash
    // collides over these very identifiers.
    for (const multiplier of [a, b]) {
      const seen = new Set<number>();
      let collisions = 0;
      for (const name of names) {
        const value = hash(name, multiplier);
        if (seen.has(value)) collisions += 1;
        seen.add(value);
      }
      expect(collisions).toBeGreaterThan(0);
    }
  });

  it("fits the declared name table", () => {
    const text = readFileSync("candlemoth/tokenizer.lafy", "utf8");
    const limit = Number(/^const nameLimit as u16 = (\d+)/m.exec(text)![1]);
    expect(names.length).toBeLessThanOrEqual(limit);
  });
});
