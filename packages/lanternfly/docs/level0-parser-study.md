# Candlemoth Level Zero parser study

Status: architecture work order; preliminary repository analysis included;
formal grammar results not reviewed or accepted here.

Candlemoth is the Level Zero Lanternfly self-hosting compiler for Z80. This
work order stops further parser expansion until the team derives, checks and
prices the Level Zero grammar. The current front end grew through implementation
before anyone completed that study. It is evidence and a baseline, not the
parser architecture to preserve.

The study has one job: select a parser architecture from reproducible language
analysis, accepted and rejected corpora, and target-byte costs. A plausible
host implementation, a source-line reduction or an intuitive rewrite does not
satisfy that job.

## Authority and stop rule

Apply the following authority order:

1. [The Lanternfly specification](specification.md) governs source-language
   syntax and semantics.
2. [The Level Zero boundary](level0.md) narrows that language for the bootstrap.
   It does not change the meaning of a retained form.
3. Current Candlemoth `.lafy` source supplies empirical evidence for the Level
   Zero boundary and exposes implementation constraints. It does not override
   the specification.
4. [The Level Zero findings ledger](level0-findings.md) records useful history,
   including retracted and superseded findings. Treat a historical claim as
   current only after checking it against the first three authorities.
5. [The Candlemoth size discipline](candlemoth-size-discipline.md) governs the
   target cost method and whole-program acceptance criteria.
6. This document governs the parser study and its decision gate. It does not
   amend the language or the Level Zero boundary.

Generated grammars and analyzer reports remain study artifacts until they pass
the gates in this document. Their existence does not raise them above the
source authorities or permit parser expansion.

When these sources disagree, record the disagreement in the grammar inventory.
Do not merge incompatible statements into a new rule. Resolve a language rule
through the authority order or obtain an explicit language decision.

Stop rule: do not add another grammar form or expand an existing parser path
before Stage D of this work order has been approved. Corrections that preserve
the currently accepted surface, test work, measurements and study tooling may
continue. A proposed correction that changes accepted token sequences belongs
behind the same gate. Stage E is the first implementation stage.

The gate exists because another implementation written from intuition would
produce another data point without answering which grammar the compiler must
recognise, where its decisions come from, or what each decision costs on Z80.

## Terms and invariants

A language is a set of source programs with defined meanings. A grammar is one
description of a language's syntax. Languages are not “left-recursive”;
grammars are. Every report and code comment must preserve that distinction.

Use these terms consistently:

- The **canonical grammar** describes the Level Zero source language. Keep its
  EBNF close to the specification and attach source references and stable
  production IDs.
- An **implementation grammar** is a mechanically derived or explicitly
  transformed grammar for one parser family. It never replaces the canonical
  grammar.
- The **tokenizer contract** defines physical bytes, logical newlines, token
  kinds and token payloads.
- A **syntactic decision** follows from tokens and productions.
- A **semantic decision** requires declarations, types, constantness or another
  property outside the context-free grammar.
- A **contextual decision** uses bounded parser context or a named semantic
  predicate to choose between syntactically similar forms.

Keep lexical, syntactic and semantic rules in separate artifacts and reports.
In particular:

- A physical newline produces the grammar terminal `NEWLINE` only at delimiter
  depth zero. A physical newline inside parentheses or square brackets is
  whitespace and cannot terminate a statement.
- A leading `+` or `-` is a unary operator, never part of a decimal literal.
- `and` and `or` have Boolean and integer meanings selected by type checking.
  Their dual meaning is not a parsing ambiguity.
- Comparison operators do not chain.
- Conditional expressions are outside Level Zero. Do not charge the full
  grammar's conditional-expression LL conflict to this subset.
- The specification's expression EBNF uses repetition at left-associative
  levels, so that EBNF is already non-left-recursive. If a tool expands it to
  BNF, the generated productions and semantic actions must preserve left
  associativity. Unary `not` and unary `+`/`-` remain right-recursive by design.
- Calls, conversions and indexing bind more tightly than every prefix or binary
  operator. Power, shifts, `xor` and the conditional expression are outside the
  preliminary Level Zero expression grammar.
- Any nesting limit, parser stack limit or recovery limit is an explicit
  implementation bound with a tested diagnostic. It is not an accidental Z80
  stack limit.

## Preliminary repository assessment

Everything in this section is preliminary. It comes from a manual reading of
the current documents and source, not from analyzer results accepted under
this work order.

The active source model has four scalar types: `u8`, `u16`, `i16` and
`boolean`. It has `u8`-backed nominal enums, one-dimensional fixed arrays,
module constants and variables, routine locals, scalar parameters,
subroutines, forward declarations, recursion, calls, conversions, indexing,
assignment, `if`/`else`, `while`, `for`/`until`, single-value `select` cases,
`return`, `exit` and `continue`. The bootstrap profile predeclares five
callables:

```text
readSourceByte() as u8
rewindSource()
writeCodeByte(value as u8)
writeDiagnostic(value as u8)
setExitStatus(value as u8)
```

These are profile intrinsics resolved as callables. They are not keywords or
special grammar productions. The current four front-end files call only
`readSourceByte` and `writeCodeByte`; the Level Zero contract declares all
five.

Records, integer `xor`, `size`, `byteSize`, `offset`, `lower`, `upper`,
`clear`, `fill`, multi-value cases, range cases, `for`/`to`, array parameters
and `write` parameters have moved outside active Level Zero. Strings,
subranges, multidimensional arrays, opaque addresses, modules, placement,
volatile storage, aliases, tasks and the full error subsystem are also outside
the subset.

The current checkout contains evidence that must be reconciled in Stage A:

| Site | Current evidence | Preliminary treatment |
| --- | --- | --- |
| `for`/`to` | `level0.md` excludes it and current Candlemoth code has no active use. `statement.lafy` still parses it, and an older finding calls it load-bearing. | Exclude it from the preliminary grammar. Record the parser path as obsolete until the inventory proves otherwise. |
| `mod` | `level0.md` lists it, but the tokenizer, expression operator table and current source do not contain the form. | Open boundary issue `B-OP-MOD`; do not silently add or remove it in the machine grammar. |
| `static var` | `level0.md` lists routine `static var`, but the current tokenizer has no `static` keyword and the findings report no use. | Open boundary issue `B-STORAGE-STATIC`. Distinguish a module variable's static lifetime from the `static var` source form. |
| `record` and `to` tokens | The tokenizer still reserves both words although the current subset excludes their forms. | A tokenizer may diagnose excluded syntax, but the accepted grammar must not acquire those productions through token availability. |
| General expression statements | The full specification permits them. The current statement parser accepts a name-led call or assignment, not an arbitrary expression statement. | Keep the source-language decision explicit. The grammar skeleton includes expression statements so the required name-led conflict is studied; Stage A must confirm the Level Zero boundary. |
| Unary `+` | The specification includes it and the tokenizer emits `+`; the current expression parser implements unary `-` but not unary `+`. | Keep the associativity invariant and close the implementation gap only after the decision gate. |

The current expression front end is not the old duplicated recursive-descent
precedence ladder. `expression.lafy` replaced six historical binary levels
with `parseBinary(minPrecedence)`, a 13-entry operator/precedence table and a
10-entry punctuation map. `parseUnary` remains recursive for prefix operators,
and `parsePrimary` handles literals, names, parentheses, one subscript and a
name followed by parentheses. The findings report reduced call depth but no
compiled image-size result. Do not describe the removed ladder as current
overhead.

The current implementation does expose structural costs that a candidate must
price:

- Parsing, type unification, constant folding, short-circuit lowering and code
  emission share the `parseBinary` path. The analysis, layout and emission
  passes select behaviour through global pass state and the `emit` sink.
- An expression result uses five module cells (`resultType`, constantness,
  value, sign and enum identity). Operator application copies four of those
  properties into a second `pending` group before dispatching semantic actions.
- `applyWord`, `applyCompare`, `applyArithmetic` and `applyFold` combine parser
  control with typing, folding and emission. This coupling may save an
  intermediate representation, but its byte cost has not been measured.
- `statement.lafy` uses separate parse routines for declarations and control
  forms, two writable loop-label arrays, global scratch for a counted-loop
  limit and a `select` value, and a global address for every label because
  streamed output cannot be back-patched.
- `symbols.lafy` uses separate persistent and transient symbol regions. That
  lifetime split is verified current behaviour, not parser-family overhead.
- `referenceCallOrConversion` resolves conversion versus call from the type and
  value namespaces. `nameBeginsCall` uses symbol class to choose a name-led
  call statement versus assignment. The latter does not implement the full
  assignment-versus-expression-statement rule.
- Parser recovery is not yet a general mechanism. Several token scanners
  consume a malformed token, but the declaration driver stops after its first
  statement or symbol fault.

The four front-end files currently contain 3,969 source lines, and the
generated runtime source adds 69. Those counts identify the inspected corpus;
they say nothing about target size. No compiled Candlemoth image exists in the
evidence reviewed for this work order, so all parser byte savings remain
unverified.

## Preliminary tokenizer contract

The canonical grammar must consume logical tokens, not physical characters.
Stage A must turn the following preliminary contract into a terminal manifest
and check every item against `tokenizer.lafy`.

- Input is ASCII bytes terminated by the bootstrap stream byte `0xff`.
  `0xff` is framing, not a source character.
- An identifier begins with an ASCII letter. Later bytes may be ASCII letters,
  decimal digits or `_`. Resolution is case-insensitive; the current tokenizer
  folds ASCII uppercase to lowercase before interning.
- Level Zero integer literals are nonempty decimal digit sequences. Hexadecimal,
  binary, character and string literals are rejected.
- Spaces, tabs and `//` comments are discarded. A comment ends before its
  physical line ending. The current character table classifies both `0x0a`
  and `0x0d` as newline bytes; the terminal manifest must specify how `LF`,
  `CR` and `CRLF` affect logical lines and line numbers.
- `NEWLINE` is emitted only for a physical newline at parenthesis/bracket depth
  zero. Consecutive blank logical lines collapse. End of input supplies one
  final `NEWLINE` when the last logical line contains tokens.
- Preliminary punctuation is `(`, `)`, `[`, `]`, `,`, `+`, `-`, `*`, `/`,
  `=`, `<>`, `<`, `<=`, `>` and `>=`. The current tokenizer also emits `.` and
  `:`, but the preliminary Level Zero grammar has no use for them.
- Preliminary reserved words are `and`, `as`, `case`, `const`, `continue`,
  `else`, `end`, `enum`, `exit`, `false`, `for`, `forward`, `if`, `not`, `or`,
  `return`, `select`, `sub`, `then`, `true`, `until`, `var` and `while`.
  `mod` remains tied to `B-OP-MOD`.
- Built-in and user-defined type names have identifier shape. The current
  tokenizer does not emit a distinct type-name token.

The terminal validator must report both directions: a grammar terminal with no
tokenizer path, and a tokenizer token that no accepted production can consume.
An intentionally diagnostic-only token requires an explicit annotation.

## Preliminary Level Zero grammar skeleton

This EBNF is a substantial extraction target, not a verified grammar. It
combines the retained subset in `level0.md`, the provisional full grammar in
specification section 15 and current Candlemoth use. Comments beginning with
`@` name predicates or semantic restrictions that the context-free grammar
cannot decide. Stage A must give every production a stable ID and a source
reference before treating it as canonical.

The preliminary extraction is traceable by area:

| Grammar area | Specification source | Current implementation evidence |
| --- | --- | --- |
| Tokens and logical lines | Sections 2.4, 14 and 15 | [`tokenizer.lafy`](../candlemoth/tokenizer.lafy) |
| Expressions and precedence | Sections 8 and 15 | [`expression.lafy`](../candlemoth/expression.lafy) and [`symbols.lafy`](../candlemoth/symbols.lafy) |
| Names, calls and conversions | Sections 2.1, 3.1, 8.1, 11 and 15 | [`symbols.lafy`](../candlemoth/symbols.lafy) and [`statement.lafy`](../candlemoth/statement.lafy) |
| Declarations, statements and blocks | Sections 4, 9, 10, 11 and 15 | [`statement.lafy`](../candlemoth/statement.lafy) |

`level0.md` supplies the subset boundary for every row. The Stage A inventory
must replace these area references with production-level citations.

```ebnf
module              ::= top-declaration* EOF

top-declaration     ::= const-declaration
                      | var-declaration
                      | enum-declaration
                      | forward-sub-declaration
                      | sub-declaration

const-declaration   ::= "const" value-name "as" type-expression "="
                        constant-initializer NEWLINE
var-declaration     ::= "var" value-name "as" type-expression
                        ("=" expression)? NEWLINE
                        @array-variable-has-no-initializer

enum-declaration    ::= "enum" type-name "as" "u8" NEWLINE
                        enum-member+ "end" NEWLINE
enum-member         ::= value-name NEWLINE

forward-sub-declaration
                    ::= "forward" sub-header NEWLINE
sub-declaration     ::= sub-header NEWLINE routine-block "end" NEWLINE
sub-header          ::= "sub" value-name "(" parameters? ")"
                        ("as" scalar-type-ref)?
parameters          ::= parameter ("," parameter)*
parameter           ::= value-name "as" scalar-type-ref

routine-block       ::= local-var-declaration* statement*
local-var-declaration
                    ::= "var" value-name "as" type-expression
                        ("=" expression)? NEWLINE
                        @aggregate-local-has-no-initializer

statement           ::= if-statement
                      | while-statement
                      | for-until-statement
                      | select-statement
                      | return-statement
                      | exit-statement
                      | continue-statement
                      | assignment-statement       @P_ASSIGNMENT_HEAD
                      | expression-statement

if-statement        ::= "if" expression "then" NEWLINE statement*
                        ("else" NEWLINE statement*)?
                        "end" NEWLINE
while-statement     ::= "while" expression NEWLINE statement*
                        "end" NEWLINE
for-until-statement ::= "for" value-name "=" expression "until" expression
                        NEWLINE statement* "end" NEWLINE

select-statement    ::= "select" expression NEWLINE case-clause+
                        ("else" NEWLINE statement*)?
                        "end" NEWLINE
case-clause         ::= "case" constant-expression NEWLINE statement*
                        @one-compatible-constant

return-statement    ::= "return" expression? NEWLINE
exit-statement      ::= "exit" NEWLINE
continue-statement  ::= "continue" NEWLINE
assignment-statement
                    ::= writable-path "=" expression NEWLINE
expression-statement
                    ::= expression NEWLINE

type-expression     ::= scalar-type-ref ("[" constant-expression "]")?
scalar-type-ref     ::= builtin-scalar-type | type-name @P_TYPE_NAME
builtin-scalar-type ::= "u8" | "u16" | "i16" | "boolean"

constant-initializer
                    ::= constant-expression | array-initializer
array-initializer   ::= "[" (constant-expression
                        ("," constant-expression)*)? "]"

writable-path       ::= value-name ("[" expression "]")?
                        @declared-writable-storage

expression          ::= or-expression
or-expression       ::= and-expression ("or" and-expression)*
and-expression      ::= not-expression ("and" not-expression)*
not-expression      ::= "not" not-expression | comparison-expression
comparison-expression
                    ::= additive-expression
                        (comparison-operator additive-expression)?
comparison-operator ::= "=" | "<>" | "<" | "<=" | ">" | ">="
additive-expression ::= multiplicative-expression
                        (("+" | "-") multiplicative-expression)*
multiplicative-expression
                    ::= unary-expression
                        (("*" | "/" | "mod" @B-OP-MOD)
                         unary-expression)*
unary-expression    ::= ("+" | "-") unary-expression
                      | postfix-expression
postfix-expression  ::= primary-expression ("[" expression "]")*
primary-expression  ::= integer-literal
                      | "true" | "false"
                      | value-name
                      | name-application
                      | "(" expression ")"
name-application    ::= identifier "(" arguments? ")"
                        @P_CALL_OR_CONVERSION
arguments           ::= expression ("," expression)*

constant-expression ::= expression @constant-expression-restrictions
value-name          ::= identifier
type-name           ::= identifier
integer-literal     ::= decimal-digit+
```

This skeleton deliberately excludes records, fields, multidimensional
subscripts, `for`/`to`, range and multi-value cases, array and `write`
parameters, `xor`, shifts, power, conditional expressions and full-language
standard operations. `mod` is present only as a visible open issue; a machine
grammar must resolve `B-OP-MOD` before analysis.

The skeleton also exposes decisions that the prose subset has not closed.
Stage A must decide whether routine-local arrays are retained, whether an array
constant may omit elements as the current parser permits, and whether general
expression statements or only invocation statements remain in Level Zero.
Do not infer those answers from what the current parser happens to accept.

## Decision and conflict sites

The analyzer's conflict report and every parser prototype must use stable names
for these sites.

| ID | Site | Class | Required treatment |
| --- | --- | --- | --- |
| `L-NEWLINE-DEPTH` | Physical newline versus logical `NEWLINE` | Lexical | Track parenthesis and bracket depth in the tokenizer. Emit `NEWLINE` only at depth zero. |
| `L-SLASH-COMMENT` | `/` operator versus `//` comment | Lexical | Resolve with bounded character lookahead or equivalent held state before emitting `/`. |
| `L-SIGN-LITERAL` | Leading sign versus decimal literal | Lexical/syntactic | Emit `+` or `-` separately. Parse it in the right-recursive unary production. |
| `L-NAME-KEYWORD` | Identifier versus reserved word | Lexical | Compare case-insensitively against the final Level Zero word inventory. |
| `C-TYPE-NAME` | Identifier in a type position | Contextual/semantic | Apply `P_TYPE_NAME`, or reclassify visible type names into a distinct parser token with an audited symbol-table rule. |
| `C-CALL-CONVERT` | `name(...)` as routine/intrinsic call or conversion | Contextual/semantic | Apply `P_CALL_OR_CONVERSION`, using the visible type and callable namespaces. |
| `C-ASSIGN-EXPR` | Name-led assignment/index assignment or expression statement | Contextual/syntactic | Apply `P_ASSIGNMENT_HEAD` with bounded token buffering, or define an equivalent deterministic state machine. Do not base the decision only on the name's symbol class. |
| `S-EQUAL` | `=` as statement assignment or expression equality | Syntactic | Assignment consumes `=` only after `P_ASSIGNMENT_HEAD`; every expression occurrence is equality. |
| `S-COMPARE-CHAIN` | A second comparison operator | Syntactic | The grammar admits at most one. Reject the second with a comparison-specific diagnostic. |
| `M-AND-OR` | Boolean logical or integer bitwise `and`/`or` | Semantic | Parse one operator form; select typing, short-circuiting and lowering from operand types. |
| `M-CASE-CONST` | Case expression constantness and selector compatibility | Semantic | Parse an expression, then require one compile-time constant of the selector's ordinal family. |
| `M-FOR-CONTROL` | Counted-loop control name and range typing | Semantic | Require writable, nonvolatile scalar ordinal storage; evaluate start and boundary once. |
| `M-FORWARD` | Call before body, recursion and signature completion | Semantic | Resolve through declaration-order visibility and exact forward-signature matching. |
| `S-IF-CONDITIONAL` | Statement `if` versus conditional expression | Not a Level Zero conflict | The subset excludes conditional expressions. Keep the full-language issue out of candidate conflict counts. |

The skeleton supports several preliminary observations, none of which is an
analyzer result:

- Top-level declaration heads are distinct: `const`, `var`, `enum`, `forward`
  and `sub`.
- Keyword-led statement heads are distinct in the subset. The material
  context-free overlap is the identifier-led choice between assignment and an
  expression statement. An indexed left side can postpone the deciding `=`
  until after an arbitrarily complex but bounded index expression.
- `value-name` and `name-application` have the same identifier prefix as
  written. Left factoring can postpone the syntactic decision until `(`, but
  type-name versus callable still requires a predicate or token
  reclassification.
- Repetition expresses the left-associative binary levels without left
  recursion. The optional comparison suffix encodes the non-chainable
  comparison rule. Mechanical BNF expansion still needs FIRST/FOLLOW analysis;
  these observations do not establish LL(1).
- `case`, `else` and `end` do not begin ordinary Level Zero statements, so they
  can delimit repeated statement lists. Recovery must still consult the block
  stack before accepting one as a synchronizer.

## Formal grammar pipeline

Stages A and B must produce the following reproducible pipeline. Check the
analyzer against small fixture grammars with known nullable, recursion and
conflict results before using its report in the decision.

1. Create one machine-readable canonical EBNF. Each production and alternative
   needs a stable ID, source citation, Level Zero status, predicate annotations
   and a note for every deliberate divergence from specification section 15.
   Record the exact grammar file hash in every report.
2. Create a terminal manifest from the tokenizer contract. For every terminal,
   record token kind, payload constraint, example bytes, case handling,
   delimiter-depth effect and whether it is accepted or diagnostic-only.
   Validate grammar-to-tokenizer and tokenizer-to-grammar coverage.
3. Expand EBNF mechanically into plain BNF. Generate named tail and optional
   productions, retain a complete origin map to the canonical production, and
   emit the expansion as an artifact. Never edit generated BNF by hand.
4. Compute nullable nonterminals by fixed point. Compute FIRST and FOLLOW sets
   from the expanded BNF and record both the sets and the iteration trace or a
   deterministic equivalent that permits review.
5. Detect direct and indirect left recursion. Build a left-corner dependency
   graph that follows every nullable prefix, then find cycles. A first-symbol
   scan that ignores nullable prefixes is insufficient.
6. Find unreachable nonterminals from the start production. Find unproductive
   nonterminals by fixed point from terminal-producing alternatives. Report
   unused terminals separately.
7. Build the LL(1) table from FIRST and FOLLOW. Report every multiply populated
   cell as FIRST/FIRST, FIRST/FOLLOW or both. Predicate-resolved entries remain
   visible and labelled; a semantic predicate does not make the underlying
   context-free grammar LL(1).
8. Produce a shortest token witness for each conflict where practical. Use a
   bounded breadth-first derivation or equivalent reproducible search and show
   the common prefix, lookahead and competing production IDs. When the bound is
   exhausted, report the bound and unresolved witness instead of omitting the
   conflict.
9. Emit a transformation ledger for every candidate implementation grammar.
   Each row names the canonical production, transformation, associativity
   action, predicate and recovery effect. No candidate may silently rewrite
   the grammar to make a generator or analyzer pass.
10. Run analyzer regression tests on direct recursion, recursion through a
    nullable prefix, nullable FIRST/FOLLOW conflict, unreachable and
    unproductive productions, and at least one grammar with no conflict.

The pipeline must fail closed. An unresolved boundary issue, missing terminal,
unmapped generated production or unexplained conflict blocks candidate sizing.

## Parser candidates

Derive and measure all candidates from the same canonical grammar, predicate
registry and corpus. The current front end is the baseline, not a fourth
language definition.

### Transformed predictive parser

Derive an LL(1) or otherwise explicitly predictive implementation grammar.
Use generated tail productions or compact loops for left-associative operator
levels and attach reductions that fold from the left. Price both a table-driven
engine and any hand-compressed state encoding claimed to represent the same
table. Report predicate-controlled cells separately from ordinary one-token
decisions.

### LR or LALR parser

Derive an LR-family grammar from the same canonical source. The implementation
grammar may use natural left-recursive expression productions such as
`additive -> additive "+" multiplicative | multiplicative`; record that
derivation and preserve the canonical EBNF as authority. Measure state/action
and goto tables, compression code, semantic value stack entries, recovery
states and dispatch. Do not dismiss or select the family from the size of a
host parser-generator output.

### Hybrid parser

Combine the deterministic tokenizer with compact predictive or explicit-state
declaration and statement parsing, and use an operator-precedence,
precedence-climbing or shunting-yard expression engine with explicit bounded
stacks. Derive its operator table and stop sets from the canonical grammar.
State the exact stack entry layouts and bounds. This hybrid is a plausible
hypothesis for a Z80 compiler, not the decision.

For every family, preserve direct token-to-semantic-action operation where it
reduces storage, but produce a normalized parse/semantic trace for comparison.
No candidate needs an AST unless measurement shows that its total target cost
is lower.

## Precedence and associativity contract

The canonical tests must identify reductions, not only acceptance. At minimum,
record normalized traces for these cases:

| Source shape | Required grouping or result |
| --- | --- |
| `a - b - c` | `(a - b) - c` |
| `a / b * c` | `(a / b) * c` |
| `a + b * c` | `a + (b * c)` |
| `-a * b` | `(-a) * b` |
| `--a`, `+-a`, `not not flag` | Prefix chain groups right-to-left. Type checking may reject a parsed chain for a separate reason. |
| `a < b` | One comparison. |
| `a < b < c` | Syntax error at the second comparison operator; no Boolean/integer reinterpretation. |
| `not a = b` | `not (a = b)` |
| `(not a) = b` | The parentheses force integer complement before equality when types permit it. |
| `f(a, b)` | Call with left-to-right argument order. |
| `u16(a)` and `SomeEnum(a)` | Conversion selected by `P_CALL_OR_CONVERSION`. |
| `items[i]` | Indexing binds before prefix and binary operators. |
| `u16(items[i] + 1)` | Index, addition and conversion occur in that order. |

Logical-newline fixtures must include:

```lanternfly
if (ready
    and enabled) then
    run()
end
```

The physical newline after `ready` is absent from the parser token stream.
The same line break without enclosing parentheses terminates the statement and
must not be repaired by parser recovery into a multiline expression. Include
equivalent fixtures inside an index bracket and after a depth-zero operator.

For each fixture, compare the operator-reduction sequence, predicate decisions,
type decisions, constant-fold events and semantic-action order across
candidates. A matching final value is insufficient because associativity can
change overflow, faults and emitted code.

## Semantic-predicate policy

Keep a registry containing every predicate used by a candidate. At this stage
the required predicates are:

- `P_TYPE_NAME(name, scope)`: true when `name` resolves to a visible built-in
  or declared Level Zero type.
- `P_CALLABLE_NAME(name, scope)`: true when `name` resolves to a visible source
  subroutine or one of the five profile intrinsics.
- `P_CALL_OR_CONVERSION(name, scope)`: selects conversion when
  `P_TYPE_NAME` is true and call when `P_CALLABLE_NAME` is true. The
  specification forbids the type/callable collision that would make both true.
- `P_ASSIGNMENT_HEAD(mark, tokenStream)`: true when the marked statement prefix
  has the syntactic shape of a writable path followed immediately by `=`.
  Index expressions may contain calls and comparisons, so the implementation
  must state how it finds the matching bracket and restores or buffers tokens.

For each predicate, record inputs, symbol-table reads, declaration-order rule,
token consumption, maximum lookahead or buffer use, result set, failure
diagnostic and every parse-table or parser-state site that invokes it. A
predicate must be deterministic, side-effect free and invariant across
analysis, layout and emission passes.

If a candidate reclassifies identifier tokens instead, document when the
reclassification occurs, which namespace it consults, how a forward declaration
changes later tokens and how token replay across passes reproduces the same
classification. Token reclassification is an alternative implementation of a
contextual decision, not evidence that the source grammar is purely
context-free.

No predicate may perform type compatibility, choose Boolean versus integer
`and`/`or`, test case constantness or repair an earlier syntax error. Those are
semantic checks or recovery decisions and must remain visible under their own
names.

## Error recovery

Derive recovery synchronization sets from the canonical grammar and its FOLLOW
sets, then refine them for block structure. At minimum, define and test:

- declaration synchronization at depth-zero `NEWLINE`, the next declaration
  head or `EOF`;
- simple-statement synchronization at depth-zero `NEWLINE`;
- block synchronization at `else`, `case`, `end` or `EOF`, limited to the
  delimiters valid for the current block stack;
- expression synchronization at the caller-provided stop set, such as `)`,
  `]`, `,`, `then` or depth-zero `NEWLINE`;
- enum-member and case-clause synchronization at their next line boundary or
  closing block token.

Every recovery transition must guarantee progress. After reporting an error,
the parser must consume at least one token, pop a parser state, or return to a
caller that consumes a synchronizing token. The trace must identify which
action occurred. At `EOF`, recovery terminates without synthesizing an
unbounded series of missing tokens.

Set explicit bounds for delimiter nesting, expression state, block depth,
recovery insertions and diagnostics. On bound failure, report one stable
diagnostic, enter no-emit mode and continue only when the synchronization rule
guarantees progress. Test a file containing repeated bad tokens, unmatched
delimiters, missing `end`, nested malformed expressions and several independent
errors. The parser must terminate within a stated token-transition bound and
must not write code after a syntax error unless the candidate's audited
no-emit policy permits a verified safe region.

## Z80 cost model

Measure target artifacts. Do not use TypeScript, Lanternfly or generated C
source lines as a proxy for Z80 size.

Each candidate report must separate:

| Cost | Required measurement |
| --- | --- |
| Parser engine code | Z80 bytes for token dispatch, state transitions, production control and return paths. |
| Grammar tables | Constant bytes for productions, LL rows, LR actions/gotos, operator metadata, compression indices and sentinels. |
| Semantic-action dispatch | Code and tables that select typing, folding, symbol and emission actions. Count action-call setup as well as bodies. |
| Predicate machinery | Code, token buffering and writable state used only for contextual decisions. |
| Recovery | Code, synchronization tables, block-state data, diagnostic dispatch and no-emit control. |
| Parser stack | Entry layout by byte and maximum entries for the declared source bounds. Separate fixed writable reservation from Z80 call-stack use. |
| Semantic value stack | Entry layout, maximum depth and writable bytes; include type, enum identity, constant value/sign and emission state where present. |
| Static frames and globals | Writable bytes for parser routine frames, result/pending cells, scratch and candidate-specific state. |
| Shared constant storage | Token/keyword/operator tables shared with the tokenizer or checker, with ownership counted once in the whole-program total. |
| Runtime support | Any new helpers, call sites or adapters required by the parser family. |

Report code bytes, constant bytes, writable bytes, maximum Z80 stack bytes and
whole-image effect separately. Draw the lifetime overlay for workspace shared
with analysis, layout, emission, symbols or labels. A parser that moves bytes
from code to permanently reserved RAM has not established a whole-program
saving until the complete map shows one.

Compile or assemble each candidate under the same target origin, lowering,
runtime and optimization settings. Run the same positive, negative and recovery
corpora and collect representative instruction counts in addition to size.
Where only an estimate is possible, show each assumed instruction sequence and
label it as an estimate. Replace it with an emitted map as soon as the seed can
compile the prototype.

The comparison baseline is the current front end compiled with the same tool
chain. Historical source-line tables and a host-language prototype are useful
for locating structure but cannot fill the baseline byte column.

## Corpus and acceptance gates

Use one versioned corpus and one expected-result manifest for every candidate.
It must contain:

- every Candlemoth `.lafy` file, including generated `runtime.lafy`, as a
  positive corpus; `runtime.asm` is the generation authority for that file,
  not Lanternfly parser input;
- the concatenated compiler stream in its real bootstrap order;
- one minimal positive program or fragment for every production and optional
  branch;
- boundary values for decimal literals, array lengths, argument counts and the
  declared nesting limits;
- one negative fixture for every excluded Level Zero form;
- malformed tokens, missing delimiters, missing line boundaries, misplaced
  declarations, comparison chains and name-led ambiguity cases;
- multi-error recovery files for every synchronization set;
- the precedence, associativity, predicate and logical-newline fixtures in this
  document.

Normalize parse and semantic traces so candidates can be compared without
sharing internal states. A trace record needs the source span, canonical
production ID, token consumption, predicate result, operator reduction,
semantic action and recovery transition. Keep symbol addresses and generated
labels out of the normalized identity unless the test concerns them.

A candidate passes the study gate only when:

1. the terminal validator and analyzer complete with no unexplained result;
2. every accepted fixture has the required normalized trace and every rejected
   fixture has the expected diagnostic class and termination behaviour;
3. all candidates run the identical corpus and declared limits;
4. associativity, short-circuiting, evaluation order and semantic predicates
   agree;
5. recovery always makes progress and respects its bounds;
6. the target cost report contains emitted or assembled evidence for every
   category, with estimates isolated from measurements;
7. the whole-program map and size-discipline acceptance rule are applied; and
8. the decision record explains why the selected family beats the alternatives
   for Candlemoth, not for a host compiler in general.

## Staged work plan

### Stage A: inventory and canonical grammar

Freeze parser expansion. Produce the source-feature inventory, contradiction
log, tokenizer terminal manifest, canonical machine-readable EBNF, predicate
registry and corpus manifest. Close `B-OP-MOD`, `B-STORAGE-STATIC`, expression
statements, local arrays and array-initializer cardinality through the authority
order or an explicit language decision. Do not write a candidate parser in
this stage.

### Stage B: analyzer and report

Implement or adopt the reproducible analyzer pipeline, validate it with known
fixture grammars, and emit EBNF expansion, nullable, FIRST, FOLLOW,
left-recursion, reachability, productivity, LL(1) conflict and witness reports.
Review every conflict against the canonical grammar. Do not transform the
canonical file to reduce the report.

### Stage C: candidate grammars and prototypes

Derive the predictive, LR/LALR and hybrid implementation grammars. Produce the
transformation ledgers, bounded stack layouts, normalized traces and Z80 cost
reports. Prototype only enough semantic action to measure the complete parser
paths; use the same tokenizer, corpus, bounds and lowering assumptions.

### Stage D: evidence-based decision record

Fill in the decision-report template below. Resolve every failed gate or state
why the candidate is withdrawn. Obtain approval for one parser family and its
implementation grammar. Approval closes the stop rule; reaching this stage
without a selected candidate does not.

### Stage E: implementation after approval

Implement the approved parser, preserve the canonical grammar and analyzer as
tests, and keep candidate cost assumptions in the emitted size report. Replace
the current parser subsystem only when the positive, negative, recovery and
self-compilation gates pass. Measure the whole image before claiming a saving.

## Decision-report template

The coding agent must complete this template with artifact paths and exact
measurements. “Smaller”, “simpler” and “more maintainable” require the evidence
named beside the claim.

```markdown
# Level Zero parser decision

Date and commit/worktree identity:
Canonical grammar path and hash:
Tokenizer manifest path and hash:
Corpus manifest path and hash:
Target profile, origin and lowering revision:

## Boundary decisions

| Issue | Decision | Authority/evidence | Compatibility effect |
| --- | --- | --- | --- |

## Analyzer result

- Nullable/FIRST/FOLLOW report:
- Left-recursion report:
- Reachability/productivity report:
- LL(1) conflicts and witness report:
- Predicate-resolved sites:
- Unresolved results: none / list and block decision

## Candidate measurements

| Cost in bytes | Current baseline | Predictive | LR/LALR | Hybrid |
| --- | ---: | ---: | ---: | ---: |
| Engine code | | | | |
| Grammar/operator tables | | | | |
| Semantic-action dispatch | | | | |
| Predicates and buffering | | | | |
| Recovery | | | | |
| Constant storage total | | | | |
| Writable parser storage | | | | |
| Maximum parser/value stack | | | | |
| Added runtime support | | | | |
| Whole-image bytes | | | | |

Estimated cells, if any, with assumptions:
Workspace overlays and lifetime proof:
Representative self-compilation instruction counts:

## Correctness gates

| Gate | Baseline | Predictive | LR/LALR | Hybrid | Evidence |
| --- | --- | --- | --- | --- | --- |
| Positive corpus | | | | | |
| Negative corpus | | | | | |
| Recovery corpus and progress bound | | | | | |
| Associativity/precedence traces | | | | | |
| Predicate audit | | | | | |
| Three-pass determinism | | | | | |

## Decision

Selected candidate:
Rejected candidates and evidence:
Trade-offs accepted:
Risks and bounded mitigations:
Required implementation grammar and transformation ledger:
Approval:
```

## Relation to the whole-program size target

The size-discipline document treats roughly 40–45K as a possible first correct
image and the low-to-mid 30K range as an investigation target. Those figures
are planning targets, not measured Candlemoth sizes and not parser budgets.
This study must report the parser's code, constant storage, writable storage,
stack and runtime effects inside the complete map. It must also report bytes
that can overlap later phases and bytes that remain live for the whole run.

A formally derived parser may remove duplicated control, reduce call depth or
compress state. It may instead spend more bytes on tables, stacks, predicate
dispatch or recovery. No saving is assumed. The approved decision must show
the complete target artifact and retain correctness, reproducible
self-compilation and the size-discipline gates. Until that report exists, the
current parser's footprint problem is established as a reason to study the
architecture, not as evidence for any particular replacement.
