# Nucleus grammar report

GENERATED from `candlemoth/nucleus.grammar` by `npm run generate:grammar`. Stage A and stage B of `docs/level0-parser-study.md`. Every figure below is derived; nothing is asserted by hand.

**Draft.** No nucleus source exists, so every production reports `uses: no` and the coverage figure below is zero by construction rather than by measurement. The grammar is also known to omit admitted forms — see `docs/nucleus/review-actions.md`.

## Summary

| Measure | Value |
| --- | --- |
| Canonical productions | 29 |
| BNF rules after mechanical expansion | 82 |
| Nonterminals | 44 |
| Terminals | 36 |
| Left-recursion cycles | 0 |
| LL(1) collisions | 1 |
| Unreachable nonterminals | 0 |
| Unproductive nonterminals | 0 |
| Productions Candlemoth uses | 0 of 29 |

## Left recursion

Computed from a left-corner graph that follows nullable prefixes, then reported as strongly connected components. A textual search for a production beginning with its own name would miss every indirect case.

No cycle. The canonical grammar is not left-recursive.

## LL(1) collisions

Each row is one prediction cell with more than one rule. A collision with a declared predicate is a contextual decision the parser must make from the symbol table; a collision with none is an unexplained conflict.

| Nonterminal | Lookahead | Kind | Rules | Predicate | Witness |
| --- | --- | --- | --- | --- | --- |
| `simple-statement` | `NAME` | FIRST/FIRST | assignment · call-statement | isCallableName, isWritableName | NAME = NUMBER / NAME ( ) |

## Unreachable and unproductive

Every nonterminal is reachable from the start symbol.

Every nonterminal derives a terminal string.

## Token audit

The tokenizer installs 23 keyword spellings and 15 punctuation forms. Unused tokens are not free: each one occupies arena bytes, an index-table row and a scanner arm.

| Token | Status |
| --- | --- |
| `"for"` | recognised and still consulted by the parser, though no production names it |
| `"until"` | recognised and still consulted by the parser, though no production names it |
| `"enum"` | recognised and still consulted by the parser, though no production names it |
| `"forward"` | recognised and still consulted by the parser, though no production names it |
| `"and"` | recognised and still consulted by the parser, though no production names it |
| `"or"` | recognised and still consulted by the parser, though no production names it |

## Productions

| Production | Used | Predicate | Source |
| --- | --- | --- | --- |
| `unit` | **no** | — | nucleus |
| `declaration` | **no** | — | nucleus |
| `const-declaration` | **no** | isConstantContext | nucleus; placed constant arrays are how tables are written |
| `var-declaration` | **no** | — | nucleus; no initializer, so no code runs before the start |
| `sub-declaration` | **no** | — | nucleus; no parameters, no result, no locals |
| `type` | **no** | isTypeName | nucleus; u8, u16 and boolean, resolved by predicate |
| `const-initializer` | **no** | isConstantContext | nucleus |
| `array-literal` | **no** | isConstantContext | nucleus |
| `array-element` | **no** | isConstantContext | nucleus |
| `statement-list` | **no** | — | nucleus |
| `statement` | **no** | — | nucleus; one loop form |
| `simple-statement` | **no** | isCallableName, isWritableName | nucleus |
| `assignment` | **no** | isWritableName | nucleus |
| `call-statement` | **no** | isCallableName | nucleus; no arguments, so a call is three bytes |
| `select-statement` | **no** | — | nucleus; lowers to a jump table, see docs/nucleus/lowering.md |
| `case-clause` | **no** | isConstantContext | nucleus; one constant per case |
| `if-statement` | **no** | — | nucleus |
| `while-statement` | **no** | — | nucleus; the only loop |
| `expression` | **no** | — | nucleus |
| `negation` | **no** | — | nucleus; `not` is free at every lowering, see docs/nucleus/lowering.md |
| `comparison` | **no** | — | nucleus; comparisons do not chain |
| `comparison-op` | **no** | — | nucleus |
| `additive` | **no** | — | nucleus |
| `additive-op` | **no** | — | nucleus |
| `multiplicative` | **no** | — | nucleus |
| `multiplicative-op` | **no** | — | nucleus |
| `primary` | **no** | — | nucleus |
| `index-suffix` | **no** | — | nucleus; a constant subscript is checked at compile time |
| `const-expression` | **no** | isConstantContext | nucleus |

## FIRST and FOLLOW

| Nonterminal | Nullable | FIRST | FOLLOW |
| --- | --- | --- | --- |
| `unit` | no | `EOF` `NEWLINE` `const` `sub` `var` | `⊣` |
| `declaration` | no | `const` `sub` `var` | `EOF` `NEWLINE` `const` `sub` `var` |
| `const-declaration` | no | `const` | `EOF` `NEWLINE` `const` `sub` `var` |
| `var-declaration` | no | `var` | `EOF` `NEWLINE` `const` `sub` `var` |
| `sub-declaration` | no | `sub` | `EOF` `NEWLINE` `const` `sub` `var` |
| `type` | no | `NAME` | `=` `NEWLINE` |
| `const-initializer` | no | `(` `NAME` `NUMBER` `[` `false` `not` `true` | `NEWLINE` |
| `array-literal` | no | `[` | `NEWLINE` |
| `array-element` | no | `(` `NAME` `NEWLINE` `NUMBER` `false` `not` `true` | `,` `]` |
| `statement-list` | yes | `NAME` `continue` `exit` `if` `return` `select` `while` | `case` `else` `end` |
| `statement` | no | `NAME` `continue` `exit` `if` `return` `select` `while` | `NAME` `case` `continue` `else` `end` `exit` `if` `return` `select` `while` |
| `simple-statement` | no | `NAME` `continue` `exit` `return` | `NEWLINE` |
| `assignment` | no | `NAME` | `NEWLINE` |
| `call-statement` | no | `NAME` | `NEWLINE` |
| `select-statement` | no | `select` | `NAME` `case` `continue` `else` `end` `exit` `if` `return` `select` `while` |
| `case-clause` | no | `case` | `case` `else` `end` |
| `if-statement` | no | `if` | `NAME` `case` `continue` `else` `end` `exit` `if` `return` `select` `while` |
| `while-statement` | no | `while` | `NAME` `case` `continue` `else` `end` `exit` `if` `return` `select` `while` |
| `expression` | no | `(` `NAME` `NUMBER` `false` `not` `true` | `)` `,` `NEWLINE` `]` `then` |
| `negation` | no | `(` `NAME` `NUMBER` `false` `not` `true` | `)` `,` `NEWLINE` `]` `then` |
| `comparison` | no | `(` `NAME` `NUMBER` `false` `true` | `)` `,` `NEWLINE` `]` `then` |
| `comparison-op` | no | `<` `<=` `<>` `=` `>` `>=` | `(` `NAME` `NUMBER` `false` `true` |
| `additive` | no | `(` `NAME` `NUMBER` `false` `true` | `)` `,` `<` `<=` `<>` `=` `>` `>=` `NEWLINE` `]` `then` |
| `additive-op` | no | `+` `-` | `(` `NAME` `NUMBER` `false` `true` |
| `multiplicative` | no | `(` `NAME` `NUMBER` `false` `true` | `)` `+` `,` `-` `<` `<=` `<>` `=` `>` `>=` `NEWLINE` `]` `then` |
| `multiplicative-op` | no | `*` `/` | `(` `NAME` `NUMBER` `false` `true` |
| `primary` | no | `(` `NAME` `NUMBER` `false` `true` | `)` `*` `+` `,` `-` `/` `<` `<=` `<>` `=` `>` `>=` `NEWLINE` `]` `then` |
| `index-suffix` | no | `[` | `)` `*` `+` `,` `-` `/` `<` `<=` `<>` `=` `>` `>=` `NEWLINE` `]` `then` |
| `const-expression` | no | `(` `NAME` `NUMBER` `false` `not` `true` | `,` `NEWLINE` `]` |

`⊣` is end of input; `ε` is the empty string.
