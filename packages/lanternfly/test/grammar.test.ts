import { readFileSync, writeFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { buildReport } from "../src/grammar/report.js";

/**
 * Stage A and B of `docs/level0-parser-study.md`.
 *
 * The grammar is frozen against the generated report: change the grammar
 * without regenerating and this fails, so no report can silently describe an
 * older grammar. The analyzer must also fail on an unexplained conflict — a
 * collision with no declared predicate — because the study forbids making the
 * report green by transformation.
 */

const GRAMMAR = "candlemoth/level0.grammar";
const REPORT = "docs/level0-grammar-report.md";
const NUCLEUS = "candlemoth/nucleus.grammar";
const NUCLEUS_REPORT = "docs/nucleus/grammar-report.md";
const TOKENIZER = "candlemoth/tokenizer.lafy";
const PARSERS = [
  "candlemoth/expression.lafy",
  "candlemoth/symbols.lafy",
  "candlemoth/statement.lafy",
];

const built = buildReport(GRAMMAR, TOKENIZER, PARSERS, {
  title: "Level Zero grammar report",
  grammarPath: GRAMMAR,
});

describe("the canonical grammar", () => {
  it("is frozen against the generated report", () => {
    if (process.env.UPDATE_GRAMMAR === "1") {
      writeFileSync(REPORT, built.text, "utf8");
      console.log(`wrote ${REPORT}`);
      return;
    }
    expect(readFileSync(REPORT, "utf8")).toBe(built.text);
  });

  it("is not left-recursive", () => {
    // The canonical grammar uses EBNF repetition at each left-associative
    // level, so it is left-associative without being left-recursive. An LR
    // candidate may use natural left recursion instead; that belongs to a
    // named candidate with a visible diff.
    expect(built.analysis.cycles).toEqual([]);
  });

  it("has no unreachable or unproductive nonterminal", () => {
    expect(built.analysis.unreachable).toEqual([]);
    expect(built.analysis.unproductive).toEqual([]);
  });

  it("has no LL(1) collision without a declared predicate", () => {
    const unexplained = built.analysis.collisions.filter((c) => c.predicates.length === 0);
    const described = unexplained.map(
      (c) => `${c.nonterminal} on ${c.lookahead} (${c.kind})`,
    );
    expect(described).toEqual([]);
  });

  it("accounts for every production Candlemoth uses", () => {
    const unused = built.analysis.grammar.productions.filter((p) => !p.uses);
    // The boundary rule says a form is in Level Zero when the source uses it,
    // so an unused production in the canonical grammar is a boundary error.
    expect(unused.map((p) => p.name)).toEqual([]);
  });
});

describe("the token audit", () => {
  it("names every terminal the grammar uses", () => {
    expect(built.audit.missing).toEqual([]);
  });

  it("recognises no token the grammar does not name", () => {
    // Stage A found four: `to` and `record` as keywords, and `.` and `:` as
    // punctuation. `to` was still consulted by `parseFor` after the Level
    // Zero ruling removed `for ... to`; the other three were never consulted
    // at all. All four are gone, and this fails if one returns.
    expect(built.audit.stale).toEqual([]);
  });
});

/**
 * The nucleus grammar, held to the same gates as Level Zero.
 *
 * `uses` is `no` throughout, because no nucleus source exists yet. The
 * "accounts for every production" gate therefore does not apply until it does,
 * and its absence here is deliberate rather than an oversight.
 */
describe("the nucleus grammar", () => {
  const nucleus = buildReport(NUCLEUS, TOKENIZER, PARSERS, {
    title: "Nucleus grammar report",
    grammarPath: NUCLEUS,
    coverageNote:
      "**Draft.** No nucleus source exists, so every production reports `uses: no` " +
      "and the coverage figure below is zero by construction rather than by " +
      "measurement. The grammar is also known to omit admitted forms — see " +
      "`docs/nucleus/review-actions.md`.",
  });

  it("is frozen against its generated report", () => {
    if (process.env.UPDATE_GRAMMAR === "1") {
      writeFileSync(NUCLEUS_REPORT, nucleus.text, "utf8");
      console.log(`wrote ${NUCLEUS_REPORT}`);
      return;
    }
    expect(readFileSync(NUCLEUS_REPORT, "utf8")).toBe(nucleus.text);
  });

  it("is not left-recursive", () => {
    expect(nucleus.analysis.cycles).toEqual([]);
  });

  it("has no unreachable or unproductive nonterminal", () => {
    expect(nucleus.analysis.unreachable).toEqual([]);
    expect(nucleus.analysis.unproductive).toEqual([]);
  });

  it("has one contextual decision and no unexplained conflict", () => {
    const unexplained = nucleus.analysis.collisions.filter((c) => c.predicates.length === 0);
    expect(unexplained).toEqual([]);
    // A name at statement head is an assignment or a call. Level Zero has a
    // second decision — a name in a primary is a call or a conversion — and
    // the nucleus does not, because expressions contain neither.
    expect(nucleus.analysis.collisions).toHaveLength(1);
    expect(nucleus.analysis.collisions[0].nonterminal).toBe("simple-statement");
  });

  it("is materially smaller than Level Zero", () => {
    const level0 = built.analysis.grammar;
    const n = nucleus.analysis.grammar;
    expect(n.productions.length).toBeLessThan(level0.productions.length);
    expect(n.rules.length).toBeLessThan(level0.rules.length);
    console.log(
      `productions ${level0.productions.length} -> ${n.productions.length}, ` +
        `bnf rules ${level0.rules.length} -> ${n.rules.length}, ` +
        `nonterminals ${level0.nonterminals.size} -> ${n.nonterminals.size}`,
    );
  });
});

/**
 * The lexical invariant both grammars depend on.
 *
 * `statement-list` is `{ statement }` with no `NEWLINE` alternative — the
 * repair for a FIRST/FOLLOW collision — and that is only correct because the
 * tokenizer collapses a run of consecutive newlines into one boundary token.
 * The dependency runs from a grammar file to a source file, so nothing else
 * would catch its removal.
 */
describe("the newline-collapse invariant", () => {
  const tokenizer = readFileSync(TOKENIZER, "utf8");

  it("the tokenizer collapses consecutive newlines into one boundary", () => {
    // `nextToken`'s classNewline arm skips further newlines before yielding a
    // single kindNewline.
    expect(tokenizer).toMatch(/while characterClass\[nextByte\] = classNewline/);
    expect(tokenizer).toMatch(/tokenKind = kindNewline/);
  });

  it("neither grammar admits NEWLINE inside a statement list", () => {
    // If one does, the collision returns and this test is the reminder why.
    for (const path of [GRAMMAR, NUCLEUS]) {
      const grammar = readFileSync(path, "utf8");
      const production = /production statement-list[\s\S]*?ebnf\s+(.*)/.exec(grammar);
      expect(production, `${path} has no statement-list`).not.toBeNull();
      expect(production![1].trim()).toBe("{ statement }");
    }
  });
});
