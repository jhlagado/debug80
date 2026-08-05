# Candlemoth Phase 1 review

Status: current review

Reviewed: 5 August 2026

Targets: `candlemoth/tokenizer.lafy` at `c90097c`, *Candlemoth — tokenizer*;
`candlemoth/expression.lafy` at `350ba97`, *Candlemoth — expression parser and
emitter*; `level0-findings.md`, *Level 0, as the tokenizer found it*;
`level0.md`, *Lanternfly Level 0 — draft for review*; and the reconciled
specification.

Repair verification: `ef63162`, *Repair the expression parser and the
tokenizer's two prerequisites*.

This review checks whether the first empirical Level 0 program is a complete
tokenizer for its stated subset and whether the findings agree with the
normative language. It is non-normative. The reconciled specification remains
the language authority.

## Blocking correctness findings

### 1. Keyword recognition has no keyword data

**Status:** Resolved — `installKeywords` now interns every keyword before the
first source token and records its name index.

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

**Status:** Resolved — `kindNewline` preserves and collapses physical newline
boundaries, `delimiterDepth` suppresses them inside parentheses and brackets,
and `pendingFinalNewline` synthesises the boundary a source omits when its last
line carries tokens.

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

**Status:** Resolved — rejects above 6553, and at 6553 when the next digit
exceeds five; both paths resynchronise.

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

**Status:** Resolved — the two tests are exclusive, so `<>` followed by `=`
stays two tokens.

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

**Status:** Resolved — `scanName` and `scanNumber` consume through the end of
the token before returning.

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

**Status:** Resolved — section 2.4's logical-line rule is inherited, the
tokenizer tracks delimiter depth, and finding 3 of `level0-findings.md` is
retracted.

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

**Status:** Resolved — `Keyword(index)` replaces the twenty-five-arm select,
and finding 5 of `level0-findings.md` is retracted.

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

**Status:** Resolved — Level 0 retains decimal literals only and explicitly
excludes hexadecimal, binary and character literals.

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

**Status:** Resolved — the slash's own line is saved when it is held.

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

**Status:** Resolved — the operator is saved, constant multiplication and
division fold through separate exact routines, and `emitMultiplicative` plants
a call to the multiply, unsigned-divide or signed-divide runtime routine for
every computed form.

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

**Status:** Resolved — `unifyTypes` implements the asymmetric widening rule,
`yieldFolded` range-checks every folded result against the type the operation
produced, and unary minus negates in exact space so a value that leaves the
destination's range faults rather than wrapping.

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

**Status:** Resolved — `typeExact` preserves the untyped state and
`settleExpression` checks the value against its expected type, or against the
default `i16` when the context supplies none, reporting `exprFaultConstantRange`
when it does not fit.

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

**Status:** Resolved — constants no longer emit eagerly, every computed path
emits its operation (byte-wide sequences for Boolean and, or and not; a helper
call for each comparison, multiply and divide), and `foldComparison` evaluates
a folded comparison against its operator and operand signs.

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

**Status:** Resolved — `enterNesting` now covers parenthesised expressions,
recursive `not` and recursive unary minus.

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

**Status:** Resolved — an exact value is a magnitude with a separate sign, so
the representable range is -65535 through 65535. `exactAdd`, `exactMultiply`
and `exactDivide` carry that representation through every fold, and
`exactMultiply` detects a product beyond sixteen bits by dividing back.
`level0-findings.md` finding 12 records the chosen representation.

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

**Status:** Resolved — the obsolete mandatory rule and example have been
replaced by the scalar-result convention, with a pool retained only for an
aggregate result.

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

## Follow-up architecture finding

### 17. The keyword installer turns static data into repeated code

**Status:** Resolved — the spellings are one 103-byte constant array with
parallel offset and length tables, copied by a two-line loop. The 130 lines of
`addLetter` calls are gone and the tokenizer is 676 lines, down from 887.

**Evidence.** `installKeywords` spells every keyword through a sequence of
`addLetter` calls, producing roughly 130 lines of source. Level 0 has no string
type, but it does have constant byte arrays, as the character-class table
already demonstrates. The absence of strings therefore requires an explicit
byte representation; it does not require one call per byte.

**Consequence.** Unless the compiler performs substantial inlining and
folding, the installer converts a small fixed data set into repeated load and
call sequences in Candlemoth's code budget. It also obscures the correspondence
between the keyword spellings, offsets and enum ordinals.

**Smallest credible repair.** Store the folded spellings in one constant byte
array with parallel offset and length tables. A short loop copies each slice
to `spelling` and interns it. Measure both forms once the seed exists; retain
the call form only if its compiled cost is competitive.

## Decision carried forward

Records should remain under observation through the parser and code generator.
Their absence from a tokenizer does not support removal by itself: tables of
scalar columns are a natural tokenizer representation. If the complete
self-hosting source never uses record construction, field selection or arrays
of records, removing records from Level 0 would then eliminate real seed and
lowering work without changing Candlemoth.

**Source survey.** The symbol table and the declaration and statement parser
drafts bring the current source to 3,151 lines across four files, with no
record declared in any of them. Every current table uses parallel scalar
columns, including the symbol table's eight fields. The code generator is the
last place records could earn inclusion, but the parser must first accept the
record grammar already present in Level 0. `level0-findings.md` finding 24
records the source evidence; the decision itself remains open.

## Front-end release gate

### 18. The parser cannot parse Candlemoth's own source

**Status:** Open — blocking.

**Evidence.** `parseUnit` accepts forward routines, routines and the statement
forms implemented by `parseStatement`. Candlemoth's first declaration is an
`enum`, and its current source also contains constant array initialisers,
`select` / `case`, integer and checked-enum conversions, and integer `and`.
There is no parser for those forms. `parseTypeName` recognises only four
built-in scalar names, and `parsePrimary` treats a name followed by `(` as a
bare name rather than a conversion.

**Consequence.** The clean name-resolution scan does not establish a complete
front end. The parser faults on the first declaration of the program it is
meant to compile, before reaching statement lowering.

**Smallest credible repair.** Add the self-hosting forms in dependency order:
enum and type symbols with conversions; constant arrays; `select` / `case`;
integer word operators; then the remaining Level 0 aggregate declarations and
parameters. Run the concatenated four-file source through analysis and require
end of input with no lexical, expression, statement or symbol fault.

### 19. Boolean operators do not short-circuit, and integer word operators are absent

**Status:** Open — blocking semantic error. This reopens the Boolean part of
finding 13.

**Evidence.** `parseOr` and `parseAnd` parse and emit the right operand before
examining the left value, then combine computed operands with an eager byte
operation. Section 8.4 requires the right operand of Boolean `or` to be skipped
when the left is true and the right operand of Boolean `and` to be skipped when
the left is false. The skipped operand must perform no storage access, bounds
check or fault. Both routines also require Boolean operands, while
`hashSpelling` uses integer `and` with `bucketMask`.

**Consequence.** A bounds fault in a skipped Boolean operand still occurs, and
the expression parser rejects Candlemoth's own hashing expression.

**Smallest credible repair.** Lower Boolean `and` and `or` through conditional
branches around the right operand. Add eager integer `and`, `or` and `not`
paths with result types from section 3.1. Verify a skipped bounds fault as well
as Candlemoth's integer mask expression.

### 20. Re-entering the first forward routine removes later declarations

**Status:** Open — blocking symbol-table error.

**Evidence.** A forward declaration stores its parameter slots immediately
after its routine slot. When the later body calls `reenterLocals`, `bodyBase`
returns to the end of that early parameter range. Locals are appended at the
current end of the table, after all later forward declarations. `leaveLocals`
then assigns `symbolCount = bodyBase`, removing every symbol declared after
the routine whose body was just read. The visibility rule has the related
problem: later routines' depth-one parameter slots lie above `localBase` and
therefore appear visible inside an earlier body.

**Consequence.** The forward-declaration prologue used by Candlemoth cannot
survive parsing its first body, and names from later parameter lists may resolve
inside the wrong routine.

**Smallest credible repair.** Keep persistent declarations separate from the
current body's transient locals, or retain all slots and identify visibility
by the current routine's exact parameter and local ranges. Leaving a body must
not move the persistent declaration high-water mark backwards. Test at least
two forwards followed by their bodies in declaration order and reverse order.

### 21. Local declarations are accepted after statements and inside blocks

**Status:** Open — conformance error.

**Evidence.** Finding 1 correctly states that routine declarations precede
every statement. `parseStatement` nevertheless accepts `var` and `const`, and
the same routine parses the bodies of `if`, `while` and `for` blocks.

**Consequence.** The seed can accept source that the reconciled specification
rejects, including declarations inside loops and branches. Such source would
not remain valid when compiled at a higher level.

**Smallest credible repair.** Parse one declaration prefix after the routine
header, then parse a statement-only body. Remove declaration forms from
`parseStatement` and add rejection fixtures after the first statement and
inside each block form.

### 22. The fixed-storage total is incomplete and mixes writable and constant data

**Status:** Open — budget correction required.

**Evidence.** The current declarations contain 17,584 bytes of writable array
storage: 7,284 in the tokenizer, 28 helper-address bytes, 6,144 symbol bytes
and 4,128 label and loop-stack bytes. Constant arrays occupy another 464 bytes
in the image. The stated 17,780-byte RAM total includes the constant
character-class table but omits other constant tables, helper addresses and
loop stacks. It also excludes scalar globals, static frames, recursive
save-around state, the runtime stack and the source window.

**Consequence.** The number cannot yet support the 64K feasibility claim. Code,
constant data and writable storage are useful budget categories, but all share
the same flat address space.

**Smallest credible repair.** Generate the budget from declarations and report
constant image bytes, writable static bytes, reserved stack, source window and
remaining headroom separately. Keep the 24K code estimate as one component of
the 64K map, not as a non-competing budget.

### 23. Exact folding is also applied to typed arithmetic

**Status:** Open — blocking semantic error.

**Evidence.** Every folded addition, subtraction, multiplication and division
runs through the magnitude-and-sign exact routines and then through
`yieldFolded`, even when the operands already have `u16` or `i16` types. Section
3.1 requires mathematical evaluation only while a subtree remains exact;
typed arithmetic wraps in its selected result width. The same type table is
still incomplete at unary and comparison boundaries: unary minus does not
reject `u16` or `boolean`, and `unifyTypes` rejects every Boolean comparison
although Boolean `=` and `<>` are valid.

**Consequence.** A folded typed expression can fault where its emitted form
wraps, and ordinary valid expressions can be accepted or rejected under the
wrong type rule. The seed and Candlemoth could therefore disagree before any
statement lowering is involved.

**Smallest credible repair.** Keep magnitude-and-sign evaluation only for an
exact subtree. Fold a typed operation in its declared result width, using the
same bit-pattern rule as emitted code. Complete the unary and comparison type
tables and exercise every Level 0 type/operator pair, including typed overflow,
invalid unary minus and Boolean equality.

## Phase 1 status

The tokenizer now synthesises a final logical newline, and the expression
changes repair several previously reported defects. Findings 19 and 23 show
that the expression gate is not yet closed. The broader release gate also
remains open: the four files resolve names against one another, but the grammar
cannot parse those files and the lowering has not been compiled or executed.

Commit this source as an empirical front-end draft. Phase 1 becomes complete
when the parser accepts the complete concatenated source, the symbol table
survives its forward-declaration prologue, the operator semantics match the
specification, and the resulting program has been compiled and exercised.
