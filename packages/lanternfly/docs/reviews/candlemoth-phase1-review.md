# Candlemoth Phase 1 review

Status: current review

Reviewed: 5 August 2026

Targets: `candlemoth/tokenizer.lafy` at `c90097c`, *Candlemoth — tokenizer*;
`candlemoth/expression.lafy` at `350ba97`, *Candlemoth — expression parser and
emitter*; `level0-findings.md`, *Level 0, as the tokenizer found it*;
`level0.md`, *Lanternfly Level 0 — draft for review*; and the reconciled
specification.

This review checks whether the first empirical Level 0 program is a complete
tokenizer for its stated subset and whether the findings agree with the
normative language. It is non-normative. The reconciled specification remains
the language authority.

## Blocking correctness findings

### 1. Keyword recognition has no keyword data

**Status:** Open

**Evidence.** `keywordName` is a zero-initialised module array. No constant
contains the keyword spellings, and `startTokenizer` clears the name table but
does not intern keywords or populate `keywordName`. `classifyKeyword` compares
each token's name index with those zero entries.

**Consequence.** The first interned identifier has index zero and is classified
as `keywordSub`; every later keyword is normally classified as a name. The
tokenizer cannot yet recognize the Level 0 grammar it is intended to parse.

**Smallest credible repair.** Add a fixed keyword spelling table and intern it
before reading the first source token. Record the resulting name indices in
`keywordName`. Test every keyword, a mixed-case spelling and an identifier
that differs from a keyword by one character.

### 2. The tokenizer discards statement boundaries

**Status:** Open

**Evidence.** Newline is a grammar-significant token in Lanternfly: one
logical line contains at most one statement. `skipBlanks` handles
`classNewline` by calling `advance`, and `TokenKind` has no newline member.
The parser therefore receives the same token stream for two statements on one
line and the same statements on two lines.

**Consequence.** Candlemoth cannot enforce the one-statement-per-logical-line
rule, terminate declarations and simple statements correctly, or implement
the existing parenthesised continuation rule. This is a missing lexical
contract, not merely a readability issue.

**Smallest credible repair.** Add a logical-newline token. Emit it for a
physical newline outside parentheses and brackets, suppress it inside those
delimiters, collapse blank and comment-only lines, and synthesize one at end
of input when the last line contains tokens. Test both statement separation
and parenthesised continuation.

### 3. Decimal overflow accepts 65536 through 65539

**Status:** Open

**Evidence.** `scanNumber` rejects only when the accumulated value is greater
than 6553 before multiplying by ten and adding the next digit. When the value
is exactly 6553, final digits six through nine exceed `u16`, but the current
check permits them and fixed-width arithmetic wraps.

**Consequence.** Four invalid literals are accepted with small values instead
of producing `faultNumberTooLarge`. This can silently alter array capacities,
addresses and constants in compiler source.

**Smallest credible repair.** Reject when the accumulated value exceeds 6553,
or equals 6553 while the next digit exceeds five. Test 65535, 65536, 65539 and
65540.

### 4. The less-than scanner can consume three characters

**Status:** Open

**Evidence.** The less-than arm tests for `>` and `=` in two independent
`if` statements. Given the source `<> =`, the first test consumes `>`, after
which the second test sees and consumes `=` and changes the result from
`punctNotEqual` to `punctLessEqual`.

**Consequence.** The tokenizer loses a token and reports the wrong operator.
The parser receives one `<=` token where the source contains `<>` followed by
`=`.

**Smallest credible repair.** Make the tests exclusive with a nested `else`,
then test `<>`, `<=`, `<`, `<> =` and `<==` as token sequences.

### 5. Fault paths do not perform the recorded resynchronisation

**Status:** Open

**Evidence.** `level0-findings.md` says that `scanName` and `scanNumber`
consume the remainder of a faulty token before returning. Both routines return
immediately at their limit check while `nextByte` still holds the offending
letter or digit.

**Consequence.** A caller that requests another token after recording the
fault encounters the same suffix again. The findings document currently
credits the implementation with a recovery property it does not have, and the
future parser can spin unless it supplies a separate recovery step.

**Smallest credible repair.** Either consume through the end of the name or
number before returning, or state that these routines do not resynchronise and
make the parser's recovery boundary explicit. Add a test that continues after
each fault and reaches the following token.

## Normative reconciliation findings

### 6. Lanternfly already defines multiline expression continuation

**Status:** Open

**Evidence.** Finding 3 says that a condition cannot span physical lines and
proposes deciding on a continuation convention. Section 2.4 of the reconciled
specification already says that a physical newline does not end a declaration
or statement while inside parentheses or square brackets. A multiline
expression outside them adds parentheses.

**Consequence.** Treating every physical newline as final would make Level 0
a syntactic variant rather than a nested subset: valid Level 0 source would
need structural rewrites before a Level 2 compiler could accept it unchanged.

**Smallest credible repair.** Inherit the existing logical-line rule. Permit a
long condition to span physical lines when enclosed in parentheses, and make
the tokenizer or parser track delimiter depth before emitting a logical
newline. No new continuation syntax is needed.

### 7. Checked integer-to-enum conversion is an existing language operation

**Status:** Open

**Evidence.** Finding 5 presents integer-to-enum conversion as a possible new
language decision. Section 3 of the reconciled specification already defines
it: an invalid constant is a compile error and an invalid runtime value raises
`F-RANGE`. Level 0 currently lists integer conversions but omits the enum form.

**Consequence.** Keeping the omission forces repeated generated `select`
ladders even though full Lanternfly already has the precise checked operation
the compiler needs. Adding a different cast would duplicate existing
semantics.

**Smallest credible repair.** Admit the existing checked ordinal conversion
into Level 0 and write `Keyword(index)`. Its lowering is a range check followed
by the unchanged representation; the bootstrap profile already requires the
non-returning range-fault service. Add constant-valid, constant-invalid,
runtime-valid and runtime-invalid lowering vectors.

### 8. The Level 0 lexical subset is still implicit

**Status:** Open

**Evidence.** The tokenizer accepts decimal integers but not hexadecimal,
binary or character literals, all of which belong to the first-edition lexical
grammar. `level0.md` excludes strings but does not explicitly retain or remove
the other literal forms. The empirical rule can justify decimal-only source,
but the grammar deliverable has not recorded that boundary.

**Consequence.** The seed and Candlemoth can accept different Level 0 source
while each appears to follow a reasonable reading of the documents.

**Smallest credible repair.** List the retained literal forms in the Level 0
grammar. If Candlemoth uses decimal only, state that hexadecimal, binary and
character literals are outside Level 0 and add one rejection case for each.
If they remain in the subset, implement and test them before calling the
tokenizer complete.

## Lower-priority correctness finding

### 9. A held slash can acquire the following line number

**Status:** Open

**Evidence.** `skipBlanks` consumes the byte after a slash before deciding
whether the slash begins a comment. `advance` increments `sourceLine` as soon
as that next byte is a newline. If the slash is an operator immediately before
the newline, `nextToken` later assigns it the already-incremented line number.

**Consequence.** A diagnostic attached to that slash reports the following
line. Parsing is unaffected, but source locations become unreliable at a
common line boundary.

**Smallest credible repair.** Record the slash's line when setting
`heldSlash`, and use that saved line when emitting the delayed token. Test a
slash followed immediately by a newline.

## Expression parser findings

### 10. Multiplication and division are not distinguished

**Status:** Open

**Evidence.** `parseMultiplicative` accepts either `*` or `/` but does not save
which operator it consumed. When both operands are constant, it reports
division by zero whenever the right value is zero and otherwise calculates
`leftValue * resultValue` for both operators.

**Consequence.** `2 * 0` faults, while `8 / 2` folds to sixteen. These are
ordinary expressions in the compiler's own subset, so later phases cannot use
the parser as a semantic oracle.

**Smallest credible repair.** Save the operator before consuming it, give
multiplication and division separate folding and emission paths, and test both
operators with zero and nonzero operands.

### 11. Several expression type rules disagree with section 3.1

**Status:** Open

**Evidence.** `additiveResult` returns `i16` whenever either operand is `i16`,
which silently accepts `i16` combined with `u16`; the specification requires
an explicit conversion for that pair. `parseUnary` assigns `i16` to every
unary minus, although unary minus is invalid for `u16`, retains `i16`, and
produces `i16` from `u8`. `parseComparison` checks a Boolean mismatch only
when the left operand is Boolean, so a numeric left operand and Boolean right
operand pass without a fault. `parseMultiplicative` performs no operand-type
check and always reports `u16`.

**Consequence.** Candlemoth can accept programs a conforming compiler rejects
and can assign the wrong type to valid expressions. The independently written
seed could then disagree before code generation begins.

**Smallest credible repair.** Centralise the section 3.1 compatibility and
result tables, including asymmetric widening, and call them from every unary,
arithmetic and comparison parser. Add table-driven vectors for every Level 0
type pair rather than testing representative cases only.

### 12. Exact literal typing is missing

**Status:** Open

**Evidence.** `parsePrimary` immediately assigns every decimal literal
`typeU16`. The specification keeps a literal exact until an expected type or a
typed operand supplies its context. This distinction occurs in the tokenizer
source itself: in `nextByte - 48`, the literal adopts `u8`, so the subtraction
has result type `i16`; treating 48 as `u16` instead widens `nextByte` and makes
the subtraction `u16`.

**Consequence.** Level 0 source can acquire different result types under
Candlemoth and a Level 2 compiler even though Level 0 is required to be a
nested subset with unchanged meaning.

**Smallest credible repair.** Represent an exact literal separately from the
four runtime types and resolve it when a typed operand or destination context
is known. The statement and declaration parsers must supply expected types
where the specification propagates them. Add vectors drawn directly from
Candlemoth's own arithmetic expressions.

### 13. Constant folding and emitted code do not describe the same result

**Status:** Open

**Evidence.** The parser emits loads, pushes and pops while descending before
it knows whether the enclosing expression is constant. For `1 + 2`, it emits
a load of one, a push, a load of two and a pop, then records the folded value
three without emitting the addition or replacing the earlier sequence. The
result metadata says three while the emitted accumulator holds two. Computed
Boolean, comparison, multiply and divide paths also record a result without
emitting their operation.

**Consequence.** Layout counts bytes that do not implement the expression,
and emission can produce incorrect machine code while the folding metadata is
correct. The current file therefore cannot yet validate code size or
layout/emission agreement.

**Smallest credible repair.** Separate parsing and constant analysis from
emission, or buffer an expression's emitted form until the fold decision is
known. Until Phase 3 supplies complete lowering, describe this file as a
parser with provisional emitter shapes rather than a working expression
emitter.

### 14. The nesting guard omits recursive unary chains

**Status:** Open

**Evidence.** `depth` is checked only in `parseExpression`, which bounds
parenthesised recursion through `parsePrimary`. `parseNot` calls itself for
each `not`, and `parseUnary` calls itself for each minus without changing that
counter.

**Consequence.** A malformed or adversarial source containing a long unary
chain can still exhaust the machine stack despite the stated depth limit.

**Smallest credible repair.** Apply one syntactic-depth budget to every
recursive edge, or add equivalent checks to `parseNot` and `parseUnary`. Test
the limit separately with parentheses, `not` and unary minus.

### 15. The constant-folding finding claims a width the implementation lacks

**Status:** Open

**Evidence.** `level0-findings.md` says that folding requires a wider
accumulator and that the parser implements “fold at the widest type, narrow at
the destination.” The parser stores both operands and the result in `u16` and
performs its arithmetic through those values. It has no exact or wider
accumulator and receives no destination type.

**Consequence.** The findings ledger presents an unresolved representation
problem as an implemented rule. This can cause the lowering table and seed to
copy a mechanism that is not present.

**Smallest credible repair.** Separate the two cases explicitly. Fixed-width
runtime operations fold with their specified wrapping width. Exact literal
subtrees need an exact representation or a deliberately restricted Level 0
rule, and destination-context folding requires the future statement parser to
provide that context. Record the chosen representation before claiming the
rule is implemented.

### 16. The mandatory-pool correction remains layered over the old rule

**Status:** Open

**Evidence.** `level0.md` still states that the depth-indexed pool is “the
convention,” retains the pool example, and then adds a “Measured correction”
that says scalar results do not need it. These adjacent paragraphs prescribe
both the old mandatory rule and its replacement.

**Consequence.** An implementation agent can reasonably follow either rule,
and the normative subset carries project history instead of one current
contract.

**Smallest credible repair.** Replace the old paragraph and example. State the
module-level result plus caller-local snapshot convention for scalar results,
then describe a depth-indexed pool only as the available mechanism for an
aggregate result that must survive recursive overlap.

## Decision carried forward

Records should remain under observation through the parser and code generator.
Their absence from a tokenizer does not support removal by itself: tables of
scalar columns are a natural tokenizer representation. If the complete
self-hosting source never uses record construction, field selection or arrays
of records, removing records from Level 0 would then eliminate real seed and
lowering work without changing Candlemoth.
