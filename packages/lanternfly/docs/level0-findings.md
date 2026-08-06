# Level 0, as the tokenizer found it

Phase 1 deliverable. Level 0's boundary was asserted in `level0.md` and is
here corrected by writing a real compiler front end against it —
`candlemoth/tokenizer.lafy`, uncompiled.

The findings began with the tokenizer and expression parser and now include
the first symbol-table and statement-parser drafts. Two early findings are
**retracted**: they claimed language limitations that do not exist. The
current release gate is recorded in
`reviews/candlemoth-phase1-review.md`; this file preserves what writing the
compiler taught us without treating uncompiled source as proof of completion.

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

This works for Candlemoth, but it means the tokenizer is not reentrant and
cannot be instantiated twice. Nothing needs that here. It will matter only
if the compiler ever has to tokenize a second stream while holding the first.

## Expression parser findings

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
result table says the intermediate is wider. Level 0 has no type wider than
sixteen bits, so the exact accumulator is built rather than declared: a `u16`
magnitude with a separate `boolean` sign, which covers -65535 through 65535.
`exactAdd`, `exactMultiply` and `exactDivide` work in that pair, and
`yieldFolded` checks the result against the type the operation produced.

Overflow detection is written the same way, because level 0 exposes no carry
flag and no wider intermediate. An addition of like signs has overflowed when
the sum is below either operand; a multiplication has overflowed when dividing
the product by one operand fails to return the other. Both are arithmetic
tests over the same sixteen bits, which is the level-0 shape of a check that
a wider language reads from a flag.

The third draft of the parser implements this. The rule to record in the
lowering table is: an exact subtree evaluates in magnitude-and-sign, and
narrows once at the destination.

### 13. Six comparison operators nest six deep

With no `else if` and no set membership, testing whether a token is one of
six comparison operators is six nested `if`s. A `select` would express it,
but the selector is an enum member and the arms would each be one case, so
it is the same size. This is the shape of a chain of unrelated equality
tests in level 0, and the expression parser has three of them.

## Second-draft corrections

An independent review found seven defects in the first expression parser and
two prerequisites missing from the tokenizer. The second draft addressed
those nine; the later front-end review found further operator and folding
cases, recorded in the Phase 1 review. Each correction remains here because
the class of error matters more than the instance.

### 14. Two prerequisites the tokenizer was missing entirely

**Keywords were never installed.** `keywordName` was declared and read and
nothing ever filled it, so every keyword would have parsed as an ordinary
identifier. The first repair pushed each spelling into the staging buffer a
byte at a time, producing 130 lines of calls that expressed static data as
code. The absence of strings forces an explicit
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

## Measured feature use

Confirmed against the source, and this is the level-0 boundary as measured
rather than asserted:

| Feature | Used |
| --- | --- |
| `u8`, `u16`, `boolean` | yes |
| `i16` | yes — the expression parser uses it for result types |
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

### 18. Every value-producing comparison is a call

The Z80 compares by subtracting and reading flags, and it has no instruction
that leaves the answer as a value. A comparison used as an operand — which is
every comparison in an expression grammar — is therefore a call to a runtime
routine. Multiply and divide are calls for the plainer reason that the
machine has neither.

That makes fourteen runtime routines before the compiler emits a single
statement: multiply, unsigned divide, signed divide, equality, inequality,
four orderings in each signedness, and the subscript bounds check. The signed
and unsigned orderings differ because a sixteen-bit subtract leaves the
unsigned answer in the carry and the signed answer in the sign against
overflow, so one routine cannot serve both.

A folded comparison costs nothing, and `foldComparison` takes that path
whenever both operands fold. The count matters for the twenty-four-kilobyte
estimate: fourteen small routines are perhaps three hundred bytes, and the
call sites are three bytes each against the one or two bytes an operation
would take inline on a machine that had one. `docs/level0-lowering.md` gives
each routine's register contract and its ordinal in the address table.

## Statement-parser findings

The symbol table and declaration and statement parser drafts supply the
destination type the expression parser had no caller for. They also expose
which Level 0 forms still have no parser; the Phase 1 review records those
open release-gate findings.

### 19. A streaming output forbids back-patching, and the label table is the bill

The emission pass writes each code byte to a port, so the output cannot be
seeked and a forward branch cannot be filled in once its target is reached.
The three passes already solve this — the layout pass records each label's
address and the emission pass reads a table that is already complete — but the
table has to be global. Reset the label counter per subroutine and the emission
pass reads the addresses of whichever subroutine the layout pass happened to
finish with.

Two thousand labels is four kilobytes of RAM, the largest single table in the
compiler and a sixth of the whole level-0 estimate. A compiler that could seek
in its own output would spend a two-entry stack per open construct instead.
The cost belongs to the port-stream boundary rather than to the language, and
it is the strongest argument yet for the three-pass design: two passes would
need the same table *and* a resident image.

### 20. `for … until` and `for … to` are both load-bearing

Level 0 has both, and Candlemoth's own source uses `until` — `installKeywords`
is written that way, and so are four loops in the tokenizer. A compiler that
accepted only `to` could not compile itself. The two differ by one comparison:
`to` leaves the loop when the control variable passes the limit, `until` when
the two are equal.

This is an empirical confirmation that both forms in the declared Level 0
subset are load-bearing. The same check should be applied deliberately to
every construct before the seed is written.

### 21. Parameters outlive their subroutine, which inverts the usual scope rule

Static frames mean a parameter has a fixed address, so a call site stores its
arguments straight into the callee's parameter storage. That storage is
addressed by offset from the subroutine's own symbol slot, so the parameter
slots must stay in the table after the subroutine ends — release them and every
later call site finds nothing there.

They must also stop being *visible*, or a module-level name would resolve to
some earlier subroutine's parameter. Both hold at once with one rule: the scan
skips a depth-one slot below `localBase`, and `leaveLocals` sets `localBase` to
the new top. Locals are discarded, parameters are kept and hidden.

A `forward sub` makes the same point twice. The body must reuse the forward
declaration's parameter slots rather than declaring its own, because two sets
of slots mean two sets of addresses and every call site was compiled against
the first. The body's parameter list is still read, so a body that disagrees
with its forward declaration is caught rather than silently miscompiled.

The current slot-retention implementation does not yet preserve a complete
forward-declaration prologue: re-entering an early body can move
`symbolCount` backwards over later declarations. Phase 1 review finding 20
records the required repair.

### 22. One token of lookahead separates assignment from call, using the symbol table

A statement beginning with a name is either an assignment or a call, and the
tokenizer offers exactly one token of lookahead — which the subscript form
already spends on `[`. The distinction comes from the symbol's class instead:
a subroutine name at statement position begins a call, and anything assignable
is a variable. No second token is needed, and the constraint recorded in
finding 7 turns out to cost nothing here.

### 23. Type names are ordinary names, not keywords

`u8`, `u16`, `i16` and `boolean` are interned once at startup and recognised by
four `u16` comparisons. Making them keywords would have meant four more
reserved words, and the reserved list would grow with the type system. As
interned names they cost four table slots and no grammar.

### 24. Records are unused across the current source

Three thousand one hundred lines across four files, and not one record is
declared. Every table is parallel arrays: the name arena, the hash buckets, the
keyword spellings, the symbol table with its eight fields, the label table, the
loop stack. The reason is consistent rather than incidental — each field is
read by a different pass with a different access pattern, and a record would
put the other seven fields between two consecutive reads of one of them.

This is stronger evidence than the tokenizer supplied, but it is not yet the
whole front end: the current parser does not accept record declarations or
field access. Removing records from Level 0 would take field-offset computation
and exact-layout rules out of the seed. The parser must first implement the
declared subset, and the code generator is the last place records could earn
their inclusion.

### 26. The declaration parser cannot read Candlemoth's own source

Counting constructs against the memory map turned up a bigger gap than the one
it was looking for. Candlemoth's source contains twelve `enum` declarations
with 128 members between them, and four `select` statements with 25 `case`
arms. The declaration and statement parser handles neither: it reads `var`,
`const`, `if`, `while`, `for`, `return`, `exit`, `continue`, `sub` and
`forward sub`, and nothing else.

So the front end as written cannot parse the file it is written in. That was
invisible while the parser was judged against the specification, and obvious
the moment it was counted against the source it has to read. `record` is
absent too, which is consistent with finding 24 — no record is declared
anywhere — but `enum` and `select` are load-bearing and have to be written.

The lesson is the one finding 20 recorded about `for … until`: the compiler's
own source is the specification of what level 0 must accept, and reading it is
cheaper than reasoning about it.

### 27. Three of the five tables were the wrong size, two of them fatally

Sizes chosen by eye, divided into the space they have to fit for the first
time:

| Table | Was | Needed | Now |
| --- | --- | --- | --- |
| Name arena | 4,096 bytes | 5,186 | 6,144 |
| Name slots | 512 | 433 distinct identifiers | 640 |
| Symbol slots | 512 | 471 at peak | 640 |
| Labels | 2,048 | 416 | 512 |
| Character class | 256 | 256 | 256 |

The arena was short by a quarter, so Candlemoth compiling Candlemoth would
have stopped with `faultArenaFull` — a failure that reads as a compiler bug
and is a constant. The label table was four times too large, at three
kilobytes of a twenty-four kilobyte RAM area.

Both are the same error: a number picked because it looked generous, never
divided into the space it had to fit. The 416 labels are 297 conditionals, 50
else arms, 18 while loops at two each and 11 counted loops at three.

### 25. The runtime image cannot be relocatable, and finding out cost a rewrite

The plan calls for Candlemoth to plant the runtime as a placed constant byte
array generated from the assembly source. The obvious form of that is a blob
assembled at origin zero plus a table of offsets, with the compiler adding
wherever it puts the array. That form is wrong, and it assembles and passes a
byte-comparison test without complaint.

The routines call each other, this machine's only `CALL` is absolute, and the
fourteen comparison routines share two exits reached by absolute `JP`. So the
bytes are correct at exactly one origin, and at any other they run their own
jumps into program code. Nothing in the image says so — the failure is a
comparison returning a plausible wrong answer, which the fixpoint would
surface a long way from the cause.

The first generated image was assembled at `$0003`, and `placeRuntime` checked
the address it was given rather than adding a base to an offset. Address
`$0000` held the three-byte jump to the designated start, which was why the
first origin was three.

Two things generalise. This runtime is not position-independent under its
chosen absolute calls and shared jumps, so changing the origin requires
regeneration rather than relocation. A generated artifact also needs a test
that *runs* it where it will actually sit: the byte-comparison test was green
throughout, because the bytes matched a generator that was producing the wrong
bytes.

**The first choice of origin was wrong for a second reason.** `$0003` is
directly after the entry jump, and it covers `RST 08` through `RST 38`, the
IM 1 interrupt entry, and the NMI entry at `$0066`. The bootstrap machine
raises no interrupt and executes no `RST`, so every test passed. Page zero is
now reserved whole and code starts at `$0100`, where CP/M starts it.

The 253 bytes that leaves unused are a real cost against a page-sized budget,
and they are not a saving anywhere: on a target that uses restarts or
interrupts those bytes are the vectors, and on one that does not they are
still the addresses the processor jumps to. A compiler whose output cannot be
run on a machine with interrupts is not cheaper, it is narrower.

### 28. RETRACTED — byte decrements did not need a conversion

This finding claimed that section 3.1's `u8 - u8 → i16` rule makes
`depth = depth - 1` on a byte a type error without an explicit conversion, that
five sites in the front end were written without one, and that the rule
therefore bites every level-0 program that counts down.

**Section 8.1 already exempts exactly this.** A round-trip arithmetic
conversion is exempt from the narrowing warning when the destination has
integer type `T`, every typed leaf of the source expression also has type `T`,
every exact integer leaf resolves as `T`, and the expression contains only
parentheses and section 3.1's integer operators — and it states that *wider
intermediate results prescribed by the operator table remain part of the same
round trip*. Its worked example is `lives = lives - 1`.

All five sites are round-trip: `digit = nextByte - 48`,
`delimiterDepth = delimiterDepth - 1`, `depth = depth - 1`,
`loopDepth = loopDepth - 1`. None was a defect, the `u8(…)` conversions added
to repair them were unnecessary, and the language question the finding raised
does not exist.

**How it survived.** The finding was written from section 3.1's result table
alone. Section 8.1 governs what an assignment does with that result, and
nothing checked it — the same failure as claiming a language limitation from
one section without reading the neighbouring one, which findings 3 and 5 were
retracted for. Three retractions now share a cause, and it is not carelessness
about the sections: it is treating a rule found first as the whole rule.

The conversions remain in the source, and they are legal — **but not under the
round-trip rule.** Section 8.1 requires the source expression to contain "only
parentheses and the integer operators from section 3.1", and `u8(depth - 1)`
contains a conversion, so the exemption does not reach it. It does not need to:
an explicit conversion is a stated narrowing, and the exemption exists to waive
a warning on an *implicit* one. There is no warning to waive.

So the two forms are legal for different reasons — `depth = depth - 1` by the
round-trip exemption, `depth = u8(depth - 1)` by being explicit — and only the
first is what section 8.1 describes. Removing the casts is churn, and the claim
that they were covered by the round-trip rule was a second error inside the
retraction.

The rule this leaves for the nucleus is in `docs/nucleus/review-actions.md`:
a byte subtraction assigned to a byte is a round trip, so it lowers to
`LD A,(a) / SUB (b)` with no widening, and `i16` is not needed to express it.

### 29. The boundary rule, applied

`level0.md` said from the start that a form is in level 0 when Candlemoth's
source uses it, then argued several forms in on the strength of what a
compiler would probably need. Applying the rule for the first time moved
fourteen forms out: records, integer `xor`, `size`, `byteSize`, `offset`, `lower`,
`upper`, `clear`, `fill`, multi-value cases, range cases, `for … to`, array
parameters and `write` parameters. Every one has zero uses in 3,150 lines.

Range cases are the sharpest. `level0.md` justified them by saying a tokenizer
without them is markedly larger; the tokenizer was then written with a
256-entry character-class table and used neither them nor multi-value cases.
The argument was reasonable and the evidence went the other way.

`for … to` is the most surprising. Every counted loop in the compiler is
`for … until`, and the inclusive form — the loop leaves when the control
variable passes the limit rather than when it reaches it — has no use in
3,150 lines of ordinary imperative code. A feature can be too obvious to
question and still be unused.

The boundary is reversible. Each form returns on the evidence that would have
kept it: a passage of Candlemoth that needs it, quoted, with the measured seed
cost.

### 30. The parser now reads its own source, and three of the repairs were free

Findings 18 to 23 closed together, and three of the six cost nothing at run
time.

**Short-circuit Booleans cost less than the eager form they replaced.** A
Boolean is 0 or 1, so when `or` skips its right operand the left operand is
already the answer and when `and` skips its right operand the same holds. The
lowering is a test and a conditional jump — five bytes — and the byte-wise
combining instructions are gone entirely. The eager form was five bytes plus
the operand evaluation it could not skip.

**A `const` array's storage is its image bytes.** The literal is emitted where
the declaration sits and the array's address is wherever the stream had
reached, so the 256-entry character-class table costs 256 bytes and no
instructions. A `var` array cannot work that way — its storage is writable and
level 0 has nowhere to run an initialising loop before the designated start —
so an initialised array is a `const`, and `var` arrays are zeroed storage.

**An enum member is an ordinary constant.** It folds where it is used, costs
no storage and can appear in an array bound, which is every rule that already
held for `const`. What the enum adds is identity: two enums are distinct types
though both are stored as `u8`, so `symbolEnum` and `resultEnum` carry the
declaring slot beside the type. `TypeKind` alone could not say which.

The checked ordinal conversion reuses the subscript bounds check. `Keyword(i)`
is a range check against the member count, which is exactly what `a[i]` is
against the length, so the same runtime routine serves both and the conversion
costs six bytes.

### 31. Two regions, because parameters and locals have different lifetimes

The symbol table kept one mark and moved it backwards at the end of every
body. That worked while a body's locals were the only thing above the mark,
and broke as soon as a `forward sub` prologue put later declarations there
too: leaving the first body discarded every declaration made after it.

Parameters cannot simply be dropped, because a call site addresses them by
offset from the routine's own slot and static frames give them fixed
addresses. So the table now has a persistent region whose mark only grows and
a transient region for the current body's locals, and the two never
interleave. Visibility follows the same split: `findSymbol` scans locals, then
the current routine's parameters, then module-level names, skipping depth-one
slots in the last scan.

The general shape is worth keeping. **A table whose entries have two different
lifetimes needs two marks, not one mark and a convention**, and the convention
holds right up until a second kind of entry appears above it.

### 32. Factoring a routine out costs five bytes at every call site

Static frames give every parameter a fixed address, so passing one is a store
at the call site. A call with no arguments is three bytes; a call with one
byte argument is `LD A,n`, `LD (addr),A` and `CALL nn` — eight.

That inverts the usual instinct. An emission table — every fixed instruction
sequence in one byte array, played back by one routine taking a shape number —
looks like an obvious saving: fourteen emitting routines at roughly 21 bytes
each is about 294 bytes, and the table with its playback loop and two index
tables is about 141. It saves 150 and costs five bytes at each of some thirty
call sites, which is 150. A wash, and not written.

**The rule that survives the arithmetic: a table pays when it removes
branching, and breaks even at best when it only removes duplicated
straight-line code.** The character-class table removes a ladder of range
tests from every character read; the emission table would have removed only
repetition. On a machine with register parameters both would pay.

Before factoring anything out here, count the call sites and multiply by five.

### 33. The precedence table saved depth, not source

Six recursive-descent levels became one loop over a 13-row precedence table
and a 10-row map from punctuation to operator. Precedence also classifies —
levels one and two are word operators, three is comparison, four and five are
arithmetic — so the number that orders the operators also selects the rules
and no second table is needed.

| | Before | After |
| --- | --- | --- |
| Code lines in the binary grammar | 307 | 279 |
| Routines | 8 | 9 |
| Static frame bytes | 32 | 39 |
| Frames entered to read one operand | 9 | 4 |

**The source barely shrank and the static frames grew.** Reading `a` used to
enter nine frames, every one of them inside the recursive cycle, so eight save
and restore sequences ran to read one name. It now enters four. That is a
run-time saving in the instruction count for a self-compilation, and its
effect on image size is unknown until a compiled image exists.

The comparison also flatters the old column, which had no short-circuit
Boolean lowering, no typed folding and no integer word operators. The new
grammar does more in fewer lines; how much of that is the table and how much
is unrelated is not separable from these numbers.

Two things generalise. **A structural change can be worth making for depth
alone**, and depth does not appear in a line count or a byte count of the
source. And the discipline document's rule holds: source appearance is not the
measurement, and nothing here should be read as a size result.

`docs/candlemoth-programming-model.md` records the model these two findings
argue for, and where it stops applying.

## Sizes, for the Phase 3 comparison

Tokenizer: 694 lines, of which the character-class table is 65 and the
keyword tables 22. Expression parser and emitter: 1,384 lines, the growth
being exact arithmetic, typed folding, short-circuit Boolean lowering and the
integer word operators. Symbol table: 600 lines, which now carries calls and
conversions. Declaration and statement parser: 1,351 lines, with
enumerations, `select` and placed constant arrays. The draft is 4,029 lines
in total, up from 3,150 when the grammar could not read its own source.

The declarations contain 20,016 bytes of writable arrays and 754 bytes of
constant arrays. The rise is `symbolEnum`, one `u16` per symbol slot, which
is what carries an enum's identity beside its `u8` representation. Both totals are generated from the declarations by
`test/capacity.test.ts`, which writes the per-array table into
`docs/bootstrap-plan.md` and fails when the source and the document disagree.
They exclude scalar globals, static frames, recursive save-around state, the
runtime stack and the source window.

Both land in the same image on the same host. `docs/abstract-machine.md` names
one: the `flat` profile, where the compiler is a loaded program with a little
over 63K of free memory, source arriving through a service and object code
leaving through one. Against that, 19,490 bytes of arrays is comfortable.

An earlier revision of this paragraph judged the writable total against a
twenty-four-kilobyte TEC-1 RAM region and the code against a sixteen-kilobyte
expansion window, while the rest of the documents described the loaded model.
That was two maps compared with each other. The TEC-1 layout is orientation
for a profile nobody has built.

These are measurements of the current source rather than of a finished
compiler. Findings 26 and the review's 18 to 23 list forms the front end still
lacks, and the code generator is unwritten. No compiled size exists yet.
