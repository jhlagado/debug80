# Level Zero grammar report

GENERATED from `candlemoth/level0.grammar` by `npm run generate:grammar`. Stage A and stage B of `docs/level0-parser-study.md`. Every figure below is derived; nothing is asserted by hand.

## Summary

| Measure | Value |
| --- | --- |
| Canonical productions | 45 |
| BNF rules after mechanical expansion | 126 |
| Nonterminals | 71 |
| Terminals | 42 |
| Left-recursion cycles | 0 |
| LL(1) collisions | 2 |
| Unreachable nonterminals | 0 |
| Unproductive nonterminals | 0 |
| Productions Candlemoth uses | 45 of 45 |

## Left recursion

Computed from a left-corner graph that follows nullable prefixes, then reported as strongly connected components. A textual search for a production beginning with its own name would miss every indirect case.

No cycle. The canonical grammar is not left-recursive.

## LL(1) collisions

Each row is one prediction cell with more than one rule. A collision with a declared predicate is a contextual decision the parser must make from the symbol table; a collision with none is an unexplained conflict.

| Nonterminal | Lookahead | Kind | Rules | Predicate | Witness |
| --- | --- | --- | --- | --- | --- |
| `primary` | `NAME` | FIRST/FIRST | NAME · NAME argument-list | isCallableName, isTypeName | NAME / NAME |
| `simple-statement` | `NAME` | FIRST/FIRST | assignment · call-statement | isCallableName, isWritableName | NAME = NUMBER / NAME ( ) |

## Unreachable and unproductive

Every nonterminal is reachable from the start symbol.

Every nonterminal derives a terminal string.

## Token audit

The tokenizer installs 23 keyword spellings and 15 punctuation forms. Unused tokens are not free: each one occupies arena bytes, an index-table row and a scanner arm.

No stale token: every token the tokenizer recognises appears in the grammar.

## Productions

| Production | Used | Predicate | Source |
| --- | --- | --- | --- |
| `unit` | yes | — | level0.md "Program shape"; spec 12.6 |
| `top-declaration` | yes | — | level0.md "Storage", "Routines" |
| `enum-declaration` | yes | — | level0.md "Types"; spec 3 |
| `enum-member` | yes | — | level0.md "Types" |
| `const-declaration` | yes | isConstantContext | level0.md "Storage" |
| `var-declaration` | yes | — | level0.md "Storage" |
| `forward-declaration` | yes | — | level0.md "Routines"; spec 11 |
| `sub-declaration` | yes | — | level0.md "Routines"; spec 11 |
| `sub-header` | yes | — | level0.md "Routines" |
| `parameter-list` | yes | — | level0.md "Routines" |
| `parameter` | yes | — | level0.md "Routines"; spec 11.3 parameters are read-only |
| `declaration-prefix` | yes | — | spec 4; level0-findings 21 |
| `local-declaration` | yes | — | spec 4 |
| `type` | yes | isTypeName | level0.md "Types" |
| `scalar-type` | yes | isTypeName | level0.md "Types"; type names are ordinary names, level0-findings 23 |
| `const-initializer` | yes | isConstantContext | level0.md "Storage" |
| `array-literal` | yes | isConstantContext | level0.md "Storage"; level0-findings 30 |
| `array-element` | yes | isConstantContext | level0.md "Storage" |
| `statement-list` | yes | — | level0.md "Control" |
| `statement` | yes | — | level0.md "Control" |
| `simple-statement` | yes | isCallableName, isWritableName | level0.md "Control" |
| `assignment` | yes | isWritableName | level0.md "Control" |
| `call-statement` | yes | isCallableName | level0.md "Routines" |
| `return-statement` | yes | — | level0.md "Control" |
| `if-statement` | yes | — | level0.md "Control" |
| `while-statement` | yes | — | level0.md "Control" |
| `for-statement` | yes | isWritableName | level0.md "Control"; Level Zero ruling removed "for ... to" |
| `select-statement` | yes | — | level0.md "Control" |
| `case-clause` | yes | isConstantContext | level0.md "Control"; one constant per case |
| `expression` | yes | — | spec 6, 8.4; level0.md "Operators" |
| `disjunction` | yes | — | spec 6, 8.4 |
| `conjunction` | yes | — | spec 6, 8.4 |
| `negation` | yes | — | spec 6 |
| `comparison` | yes | — | spec 6; comparisons do not chain |
| `comparison-op` | yes | — | spec 6 |
| `additive` | yes | — | spec 3.1, 6 |
| `additive-op` | yes | — | spec 6 |
| `multiplicative` | yes | — | spec 3.1, 6 |
| `multiplicative-op` | yes | — | spec 6; "mod" is a recorded discrepancy, see the report |
| `prefix` | yes | — | spec 6; prefix operators nest right to left |
| `postfix` | yes | — | level0.md "Types"; indexing binds tighter than prefix |
| `index-suffix` | yes | — | level0.md "Types"; bounds-checked subscript |
| `primary` | yes | isTypeName, isCallableName | spec 6 |
| `argument-list` | yes | isTypeName, isCallableName | level0.md "Routines"; conversions share this shape |
| `const-expression` | yes | isConstantContext | level0.md "Storage"; a semantic restriction over expression |

## FIRST and FOLLOW

| Nonterminal | Nullable | FIRST | FOLLOW |
| --- | --- | --- | --- |
| `unit` | no | `EOF` `NEWLINE` `const` `enum` `forward` `sub` `var` | `⊣` |
| `top-declaration` | no | `const` `enum` `forward` `sub` `var` | `EOF` `NEWLINE` `const` `enum` `forward` `sub` `var` |
| `enum-declaration` | no | `enum` | `EOF` `NEWLINE` `const` `enum` `forward` `sub` `var` |
| `enum-member` | no | `NAME` | `NAME` `end` |
| `const-declaration` | no | `const` | `EOF` `NAME` `NEWLINE` `const` `continue` `end` `enum` `exit` `for` `forward` `if` `return` `select` `sub` `var` `while` |
| `var-declaration` | no | `var` | `EOF` `NAME` `NEWLINE` `const` `continue` `end` `enum` `exit` `for` `forward` `if` `return` `select` `sub` `var` `while` |
| `forward-declaration` | no | `forward` | `EOF` `NEWLINE` `const` `enum` `forward` `sub` `var` |
| `sub-declaration` | no | `sub` | `EOF` `NEWLINE` `const` `enum` `forward` `sub` `var` |
| `sub-header` | no | `sub` | `NEWLINE` |
| `parameter-list` | no | `NAME` | `)` |
| `parameter` | no | `NAME` | `)` `,` |
| `declaration-prefix` | yes | `const` `var` | `NAME` `continue` `end` `exit` `for` `if` `return` `select` `while` |
| `local-declaration` | no | `const` `var` | `NAME` `const` `continue` `end` `exit` `for` `if` `return` `select` `var` `while` |
| `type` | no | `NAME` | `=` `NEWLINE` |
| `scalar-type` | no | `NAME` | `)` `,` `=` `NEWLINE` `[` |
| `const-initializer` | no | `(` `-` `NAME` `NUMBER` `[` `false` `not` `true` | `NEWLINE` |
| `array-literal` | no | `[` | `NEWLINE` |
| `array-element` | no | `(` `-` `NAME` `NEWLINE` `NUMBER` `false` `not` `true` | `,` `]` |
| `statement-list` | yes | `NAME` `continue` `exit` `for` `if` `return` `select` `while` | `case` `else` `end` |
| `statement` | no | `NAME` `continue` `exit` `for` `if` `return` `select` `while` | `NAME` `case` `continue` `else` `end` `exit` `for` `if` `return` `select` `while` |
| `simple-statement` | no | `NAME` `continue` `exit` `return` | `NEWLINE` |
| `assignment` | no | `NAME` | `NEWLINE` |
| `call-statement` | no | `NAME` | `NEWLINE` |
| `return-statement` | no | `return` | `NEWLINE` |
| `if-statement` | no | `if` | `NAME` `case` `continue` `else` `end` `exit` `for` `if` `return` `select` `while` |
| `while-statement` | no | `while` | `NAME` `case` `continue` `else` `end` `exit` `for` `if` `return` `select` `while` |
| `for-statement` | no | `for` | `NAME` `case` `continue` `else` `end` `exit` `for` `if` `return` `select` `while` |
| `select-statement` | no | `select` | `NAME` `case` `continue` `else` `end` `exit` `for` `if` `return` `select` `while` |
| `case-clause` | no | `case` | `case` `else` `end` |
| `expression` | no | `(` `-` `NAME` `NUMBER` `false` `not` `true` | `)` `,` `NEWLINE` `]` `then` `until` |
| `disjunction` | no | `(` `-` `NAME` `NUMBER` `false` `not` `true` | `)` `,` `NEWLINE` `]` `then` `until` |
| `conjunction` | no | `(` `-` `NAME` `NUMBER` `false` `not` `true` | `)` `,` `NEWLINE` `]` `or` `then` `until` |
| `negation` | no | `(` `-` `NAME` `NUMBER` `false` `not` `true` | `)` `,` `NEWLINE` `]` `and` `or` `then` `until` |
| `comparison` | no | `(` `-` `NAME` `NUMBER` `false` `true` | `)` `,` `NEWLINE` `]` `and` `or` `then` `until` |
| `comparison-op` | no | `<` `<=` `<>` `=` `>` `>=` | `(` `-` `NAME` `NUMBER` `false` `true` |
| `additive` | no | `(` `-` `NAME` `NUMBER` `false` `true` | `)` `,` `<` `<=` `<>` `=` `>` `>=` `NEWLINE` `]` `and` `or` `then` `until` |
| `additive-op` | no | `+` `-` | `(` `-` `NAME` `NUMBER` `false` `true` |
| `multiplicative` | no | `(` `-` `NAME` `NUMBER` `false` `true` | `)` `+` `,` `-` `<` `<=` `<>` `=` `>` `>=` `NEWLINE` `]` `and` `or` `then` `until` |
| `multiplicative-op` | no | `*` `/` | `(` `-` `NAME` `NUMBER` `false` `true` |
| `prefix` | no | `(` `-` `NAME` `NUMBER` `false` `true` | `)` `*` `+` `,` `-` `/` `<` `<=` `<>` `=` `>` `>=` `NEWLINE` `]` `and` `or` `then` `until` |
| `postfix` | no | `(` `NAME` `NUMBER` `false` `true` | `)` `*` `+` `,` `-` `/` `<` `<=` `<>` `=` `>` `>=` `NEWLINE` `]` `and` `or` `then` `until` |
| `index-suffix` | no | `[` | `)` `*` `+` `,` `-` `/` `<` `<=` `<>` `=` `>` `>=` `NEWLINE` `[` `]` `and` `or` `then` `until` |
| `primary` | no | `(` `NAME` `NUMBER` `false` `true` | `)` `*` `+` `,` `-` `/` `<` `<=` `<>` `=` `>` `>=` `NEWLINE` `[` `]` `and` `or` `then` `until` |
| `argument-list` | no | `(` | `)` `*` `+` `,` `-` `/` `<` `<=` `<>` `=` `>` `>=` `NEWLINE` `[` `]` `and` `or` `then` `until` |
| `const-expression` | no | `(` `-` `NAME` `NUMBER` `false` `not` `true` | `,` `NEWLINE` `]` |

`⊣` is end of input; `ε` is the empty string.
