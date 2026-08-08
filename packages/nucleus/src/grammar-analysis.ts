import { readFileSync } from "node:fs";

/**
 * Grammar analysis for the Nucleus specification and related research.
 *
 * It reads an EBNF grammar, expands it mechanically into BNF,
 * computes nullable, FIRST and FOLLOW to a fixed point, finds left recursion
 * through a left-corner graph that accounts for nullable prefixes, builds an
 * LL(1) prediction table and reports every collision.
 *
 * It performs no transformation to make the report clean. It does not
 * left-factor, does not eliminate left recursion, does not reorder
 * alternatives and does not insert predicates. Those belong to named
 * candidate grammars with a visible diff from the canonical file.
 */

export const EPSILON = "ε";
export const END = "⊣";

export interface Production {
  readonly name: string;
  readonly source: string;
  readonly uses: boolean;
  readonly predicates: readonly string[];
  readonly example: string;
  readonly ebnf: string;
}

/** One BNF alternative: a nonterminal and the symbols it expands to. */
export interface Rule {
  readonly lhs: string;
  readonly rhs: readonly string[];
  /** The canonical production this came from, before expansion. */
  readonly origin: string;
}

export interface Grammar {
  readonly productions: readonly Production[];
  readonly rules: readonly Rule[];
  readonly nonterminals: ReadonlySet<string>;
  readonly terminals: ReadonlySet<string>;
  readonly start: string;
}

// ------------------------------------------------------------------ reading

export function readGrammar(path: string): readonly Production[] {
  const text = readFileSync(path, "utf8");
  const productions: Production[] = [];
  let current: { -readonly [K in keyof Production]?: Production[K] } = {};

  const flush = () => {
    if (current.name === undefined) return;
    if (current.ebnf === undefined)
      throw new Error(`${current.name}: no ebnf field`);
    productions.push({
      name: current.name,
      source: current.source ?? "",
      uses: current.uses ?? false,
      predicates: current.predicates ?? [],
      example: current.example ?? "",
      ebnf: current.ebnf,
    });
    current = {};
  };

  for (const raw of text.split("\n")) {
    const line = raw.replace(/^\s+/, "");
    if (line === "" || line.startsWith("#")) continue;

    const start = /^production\s+(\S+)$/.exec(line);
    if (start) {
      flush();
      current = { name: start[1] };
      continue;
    }
    const field = /^(source|uses|predicate|example|ebnf)\s+(.*)$/.exec(line);
    if (!field) throw new Error(`unreadable grammar line: ${raw}`);
    const [, key, value] = field;
    if (key === "source") current.source = value;
    if (key === "uses") current.uses = value.trim() === "yes";
    if (key === "example") current.example = value;
    if (key === "ebnf") current.ebnf = value;
    if (key === "predicate") {
      current.predicates =
        value.trim() === "-" ? [] : value.trim().split(/\s+/);
    }
  }
  flush();
  return productions;
}

// ---------------------------------------------------------------- expansion
//
// `{ x }` and `[ x ]` each become a fresh nonterminal with two alternatives,
// so the expansion is mechanical and reversible rather than a rewrite.

interface Token {
  readonly kind:
    "terminal" | "nonterminal" | "(" | ")" | "{" | "}" | "[" | "]" | "|";
  readonly text: string;
}

function lex(ebnf: string): Token[] {
  const tokens: Token[] = [];
  const pattern = /"([^"]*)"|([A-Za-z][A-Za-z0-9-]*)|([(){}[\]|])/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(ebnf)) !== null) {
    if (match[1] !== undefined)
      tokens.push({ kind: "terminal", text: match[1] });
    else if (match[2] !== undefined)
      tokens.push({ kind: "nonterminal", text: match[2] });
    else tokens.push({ kind: match[3] as Token["kind"], text: match[3] });
  }
  return tokens;
}

export function expand(productions: readonly Production[]): Grammar {
  const rules: Rule[] = [];
  let fresh = 0;

  const nextName = (origin: string, suffix: string) => {
    fresh += 1;
    return `${origin}·${suffix}${fresh}`;
  };

  /** Parses an alternation and returns the alternatives' symbol sequences. */
  function parseAlternation(
    tokens: Token[],
    at: number,
    origin: string,
    stop: string[],
  ): {
    alternatives: string[][];
    at: number;
  } {
    const alternatives: string[][] = [];
    let current: string[] = [];
    let index = at;

    while (index < tokens.length) {
      const token = tokens[index];
      if (stop.includes(token.kind)) break;

      if (token.kind === "|") {
        alternatives.push(current);
        current = [];
        index += 1;
        continue;
      }
      if (token.kind === "terminal" || token.kind === "nonterminal") {
        current.push(token.text);
        index += 1;
        continue;
      }
      if (token.kind === "{" || token.kind === "[" || token.kind === "(") {
        const closing =
          token.kind === "{" ? "}" : token.kind === "[" ? "]" : ")";
        const inner = parseAlternation(tokens, index + 1, origin, [closing]);
        index = inner.at + 1;

        if (token.kind === "(") {
          // A group with one alternative folds inline; more than one needs a
          // name so the alternation is preserved.
          if (inner.alternatives.length === 1) {
            current.push(...inner.alternatives[0]);
          } else {
            const name = nextName(origin, "group");
            for (const alternative of inner.alternatives) {
              rules.push({ lhs: name, rhs: alternative, origin });
            }
            current.push(name);
          }
          continue;
        }
        if (token.kind === "[") {
          const name = nextName(origin, "opt");
          for (const alternative of inner.alternatives) {
            rules.push({ lhs: name, rhs: alternative, origin });
          }
          rules.push({ lhs: name, rhs: [], origin });
          current.push(name);
          continue;
        }
        // `{ x }` is right-recursive by construction: rep → x rep | ε. That
        // preserves the repetition without introducing left recursion, which
        // matters because the left-recursion check must report only what the
        // canonical grammar actually contains.
        const name = nextName(origin, "rep");
        for (const alternative of inner.alternatives) {
          rules.push({ lhs: name, rhs: [...alternative, name], origin });
        }
        rules.push({ lhs: name, rhs: [], origin });
        current.push(name);
        continue;
      }
      throw new Error(`unexpected ${token.kind} in ${origin}`);
    }
    alternatives.push(current);
    return { alternatives, at: index };
  }

  for (const production of productions) {
    const tokens = lex(production.ebnf);
    const parsed = parseAlternation(tokens, 0, production.name, []);
    for (const alternative of parsed.alternatives) {
      rules.push({
        lhs: production.name,
        rhs: alternative,
        origin: production.name,
      });
    }
  }

  const nonterminals = new Set(rules.map((r) => r.lhs));
  const terminals = new Set<string>();
  for (const rule of rules) {
    for (const symbol of rule.rhs) {
      if (!nonterminals.has(symbol)) terminals.add(symbol);
    }
  }
  return {
    productions,
    rules,
    nonterminals,
    terminals,
    start: productions[0].name,
  };
}

// ------------------------------------------------------------- fixed points

export function nullableSet(g: Grammar): ReadonlySet<string> {
  const nullable = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const rule of g.rules) {
      if (nullable.has(rule.lhs)) continue;
      if (rule.rhs.every((s) => nullable.has(s))) {
        nullable.add(rule.lhs);
        changed = true;
      }
    }
  }
  return nullable;
}

export function firstSets(
  g: Grammar,
  nullable: ReadonlySet<string>,
): Map<string, Set<string>> {
  const first = new Map<string, Set<string>>();
  for (const nonterminal of g.nonterminals) first.set(nonterminal, new Set());
  for (const terminal of g.terminals) first.set(terminal, new Set([terminal]));

  let changed = true;
  while (changed) {
    changed = false;
    for (const rule of g.rules) {
      const target = first.get(rule.lhs)!;
      const before = target.size;
      for (const symbol of rule.rhs) {
        for (const t of first.get(symbol) ?? new Set<string>()) target.add(t);
        if (!nullable.has(symbol)) break;
      }
      if (target.size !== before) changed = true;
    }
  }
  return first;
}

/** FIRST of a symbol sequence, with EPSILON when the whole sequence is nullable. */
export function firstOf(
  sequence: readonly string[],
  first: ReadonlyMap<string, Set<string>>,
  nullable: ReadonlySet<string>,
): Set<string> {
  const result = new Set<string>();
  for (const symbol of sequence) {
    for (const t of first.get(symbol) ?? new Set<string>()) result.add(t);
    if (!nullable.has(symbol)) return result;
  }
  result.add(EPSILON);
  return result;
}

export function followSets(
  g: Grammar,
  first: ReadonlyMap<string, Set<string>>,
  nullable: ReadonlySet<string>,
): Map<string, Set<string>> {
  const follow = new Map<string, Set<string>>();
  for (const nonterminal of g.nonterminals) follow.set(nonterminal, new Set());
  follow.get(g.start)!.add(END);

  let changed = true;
  while (changed) {
    changed = false;
    for (const rule of g.rules) {
      for (const [at, symbol] of rule.rhs.entries()) {
        if (!g.nonterminals.has(symbol)) continue;
        const target = follow.get(symbol)!;
        const before = target.size;

        const rest = rule.rhs.slice(at + 1);
        const restFirst = firstOf(rest, first, nullable);
        for (const t of restFirst) if (t !== EPSILON) target.add(t);
        if (restFirst.has(EPSILON)) {
          for (const t of follow.get(rule.lhs)!) target.add(t);
        }
        if (target.size !== before) changed = true;
      }
    }
  }
  return follow;
}

// ------------------------------------------------------------ left recursion
//
// A left-corner edge runs from a nonterminal to any symbol that can begin one
// of its expansions, which includes the symbol after a nullable prefix. Left
// recursion is a cycle in that graph, and a search for a production beginning
// with its own name would miss every indirect case.

export interface Cycle {
  readonly members: readonly string[];
}

export function leftCorners(
  g: Grammar,
  nullable: ReadonlySet<string>,
): Map<string, Set<string>> {
  const edges = new Map<string, Set<string>>();
  for (const nonterminal of g.nonterminals) edges.set(nonterminal, new Set());
  for (const rule of g.rules) {
    for (const symbol of rule.rhs) {
      if (g.nonterminals.has(symbol)) edges.get(rule.lhs)!.add(symbol);
      if (!nullable.has(symbol)) break;
    }
  }
  return edges;
}

/** Strongly connected components of the left-corner graph, Tarjan's method. */
export function leftRecursionCycles(
  edges: ReadonlyMap<string, Set<string>>,
): Cycle[] {
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const cycles: Cycle[] = [];
  let next = 0;

  const strongConnect = (v: string): void => {
    index.set(v, next);
    low.set(v, next);
    next += 1;
    stack.push(v);
    onStack.add(v);

    for (const w of edges.get(v) ?? new Set<string>()) {
      if (!index.has(w)) {
        strongConnect(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v)!, index.get(w)!));
      }
    }

    if (low.get(v) === index.get(v)) {
      const members: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        members.push(w);
      } while (w !== v);
      // A component of one is a cycle only when the node reaches itself.
      const selfLoop =
        members.length === 1 &&
        (edges.get(members[0])?.has(members[0]) ?? false);
      if (members.length > 1 || selfLoop)
        cycles.push({ members: members.sort() });
    }
  };

  for (const v of edges.keys()) if (!index.has(v)) strongConnect(v);
  return cycles;
}

// ---------------------------------------------------------------- LL(1)

export interface Collision {
  readonly nonterminal: string;
  readonly lookahead: string;
  readonly rules: readonly Rule[];
  readonly kind: "FIRST/FIRST" | "FIRST/FOLLOW";
  /** The named predicates the colliding productions declare, if any. */
  readonly predicates: readonly string[];
}

export interface Analysis {
  readonly grammar: Grammar;
  readonly nullable: ReadonlySet<string>;
  readonly first: ReadonlyMap<string, Set<string>>;
  readonly follow: ReadonlyMap<string, Set<string>>;
  readonly cycles: readonly Cycle[];
  readonly collisions: readonly Collision[];
  readonly unreachable: readonly string[];
  readonly unproductive: readonly string[];
}

export function analyze(productions: readonly Production[]): Analysis {
  const grammar = expand(productions);
  const nullable = nullableSet(grammar);
  const first = firstSets(grammar, nullable);
  const follow = followSets(grammar, first, nullable);
  const cycles = leftRecursionCycles(leftCorners(grammar, nullable));

  // Prediction table: nonterminal × lookahead → rules.
  const table = new Map<string, Map<string, Rule[]>>();
  for (const rule of grammar.rules) {
    const row = table.get(rule.lhs) ?? new Map<string, Rule[]>();
    table.set(rule.lhs, row);
    const predict = firstOf(rule.rhs, first, nullable);
    const lookaheads = new Set<string>();
    for (const t of predict) if (t !== EPSILON) lookaheads.add(t);
    if (predict.has(EPSILON)) {
      for (const t of follow.get(rule.lhs)!) lookaheads.add(t);
    }
    for (const lookahead of lookaheads) {
      const cell = row.get(lookahead) ?? [];
      cell.push(rule);
      row.set(lookahead, cell);
    }
  }

  const predicatesOf = new Map(productions.map((p) => [p.name, p.predicates]));
  const collisions: Collision[] = [];
  for (const [nonterminal, row] of table) {
    for (const [lookahead, rules] of row) {
      if (rules.length < 2) continue;
      const nullableRule = rules.some((r) =>
        firstOf(r.rhs, first, nullable).has(EPSILON),
      );
      const declared = new Set<string>();
      for (const rule of rules) {
        for (const p of predicatesOf.get(rule.origin) ?? []) declared.add(p);
      }
      collisions.push({
        nonterminal,
        lookahead,
        rules,
        kind: nullableRule ? "FIRST/FOLLOW" : "FIRST/FIRST",
        predicates: [...declared].sort(),
      });
    }
  }

  // Reachability from the start symbol, and productivity.
  const reachable = new Set<string>([grammar.start]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const rule of grammar.rules) {
      if (!reachable.has(rule.lhs)) continue;
      for (const symbol of rule.rhs) {
        if (grammar.nonterminals.has(symbol) && !reachable.has(symbol)) {
          reachable.add(symbol);
          changed = true;
        }
      }
    }
  }
  const productive = new Set<string>();
  changed = true;
  while (changed) {
    changed = false;
    for (const rule of grammar.rules) {
      if (productive.has(rule.lhs)) continue;
      if (
        rule.rhs.every((s) => !grammar.nonterminals.has(s) || productive.has(s))
      ) {
        productive.add(rule.lhs);
        changed = true;
      }
    }
  }

  return {
    grammar,
    nullable,
    first,
    follow,
    cycles,
    collisions: collisions.sort(
      (a, b) =>
        a.nonterminal.localeCompare(b.nonterminal) ||
        a.lookahead.localeCompare(b.lookahead),
    ),
    unreachable: [...grammar.nonterminals]
      .filter((n) => !reachable.has(n))
      .sort(),
    unproductive: [...grammar.nonterminals]
      .filter((n) => !productive.has(n))
      .sort(),
  };
}

/** A shortest terminal string derivable from a symbol, for a witness. */
export function shortestWitness(
  grammar: Grammar,
  symbol: string,
  seen: ReadonlySet<string> = new Set(),
): string[] | undefined {
  if (!grammar.nonterminals.has(symbol)) return [symbol];
  if (seen.has(symbol)) return undefined;
  const next = new Set([...seen, symbol]);

  let best: string[] | undefined;
  for (const rule of grammar.rules.filter((r) => r.lhs === symbol)) {
    const parts: string[] = [];
    let ok = true;
    for (const s of rule.rhs) {
      const piece = shortestWitness(grammar, s, next);
      if (piece === undefined) {
        ok = false;
        break;
      }
      parts.push(...piece);
    }
    if (ok && (best === undefined || parts.length < best.length)) best = parts;
  }
  return best;
}
