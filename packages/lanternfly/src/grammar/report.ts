import { readFileSync } from "node:fs";

import { EPSILON, END, type Analysis, analyze, readGrammar, shortestWitness } from "./analyze.js";

/**
 * The generated Stage A and B report.
 *
 * Everything here is derived. Nothing is asserted by hand, so a claim in the
 * report cannot outlive the grammar it came from.
 */

export interface TokenAudit {
  readonly keywords: readonly string[];
  readonly puncts: readonly string[];
  /** Tokens the tokenizer recognises that no production names. */
  readonly stale: readonly { token: string; note: string }[];
  /** Terminals the grammar names that the tokenizer cannot produce. */
  readonly missing: readonly string[];
}

const PUNCT_SPELLING: Record<string, string> = {
  punctLeftParen: "(",
  punctRightParen: ")",
  punctLeftBracket: "[",
  punctRightBracket: "]",
  punctComma: ",",
  punctDot: ".",
  punctColon: ":",
  punctPlus: "+",
  punctMinus: "-",
  punctStar: "*",
  punctSlash: "/",
  punctEqual: "=",
  punctNotEqual: "<>",
  punctLess: "<",
  punctLessEqual: "<=",
  punctGreater: ">",
  punctGreaterEqual: ">=",
};

export function auditTokens(
  tokenizerPath: string,
  parserPaths: readonly string[],
  analysis: Analysis,
): TokenAudit {
  const tokenizer = readFileSync(tokenizerPath, "utf8");
  const parsers = parserPaths.map((p) => readFileSync(p, "utf8")).join("\n");

  // Keyword spellings come from the installed table rather than the enum, so
  // the audit reports what the tokenizer can actually recognise.
  const textMatch = /const keywordText as u8\[keywordTextBytes\] = \[([\s\S]*?)\]/.exec(tokenizer)!;
  const startMatch = /const keywordStart as u16\[keywordCount\] = \[([\s\S]*?)\]/.exec(tokenizer)!;
  const sizeMatch = /const keywordSize as u8\[keywordCount\] = \[([\s\S]*?)\]/.exec(tokenizer)!;
  const bytes = [...textMatch[1].matchAll(/\d+/g)].map((m) => Number(m[0]));
  const starts = [...startMatch[1].matchAll(/\d+/g)].map((m) => Number(m[0]));
  const sizes = [...sizeMatch[1].matchAll(/\d+/g)].map((m) => Number(m[0]));

  const keywords: string[] = [];
  for (const [at, start] of starts.entries()) {
    const word = bytes
      .slice(start, start + sizes[at])
      .map((b) => String.fromCharCode(b))
      .join("");
    if (word !== "") keywords.push(word);
  }

  // Punctuation from the enum. An earlier version read the body of
  // `scanPunct`, and its non-greedy match stopped at the first nested `end`,
  // so it saw a fraction of the arms and reported the rest as unproduced.
  const punctEnum = /^enum Punct as u8\n([\s\S]*?)^end/m.exec(tokenizer)![1];
  const punctNames = punctEnum
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "" && !l.startsWith("//") && l !== "punctNone");
  const puncts = punctNames.map((p) => PUNCT_SPELLING[p] ?? p).sort();

  const terminals = analysis.grammar.terminals;
  const stale: { token: string; note: string }[] = [];

  for (const word of keywords) {
    if (terminals.has(word)) continue;
    const consulted = new RegExp(`keyword${word[0].toUpperCase()}${word.slice(1)}\\b`).test(parsers);
    stale.push({
      token: `"${word}"`,
      note: consulted
        ? "recognised and still consulted by the parser, though no production names it"
        : "recognised and never consulted",
    });
  }
  for (const punct of puncts) {
    if (terminals.has(punct)) continue;
    const name = Object.entries(PUNCT_SPELLING).find(([, s]) => s === punct)?.[0] ?? "";
    const consulted = name !== "" && new RegExp(`\\b${name}\\b`).test(parsers);
    stale.push({
      token: `"${punct}"`,
      note: consulted ? "recognised and still consulted" : "recognised and never consulted",
    });
  }

  const produced = new Set<string>([...keywords, ...puncts, "NAME", "NUMBER", "NEWLINE", "EOF"]);
  const missing = [...terminals].filter((t) => !produced.has(t)).sort();

  return { keywords, puncts, stale, missing };
}

function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  return [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");
}

export interface ReportIdentity {
  /** Document title. */
  readonly title: string;
  /** The grammar file it was generated from. */
  readonly grammarPath: string;
  /** Stated where production coverage would otherwise imply a source exists. */
  readonly coverageNote?: string;
}

export function renderReport(
  analysis: Analysis,
  audit: TokenAudit,
  identity: ReportIdentity,
): string {
  const g = analysis.grammar;
  const canonical = g.productions;
  const out: string[] = [];

  out.push(`# ${identity.title}`);
  out.push("");
  out.push(
    `GENERATED from \`${identity.grammarPath}\` by \`npm run generate:grammar\`. ` +
      "Stage A and stage B of `docs/level0-parser-study.md`. Every figure below is " +
      "derived; nothing is asserted by hand.",
  );
  if (identity.coverageNote !== undefined) {
    out.push("");
    out.push(identity.coverageNote);
  }
  out.push("");
  out.push("## Summary");
  out.push("");
  out.push(
    table(
      ["Measure", "Value"],
      [
        ["Canonical productions", String(canonical.length)],
        ["BNF rules after mechanical expansion", String(g.rules.length)],
        ["Nonterminals", String(g.nonterminals.size)],
        ["Terminals", String(g.terminals.size)],
        ["Left-recursion cycles", String(analysis.cycles.length)],
        ["LL(1) collisions", String(analysis.collisions.length)],
        ["Unreachable nonterminals", String(analysis.unreachable.length)],
        ["Unproductive nonterminals", String(analysis.unproductive.length)],
        ["Productions Candlemoth uses", `${canonical.filter((p) => p.uses).length} of ${canonical.length}`],
      ],
    ),
  );
  out.push("");

  out.push("## Left recursion");
  out.push("");
  out.push(
    "Computed from a left-corner graph that follows nullable prefixes, then " +
      "reported as strongly connected components. A textual search for a production " +
      "beginning with its own name would miss every indirect case.",
  );
  out.push("");
  if (analysis.cycles.length === 0) {
    out.push("No cycle. The canonical grammar is not left-recursive.");
  } else {
    for (const cycle of analysis.cycles) {
      out.push(`- ${cycle.members.join(" → ")}`);
    }
  }
  out.push("");

  out.push("## LL(1) collisions");
  out.push("");
  if (analysis.collisions.length === 0) {
    out.push("None.");
  } else {
    out.push(
      "Each row is one prediction cell with more than one rule. A collision with a " +
        "declared predicate is a contextual decision the parser must make from the " +
        "symbol table; a collision with none is an unexplained conflict.",
    );
    out.push("");
    out.push(
      table(
        ["Nonterminal", "Lookahead", "Kind", "Rules", "Predicate", "Witness"],
        analysis.collisions.map((c) => {
          const witness = c.rules
            .map((r) => shortestWitness(g, r.rhs[0] ?? EPSILON)?.join(" ") ?? "—")
            .join(" / ");
          return [
            `\`${c.nonterminal}\``,
            `\`${c.lookahead}\``,
            c.kind,
            c.rules.map((r) => `${r.rhs.join(" ") || EPSILON}`).join(" · ").replace(/\|/g, "\\|"),
            c.predicates.length > 0 ? c.predicates.join(", ") : "**none**",
            witness.replace(/\|/g, "\\|"),
          ];
        }),
      ),
    );
  }
  out.push("");

  out.push("## Unreachable and unproductive");
  out.push("");
  out.push(
    analysis.unreachable.length === 0
      ? "Every nonterminal is reachable from the start symbol."
      : `Unreachable: ${analysis.unreachable.map((n) => `\`${n}\``).join(", ")}`,
  );
  out.push("");
  out.push(
    analysis.unproductive.length === 0
      ? "Every nonterminal derives a terminal string."
      : `Unproductive: ${analysis.unproductive.map((n) => `\`${n}\``).join(", ")}`,
  );
  out.push("");

  out.push("## Token audit");
  out.push("");
  out.push(
    `The tokenizer installs ${audit.keywords.length} keyword spellings and ` +
      `${audit.puncts.length} punctuation forms. Unused tokens are not free: each one ` +
      "occupies arena bytes, an index-table row and a scanner arm.",
  );
  out.push("");
  if (audit.stale.length === 0) {
    out.push("No stale token: every token the tokenizer recognises appears in the grammar.");
  } else {
    out.push(
      table(
        ["Token", "Status"],
        audit.stale.map((s) => [`\`${s.token}\``, s.note]),
      ),
    );
  }
  out.push("");
  if (audit.missing.length > 0) {
    out.push(
      `**Terminals the grammar names that the tokenizer cannot produce:** ` +
        `${audit.missing.map((t) => `\`${t}\``).join(", ")}`,
    );
    out.push("");
  }

  out.push("## Productions");
  out.push("");
  out.push(
    table(
      ["Production", "Used", "Predicate", "Source"],
      canonical.map((p) => [
        `\`${p.name}\``,
        p.uses ? "yes" : "**no**",
        p.predicates.length > 0 ? p.predicates.join(", ") : "—",
        p.source,
      ]),
    ),
  );
  out.push("");

  out.push("## FIRST and FOLLOW");
  out.push("");
  out.push(
    table(
      ["Nonterminal", "Nullable", "FIRST", "FOLLOW"],
      canonical.map((p) => {
        const show = (set: Set<string> | undefined) =>
          set === undefined || set.size === 0
            ? "—"
            : [...set]
                .sort()
                .map((t) => `\`${t}\``)
                .join(" ")
                .replace(/\|/g, "\\|");
        return [
          `\`${p.name}\``,
          analysis.nullable.has(p.name) ? "yes" : "no",
          show(analysis.first.get(p.name)),
          show(analysis.follow.get(p.name)),
        ];
      }),
    ),
  );
  out.push("");
  out.push(`\`${END}\` is end of input; \`${EPSILON}\` is the empty string.`);
  out.push("");

  return out.join("\n");
}

export function buildReport(
  grammarPath: string,
  tokenizerPath: string,
  parserPaths: readonly string[],
  identity: ReportIdentity,
) {
  const analysis = analyze(readGrammar(grammarPath));
  const audit = auditTokens(tokenizerPath, parserPaths, analysis);
  return { analysis, audit, text: renderReport(analysis, audit, identity) };
}
