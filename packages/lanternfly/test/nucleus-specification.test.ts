import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { analyze, type Production } from "../src/grammar/analyze.js";

const SPECIFICATION = "docs/nucleus/specification.md";
const text = readFileSync(SPECIFICATION, "utf8");

const predicates: Readonly<Record<string, readonly string[]>> = {
  "simple-statement": ["isCallableName", "isWritableName"],
  "local-initializer": ["isFailableCallableName"],
  "assignment-source": ["isFailableCallableName"],
  "return-source": ["isFailableCallableName"],
  "type-atom": ["isRecordTypeName"],
  "program-initializer": ["isInitializerForDeclaredType"],
  "on-error-clause": ["isFailablePrecedingStatement"],
  expression: ["isInfallibleCallableName"],
  "step-constant": ["isIntegerConstantName"],
  "routine-definition-tail": ["isIncompleteForwardName"],
  "const-declaration": ["isConstantContext"],
};

function specificationGrammar(): readonly Production[] {
  const section =
    /### 17\.2 Syntactic grammar\n\n```text\n([\s\S]*?)\n```/.exec(text);
  if (!section) throw new Error("Chapter 17 syntactic grammar not found");

  const lines = section[1].split("\n");
  const productions: Production[] = [];
  let name: string | undefined;
  let rhs: string[] = [];

  const flush = () => {
    if (name === undefined) return;
    productions.push({
      name,
      source: "Nucleus 0.1 specification Chapter 17",
      uses: true,
      predicates: predicates[name] ?? [],
      example: "",
      ebnf: rhs.join(" "),
    });
  };

  for (let index = 0; index < lines.length; index += 1) {
    const candidate = lines[index].trim();
    const next = lines[index + 1]?.trim() ?? "";
    if (/^[a-z][a-z0-9-]*$/.test(candidate) && next.startsWith("::=")) {
      flush();
      name = candidate;
      rhs = [];
      continue;
    }
    if (name === undefined || candidate === "") continue;
    rhs.push(candidate.replace(/^::=\s*/, ""));
  }
  flush();
  return productions;
}

const analysis = analyze(specificationGrammar());

describe("the normative Nucleus 0.1 grammar", () => {
  it("has no left recursion, unreachable rule, or unproductive rule", () => {
    expect(analysis.cycles).toEqual([]);
    expect(analysis.unreachable).toEqual([]);
    expect(analysis.unproductive).toEqual([]);
  });

  it("has only the four declared name-led LL(1) conflicts", () => {
    expect(
      analysis.collisions.map((collision) => ({
        nonterminal: collision.nonterminal,
        lookahead: collision.lookahead,
        predicates: collision.predicates,
      })),
    ).toEqual([
      {
        nonterminal: "assignment-source",
        lookahead: "NAME",
        predicates: ["isFailableCallableName"],
      },
      {
        nonterminal: "local-initializer",
        lookahead: "NAME",
        predicates: ["isFailableCallableName"],
      },
      {
        nonterminal: "return-source",
        lookahead: "NAME",
        predicates: ["isFailableCallableName"],
      },
      {
        nonterminal: "simple-statement",
        lookahead: "NAME",
        predicates: ["isCallableName", "isWritableName"],
      },
    ]);
  });

  it("keeps forward bodies predictive after sub NAME", () => {
    expect(text).toContain(
      "routine-definition-tail\n    ::= routine-signature-tail NEWLINE routine-body\n      | NEWLINE routine-body",
    );
    expect(text).toContain("`isIncompleteForwardName`");
  });

  it("records exact case identity and the external manifest boundary", () => {
    expect(text).toContain(
      "Identifiers are case-sensitive and preserve their source spelling.",
    );
    expect(text).toContain(
      "A reserved word is recognized only in the canonical lowercase spelling",
    );
    expect(text).toContain("#### 4.3.1 Flat source manifest");
    expect(text).not.toMatch(
      /case-insensitive exact names|ASCII-folded identity/,
    );
  });

  it("reports the analyzed grammar dimensions in Chapter 17", () => {
    expect(text).toContain(
      `expanded the grammar above to ${analysis.grammar.rules.length} BNF rules over ${analysis.grammar.nonterminals.size} nonterminals`,
    );
  });
});
