import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { analyze, type Production } from "../src/grammar-analysis.js";

const text = readFileSync(
  new URL("../docs/specification.md", import.meta.url),
  "utf8",
);

const predicates: Readonly<Record<string, readonly string[]>> = {
  "simple-statement": ["isCallableName", "isWritableName"],
  "local-initializer": ["isInitializerForDeclaredType"],
  "static-initializer": ["isInitializerForDeclaredType"],
  "type-atom": ["isRecordTypeName"],
  "program-initializer": ["isInitializerForDeclaredType"],
  "on-error-clause": ["isFailablePrecedingStatement"],
  expression: ["isCallableName"],
  "or-expression": ["isFailurePropagationBoundary"],
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

  it("has only the declared predicate-resolved LL(1) conflicts", () => {
    expect(
      analysis.collisions.map((collision) => ({
        nonterminal: collision.nonterminal,
        lookahead: collision.lookahead,
        predicates: collision.predicates,
      })),
    ).toEqual([
      {
        nonterminal: "local-initializer",
        lookahead: "(",
        predicates: ["isInitializerForDeclaredType"],
      },
      {
        nonterminal: "or-expression·rep26",
        lookahead: "or",
        predicates: ["isFailurePropagationBoundary"],
      },
      {
        nonterminal: "simple-statement",
        lookahead: "NAME",
        predicates: ["isCallableName", "isWritableName"],
      },
      {
        nonterminal: "static-initializer",
        lookahead: "(",
        predicates: ["isInitializerForDeclaredType"],
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

  it("records aggregate storage, copying, and transient results", () => {
    expect(text).toContain(
      "An aggregate local with no initializer or with a structured initializer creates one routine-private object",
    );
    expect(text).toContain(
      "Aggregate assignment requires a mutable aggregate destination and an aggregate source of the exact same type",
    );
    expect(text).toContain(
      "The caller must consume a returned aggregate alias immediately",
    );
    expect(text).toContain(
      'record-initializer\n    ::= "(" static-initializer',
    );
    expect(text).toContain(
      "every aggregate storage path, alias binding, and transient aggregate-alias result denotes program-lifetime storage",
    );
    expect(text).not.toContain("unprovable aggregate-result lifetime");
  });

  it("keeps counted-loop counters local and read-only", () => {
    expect(text).toContain(
      "The counter name must resolve to a scalar local of type `u8` or `u16`",
    );
    expect(text).toContain(
      "A nested counted loop cannot reuse the same local as its counter",
    );
    expect(text).toContain(
      "A scalar local serving as an active counted-loop counter is read-only and cannot be the error destination",
    );
    expect(text).not.toContain(
      "If the body changes the counter, the increment and next test use the changed value",
    );
  });

  it("reports the analyzed grammar dimensions in Chapter 17", () => {
    expect(text).toContain(
      `expanded the grammar above to ${analysis.grammar.rules.length} BNF rules over ${analysis.grammar.nonterminals.size} nonterminals`,
    );
  });
});
