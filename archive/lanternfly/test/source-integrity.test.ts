import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * Structural integrity of the Lanternfly source.
 *
 * Nothing compiles the `.lafy` files, so a whole class of damage passes every
 * other gate. A name-resolution scan checks that identifiers resolve; it says
 * nothing about a routine defined twice, a body fragment left detached by a
 * mis-anchored edit, or a `forward sub` that never received one.
 *
 * All of those happened. This is the cheap check that would have caught them
 * the moment they were introduced.
 */

const SOURCES = [
  "candlemoth/tokenizer.lafy",
  "candlemoth/expression.lafy",
  "candlemoth/symbols.lafy",
  "candlemoth/statement.lafy",
  "candlemoth/runtime.lafy",
];

interface Source {
  readonly path: string;
  readonly lines: readonly string[];
}

function read(): Source[] {
  return SOURCES.map((path) => ({
    path,
    lines: readFileSync(path, "utf8").split("\n"),
  }));
}

/** A top-level line that opens a block, and the keyword it opens with. */
const OPENS = /^(sub|enum|record)\b/;
/** A top-level line that is a complete declaration on its own. */
const DECLARES = /^(const|var|forward)\b/;

describe("every routine is defined exactly once", () => {
  it("has no duplicate body", () => {
    const seen = new Map<string, string[]>();
    for (const { path, lines } of read()) {
      for (const [at, line] of lines.entries()) {
        const found = /^sub (\w+)\s*\(/.exec(line);
        if (!found) continue;
        const where = `${path}:${at + 1}`;
        seen.set(found[1], [...(seen.get(found[1]) ?? []), where]);
      }
    }
    const duplicated = [...seen]
      .filter(([, places]) => places.length > 1)
      .map(([name, places]) => `${name} at ${places.join(" and ")}`);
    expect(duplicated).toEqual([]);
  });

  it("gives every forward declaration exactly one body", () => {
    const bodies = new Set<string>();
    const forwards = new Map<string, string>();
    for (const { path, lines } of read()) {
      for (const [at, line] of lines.entries()) {
        const body = /^sub (\w+)\s*\(/.exec(line);
        if (body) bodies.add(body[1]);
        const forward = /^forward sub (\w+)\s*\(/.exec(line);
        if (forward) forwards.set(forward[1], `${path}:${at + 1}`);
      }
    }
    const orphaned = [...forwards]
      .filter(([name]) => !bodies.has(name))
      .map(([name, where]) => `${name} declared at ${where}, never defined`);
    expect(orphaned).toEqual([]);
  });

  it("declares each routine forward at most once across the whole unit", () => {
    // The five files are one compilation unit, so a name declared forward in
    // two of them is a duplicate. Checking each file separately missed that.
    const seen = new Map<string, string>();
    const repeated: string[] = [];
    for (const { path, lines } of read()) {
      for (const [at, line] of lines.entries()) {
        const found = /^forward sub (\w+)\s*\(/.exec(line);
        if (!found) continue;
        const where = `${path}:${at + 1}`;
        const previous = seen.get(found[1]);
        if (previous !== undefined) {
          repeated.push(`${found[1]} at ${previous} and ${where}`);
        }
        seen.set(found[1], where);
      }
    }
    expect(repeated).toEqual([]);
  });
});

describe("no statement is detached from a routine", () => {
  it("has nothing at top level but declarations and blocks", () => {
    const detached: string[] = [];

    for (const { path, lines } of read()) {
      let depth = 0;
      let inArray = false;

      for (const [at, raw] of lines.entries()) {
        const line = raw.replace(/\/\/.*$/, "").trimEnd();
        const text = line.trim();
        if (text === "") continue;

        // A constant array literal spans lines until its closing bracket.
        if (inArray) {
          if (text === "]" || text.endsWith("]")) inArray = false;
          continue;
        }

        if (depth === 0) {
          if (DECLARES.test(text)) {
            // A constant array literal opens with a trailing `[`. Testing for
            // an unbalanced bracket instead misreads `CharClass[256] = [`,
            // which has both.
            if (text.endsWith("[")) inArray = true;
            continue;
          }
          if (OPENS.test(text)) {
            depth = 1;
            continue;
          }
          // Anything else outside a block is a fragment left behind.
          detached.push(`${path}:${at + 1}  ${text}`);
          continue;
        }

        if (/^(if|while|for|select)\b/.test(text)) depth += 1;
        if (text === "end") depth -= 1;
        if (depth < 0) {
          detached.push(`${path}:${at + 1}  unmatched end`);
          depth = 0;
        }
      }
      if (depth !== 0) detached.push(`${path}: ${depth} block(s) left open at end of file`);
      // An unterminated array literal swallows the rest of the file, so every
      // check after it silently passes. That is worse than the corruption it
      // would hide.
      if (inArray) detached.push(`${path}: an array literal is never closed`);
    }

    expect(detached).toEqual([]);
  });
});
