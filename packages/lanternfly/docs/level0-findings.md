# Level 0, as the tokenizer found it

Phase 1 deliverable. Level 0's boundary was asserted in `level0.md` and is
here corrected by writing a real compiler front end against it —
`candlemoth/tokenizer.lafy`, uncompiled.

Seventeen findings, from writing the tokenizer and the expression parser and
then having both reviewed twice. Two of them are **retracted**: they claimed
language limitations that do not exist, which is the failure this exercise
was meant to catch and did. Seven are language
rules the draft had not accounted for; two are level-0 choices that turn
out to cost more than expected. None was discovered by reading the
specification, which is the point of the exercise.

## Language rules the draft ignored

### 1. Local declarations precede every statement

Section 4.2 puts a routine's local declarations before its statements, so a
`var` cannot appear inside a loop or a branch. The first draft declared a
class variable inside three separate loop bodies. Every scanning routine now
opens with its locals, several initialised to values the code immediately
overwrites, because a declaration needs an initialiser its type accepts and
the real first value is not available yet.

**Consequence for the seed.** Declaration-before-statement is a parser rule,
not a checker rule, so it costs nothing to enforce and should be enforced
from the first day. Programs written against a lenient seed will not compile
under Candlemoth.

### 2. A counted loop's control variable is an ordinary local

Section 10.1 declares `var level as u8` and then writes `for level = 1 to 10`.
The loop does not introduce the name. Five loops in the first draft used an
undeclared `index`.

### 3. RETRACTED — a statement is a logical line, not a physical one

**This finding was wrong, and wrong in the way that matters most here: it
asserted a language limitation without reading the language.** Section 2.4
says a physical newline ends a declaration or statement *except while inside
parentheses or square brackets*, and that a multiline expression outside
those adds parentheses. There is one statement per logical line.

So a long condition spans lines by being parenthesised, level 0 needs no
continuation convention, and the nested-`if` ladders the first draft grew
were unnecessary. Had the claim stood, level 0 would have been a syntactic
variant rather than a nested subset — valid level-0 source would have needed
structural rewriting before a level-2 compiler could accept it.

The tokenizer now tracks delimiter depth and emits a newline token only at
depth zero.

### 4. There is no `else if`

`if … then … else … end` nests. A tokenizer is a chain of tests, so the
first draft grew three levels of nesting in `skipBlanks` alone. The repair
is `select`, which level 0 has and which is both smaller and faster than a
compare chain — but `select` needs an ordinal selector, so a chain of
unrelated tests still nests.

### 5. RETRACTED — checked ordinal conversion already exists

**RETRACTED, for the same reason as finding 3.** Section 3 already defines
the checked integer-to-enum conversion: an invalid constant is a compile
error and an invalid runtime value raises `F-RANGE`. Level 0 listed integer
conversions and omitted the ordinal form, which is an omission rather than a
language limitation.

`classifyKeyword` is now `return Keyword(index)`, and the twenty-five-arm
`select` it replaces is gone. Its lowering is a range check over the
unchanged representation, and the bootstrap profile already carries the
non-returning range-fault service it needs.

The lesson is the one from finding 3: two of the sixteen findings here were
not findings at all, but claims about the language made without checking
it.

### 6. Names collide across the value and type namespaces in practice

The first draft had `tokenName` as both an enum member of `TokenKind` and a
module variable. Section 2.1 rejects that. The repair renamed the enum
members to `kindName` and the variable to `tokenNameIndex`. Enumeration
members occupy the ordinary value namespace, so a compiler with several
parallel enumerations needs a prefixing convention from the start.

### 7. One byte of lookahead is a real constraint, not a detail

A comment marker is two slashes and the first is consumed before the second
is seen. There is no push-back, so the tokenizer holds a `heldSlash` flag
and `nextToken` checks it twice — once on entry, once after `skipBlanks`.
Two-character operators (`<=`, `<>`, `>=`) avoid the problem only because
their first character is already committed to being punctuation.

**Consequence.** The machine contract's single-byte read is sufficient but
it pushes state into the tokenizer. A second lookahead byte would delete the
flag and both checks. Worth weighing when the parser adds its own lookahead.

## Level-0 choices that cost more than expected

### 8. No error subsystem is right, and the cost is visible

The panic-and-resynchronise argument holds: a module-level `fault` with an
early `return` reads perfectly well, and `reportFault` keeping only the
first fault is two lines. But every routine that can fault must return early
and every caller must not spin — `scanName` and `scanNumber` both consume
the remainder of the token before returning, which is resynchronisation
written by hand. That is the correct pattern; it is simply not free, and the
count of such sites will grow with the parser.

### 9. Aggregates cannot be local, which decides the design

Section 11.4 rejects a per-invocation aggregate local inside a recursive
cycle, and `nextToken` enters that cycle as soon as the parser calls it. So
the identifier staging buffer, `spelling`, is module level. Every table in
the tokenizer is module level for the same reason.

This is workable — it is how one would write it anyway — but it means the
tokenizer is not reentrant and cannot be instantiated twice. Nothing needs
that here. It will matter only if the compiler ever has to tokenize a
second stream while holding the first.

## What the expression parser added

`candlemoth/expression.lafy` is the tightest mutual-recursion cycle a
compiler has, so it tests what the tokenizer could not.

### 10. The depth-indexed pool is not needed, and `level0.md` should drop it

`level0.md` states a convention as mandatory: because a routine returns one
scalar and `write` is invalid on a scalar parameter, a routine with several
results passes a depth-indexed pool as a `write` aggregate.

The expression parser has exactly that problem — it must return a type, a
constant flag and a constant value — and does not need the pool. The three
results are **scalars**, held in module-level variables, and a caller that is
about to recurse copies what it needs into its own **ordinary locals** first.
Save-around-call then preserves those locals across the recursive call, which
is precisely the protocol's job.

`parseAdditive` shows the shape: it copies `resultType`, `resultIsConstant`
and `resultValue` into locals, calls `parseMultiplicative`, and combines.

A pool is needed only when a result is an **aggregate**, which no part of an
expression compiler produces. The convention should be recorded as available
rather than required, and the worked example in `level0.md` replaced with
this one, because the pool version is both larger and slower.

### 11. Nesting has to be bounded in the source, not by the machine

Recursive descent on malformed input recurses as deep as the input nests.
The stack watch in the test module reports depth but does not stop anything,
and the machine has no stack limit. So `parseExpression` counts depth itself
and faults at 32. That check belongs in every compiler written this way, and
it is a line of level-0 source rather than a language feature.

### 12. Constant folding needs a wider accumulator than the language has

Folding `leftValue + resultValue` in `u16` wraps where the specification's
result table says the intermediate is wider. The parser folds at the result
type and relies on the narrowing rule, which is correct but means a folded
constant and a computed one can differ at the boundary. The conforming order
— fold at the widest type, narrow at the destination — is what the code
does, and it is worth stating in the lowering table rather than leaving to
each implementation.

### 13. Six comparison operators nest six deep

With no `else if` and no set membership, testing whether a token is one of
six comparison operators is six nested `if`s. A `select` would express it,
but the selector is an enum member and the arms would each be one case, so
it is the same size. This is the shape of a chain of unrelated equality
tests in level 0, and the expression parser has three of them.

## Second-draft corrections

An independent review found seven defects in the first expression parser and
two prerequisites missing from the tokenizer. All nine are repaired; each is
recorded because the class of error matters more than the instance.

### 14. Two prerequisites the tokenizer was missing entirely

**Keywords were never installed.** `keywordName` was declared and read and
nothing ever filled it, so every keyword would have parsed as an ordinary
identifier. The first repair pushed each spelling into the staging buffer a
byte at a time — 130 lines of calls — which a reviewer correctly called
static data expressed as code. The absence of strings forces an explicit
byte representation; it does not force one call per byte. The spellings are
now a single 103-byte constant array with parallel offset and length tables,
copied by a two-line loop.

**Newlines were swallowed.** `skipBlanks` treated a newline as blank, so no
statement boundary ever reached the parser and a statement parser could not
have existed. Newline is now its own token kind, consecutive newlines
collapse to one so a blank line is not an empty statement, and `skipBlanks`
stops at a boundary rather than consuming it.

Both are the same class of error: a component tested only against itself
looks complete. Neither would have survived one attempt to parse a
declaration.

### 15. Seven defects in the first expression parser

- **Multiply and divide were conflated.** The operator was never saved, so
  both folded as a multiply and both raised divide-by-zero: `2 * 0` faulted
  and `8 / 2` folded to sixteen.
- **Section 3.1's widening rule was invented rather than implemented.** The
  first draft returned `i16` whenever either operand was `i16`. The rule
  widens only to a type *already written on the other side* and never
  searches for a third, so `u8 + u16` is `u16` but **`i16 + u16` requires an
  explicit conversion** and is now rejected.
- **Every literal was typed `u16` on sight**, discarding the exact-untyped
  state that section 3.1 makes central. `typeExact` now exists as a type
  kind, and `settleExpression` is the one place an exact value stops being
  exact — adopting an expected type, or `i16` when none is supplied.
- **Folding and emission disagreed.** Operands emitted their loads before
  anything knew whether the expression would fold, so `1 + 2` folded to
  three while leaving two in the accumulator. Constants now materialise only
  where something consumes them that could not fold them, and a wholly
  constant expression emits nothing at all.
- **Nesting was bounded only at `parseExpression`**, which a chain of `not`
  or unary minus never re-enters. Every recursive entry now counts through
  `enterNesting`.
- **Exact folding claimed a width it did not have.** All values are `u16`,
  so an exact subtree leaving that range wrapped silently. It now raises
  `exprFaultExactOverflow`. Mathematical evaluation at arbitrary width is
  not available to a compiler with sixteen-bit arithmetic, and that is a
  real divergence from section 3.1 worth stating rather than hiding.
- **`level0.md` kept the superseded pool rule** immediately above its own
  correction. The mandatory version and its example are gone.

### 16. One operand sequence serves both folding paths

The repair produced a shape worth keeping. Whichever side folded, both paths
end with the left operand in `DE` and the right in `HL`: a constant left
operand loads `DE` directly, a computed one is pushed and popped. So
addition is one instruction and subtraction is one exchange plus two, with
no separate case for a constant on either side.

### 17. Five more defects, and a pattern in them

A second review pass found five further faults in the tokenizer, all in
paths that a component tested against itself never reaches.

- **Decimal overflow accepted 65536 through 65539.** The guard rejected
  above 6553 before the multiply, so exactly 6553 followed by a digit above
  five wrapped silently. Four invalid literals became small values, which in
  compiler source silently alters an array capacity or an address.
- **The `<` scanner could consume three characters.** Two independent `if`
  tests meant `<>` followed by `=` consumed all three and reported `<=`,
  losing a token. They are now exclusive.
- **The fault paths did not resynchronise**, although this document claimed
  they did. `scanName` and `scanNumber` returned with the offending suffix
  still unread, so a caller asking for another token met the same suffix and
  could spin. Both now consume through the end of the token.
- **A held slash took the following line number.** `skipBlanks` consumes the
  byte after a slash before deciding whether it starts a comment, and
  `advance` increments the line as soon as that byte is a newline. A
  diagnostic on that slash reported the next line. The slash's own line is
  now saved with it.
- **The lexical subset was implicit.** The tokenizer accepts decimal and
  nothing else, while `level0.md` excluded only strings. Decimal-only is now
  stated, with hexadecimal, binary and character literals explicitly outside
  level 0, so the seed and Candlemoth cannot each follow a reasonable
  reading and accept different source.

**The pattern is worth more than the five.** Every one of them is on a path
the tokenizer never takes when reading its own well-formed source: an
overlong number, a malformed operator, a fault followed by recovery, a slash
at a line end. A front end that only ever parses correct input looks
finished long before it is.

## What the tokenizer actually uses

Confirmed against the source, and this is the level-0 boundary as measured
rather than asserted:

| Feature | Used |
| --- | --- |
| `u8`, `u16`, `boolean` | yes |
| `i16` | yes — the expression parser's result types demand it |
| enumerations over `u8` | yes, four of them |
| one-dimensional arrays | yes, seven |
| records | **not once** |
| conversions `u8()`, `u16()` | yes, in hashing and index arithmetic |
| module `const`, module `var` | yes |
| routine locals, scalar | yes |
| routine locals, aggregate | no — section 11.4 forbids it here |
| `static var` | no |
| `sub` with parameters and result | yes |
| `forward sub` | yes, for the whole declaration prologue |
| recursion | yes, in the expression parser, nine routines deep |
| `if` / `else` | yes |
| `while` | yes |
| `for … until` | yes |
| `for … to` | no |
| `select` with `else` | yes, four of them |
| `exit` | yes |
| `continue` | no |
| `and`, `or`, `not` | `and` only, once, as a mask |
| `readSourceByte` | yes |
| `writeCodeByte` | yes, in the emitter |
| the other three intrinsics | not yet |

**Records are unused so far**, which is a surprise worth carrying into the
parser rather than acting on. If the parser and code generator also avoid
them — using parallel arrays instead, which is what the name tables here do
— then records are a candidate for removal from level 0, and that would take
field-offset computation and exact-layout rules out of the seed.

## Sizes, for the Phase 3 comparison

Tokenizer: 676 lines, of which the character-class table is 65 and the
keyword tables 22. Expression parser and emitter: 720 lines.

No compiled size exists yet. The character-class table alone is 256 bytes of
the image, or 1% of the twenty-four-kilobyte estimate, before any code.
