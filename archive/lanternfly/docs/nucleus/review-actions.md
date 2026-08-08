# Nucleus review actions

The nucleus documents are **draft**, not normative, until the blockers below
close. `docs/bootstrap-ladder.md` remains the project shape; only the nucleus
language definition is in question.

## Closed in this pass

| Finding | What was wrong | What was done |
| --- | --- | --- |
| Report provenance | The nucleus report was titled "Level Zero grammar report" and claimed generation from `level0.grammar`. The stale-file test passed while the document published false provenance. | The report takes an identity — title, grammar path, and a coverage note. The nucleus report states that its zero production coverage is by construction, not by measurement. |
| `RST` saving overstated | Claimed 658 bytes from eight slots with no vector cost. `RST 00` is taken by the entry jump, and a restart slot is eight bytes — too small for a routine, so it holds a `JP` to one. | Recomputed with vectors counted: **601 bytes from seven slots**, 558 from six if `RST 08` carries a fault vector. |
| Unassembled Z80 in the lowering table | Every sequence and byte count in `lowering.md` was written from memory. Two were wrong: `LD A,(a) / SUB (b)` does not assemble, and "build a word" was quoted at two bytes when that holds only with both halves already in registers — from memory it is eight. | `src/bootstrap/nucleus-manifest.ts` carries the mnemonics and nothing else; `test/nucleus-lowering.test.ts` assembles every entry and generates the document's tables, so a byte count cannot disagree with the assembler. A `Given` column states the condition wherever a sequence holds only under one. |
| Blockers 5 and 6, incidentally | The `select` sequence omitted normalisation and the range check; the variable-index form read two bytes for a `u8` index. | Both are now separate manifest entries with their own assembled counts: `u8` and `u16` index forms at 15 and 12 bytes, a byte-register index at 7, and `select` split into dispatch, range check and base normalisation. |
| Two writable-array totals | `../bootstrap-plan.md` carried the generated figure and `../abstract-machine.md` a stale copy. | `../abstract-machine.md` points at the generated table instead of repeating it. One authoritative place. |

## Blockers

### 1. The six profile intrinsics take arguments

`writeCodeByte(value)`, `writeDiagnostic(value)`, `setExitStatus(value)` take
one argument; `readSourceByte()` returns one. `fill(target, value)` and
`clear(target)` take arguments and `v1.md` admits them. A parameterless
language with no calls in expressions cannot express any of it, so **a nucleus
program cannot perform the I/O a compiler requires.**

**Resolution to implement.** An intrinsic is not a subroutine call, and treating
it as one is what created the hole. It is an operator with a parenthesised
spelling, a fixed name, and a fixed arity.

**Argument evaluation is ordinary and must be stated as such.** The argument is
an expression evaluated by the ordinary rules under section 8.7, leaving its
value where a `u8` value lives, and the effect happens after. The lowering is
therefore *the expression's own lowering* plus two bytes, not a fixed sequence:

```
writeCodeByte(x)          <evaluate x into A> / OUT ($01),A
writeCodeByte(a + 1)      <evaluate a + 1 into A> / OUT ($01),A
readSourceByte()          IN A,($00)
```

Quoting `writeCodeByte(x)` as "two bytes plus a load" was only right for a
simple variable. Stating it as expression-plus-two keeps it right for every
argument, and keeps the meaning identical to Lanternfly's, where these are
profile intrinsics with ordinary argument evaluation.

An intrinsic with no argument and a result — `readSourceByte()` — is a primary,
and one with an argument and no result is a statement. Both range over a closed
set of names with declared arity, so no general parameter passing and no
general call in an expression follows.

The same treatment covers `u8(x)` and `u16(x)`, which the lowering table
already assumes and the grammar excludes.

### 2. The type system is not closed under subtraction

Section 3.1 gives `u8 - u8` the result type `i16`. The nucleus admits `u8`,
admits subtraction, excludes `i16`, and claims identical Lanternfly meaning.
Those cannot all hold.

**The specification already resolves this, and both my earlier answers were
wrong.** Section 8.1 defines a round-trip arithmetic conversion: an assignment
is exempt from the narrowing warning when the destination has integer type `T`,
every typed leaf of the source expression also has type `T`, every exact
integer leaf resolves as `T`, and the expression contains only parentheses and
section 3.1's integer operators. It states outright that *wider intermediate
results prescribed by the operator table remain part of the same round trip*,
and gives `lives = lives - 1` as the example.

So `depth = depth - 1` on a `u8` is legal Lanternfly with no conversion, and
the `i16` the operator table prescribes never escapes the assignment.

**Resolution to implement.** The nucleus admits `u8` subtraction **only in
round-trip position** — the whole expression assigned to a `u8`, with every
typed leaf a `u8` and every exact leaf resolving as `u8`. Outside round-trip
position, subtraction takes `u16` operands.

**The round-trip check is semantic, not syntactic.** An earlier version of this
paragraph called it syntactic and decidable without analysis; that was wrong,
because the leaf condition is about the *types* of the leaves and needs the
symbol table. What saves it is that the check is **local**: the type checker
already computes every leaf's type as it walks the expression, so recognising a
round trip needs no extra pass and no information from elsewhere in the
program. That is a different thing from the analyses the admission rule bans —
liveness, call-graph membership — which need a pass over the whole program.

The admission rule should read "no *whole-program* analysis" rather than "no
analysis", because a local semantic check using what the checker already has is
not what the rule was written to exclude.

Neither of my earlier answers survives. "Restrict to `u16` and convert" was
unnecessary and, as the review notes, not free — a `u8` widened to `u16` is
`LD A,(x) / LD L,A / LD H,0`, six bytes, and two operands make twelve. "Keep
`i16`" was equally unnecessary and costs the signed runtime routines. The
specification asked for neither.

#### The byte lowering, and its exact scope

A round-trip byte expression lowers to byte arithmetic rather than widening.
**The sequence is seven bytes, and the one this document first gave does not
assemble:**

```
LD   HL,b               ; 3
LD   A,(a)              ; 3
SUB  (HL)               ; 1
```

`LD A,(a) / SUB (b)` was written here and called two instructions. `SUB (nn)`
is not a Z80 instruction. The error survived being written, reviewed and
defended, because nothing executed it — `test/byte-lowering.test.ts` now does,
and it fails on the quoted form.

Seven bytes against eighteen for the widened path, both assembled and counted
in that test. The saving is real and large; the claim of two instructions was
not.

**This must not be generalised.** The lowering is valid under three conditions
together:

1. the destination is `u8`;
2. every **typed** leaf is `u8`, and every **exact integer** leaf resolves as
   `u8` — the same two-part condition section 8.1 states, and they are not one
   test: `depth` is a typed leaf whose declared type must be `u8`, while `1` in
   `depth - 1` is exact and untyped until context resolves it, so what is
   required of it is that it *fit* `u8`;
3. every operator in the expression is `+`, `-` or `*`.

The third condition is the one that is easy to lose. Addition, subtraction and
multiplication are congruent modulo 256, so an intermediate that wraps in byte
arithmetic still gives the right byte at the end. **Division is not.**

**The general justification is algebraic, and the tests are witnesses to it.**
Reduction modulo 256 is a ring homomorphism onto `Z/256Z`, so it commutes with
addition, subtraction and multiplication — for any expression tree built from
those three, computing in bytes throughout gives the same byte as computing
exactly and narrowing at the end. Division is not a ring operation and ordering
is not preserved by the quotient map, which is why those two are excluded: not
as an observed failure but as a consequence of what the homomorphism does not
carry.

`test/byte-arithmetic.test.ts` is a **regression witness for that argument over
one expression shape**, `(a - b) op c`, and not a proof for arbitrary trees.
Exhaustive over all 16,777,216 byte triples, it finds no disagreement for `+`,
`-` and `*`; division disagrees on 36.8% of a sampled sweep, with `(0 - 1) / 2`
the smallest counterexample — `-1 / 2 = 0` exactly against `255 / 2 = 127`
wrapped. Its value is catching drift in an implementation, not establishing the
general case.

Comparison fails the same way — `(0 - 1) > 0` is false on the true value and
true on the wrapped byte, and the two disagree on every pair where the
intermediate is negative — so a round-trip byte expression may not feed one.

Both of those tests are written in TypeScript on both sides.
`test/byte-lowering.test.ts` executes the emitted sequence on the machine over
all 65,536 byte pairs and compares a checksum against the model. **That is the
check a model test cannot make**, and blockers 3 through 6 are pinned the same
way — assembled *and executed*, not assembled alone.

Outside those three conditions the expression widens and uses the ordinary
sixteen-bit path.

### 3. The three nucleus documents describe different languages

`v1.md` admits `fill`, `clear` and whole-array assignment; the grammar has
none of them. `lowering.md` gives sequences for `and`, `shl` and
`u8(…)`, which the grammar excludes.

**Resolution to implement.** A generated construct matrix with one row per
admitted form and one column per document, failing when a form is missing from
any of them. The level-0 work already has the mechanism — the lowering manifest
generates the document tables and the tests read the source — and it was not
applied here.

### 4. The Boolean ABI disagrees with the branch shapes

Comparison helpers return 0 or 1 in `HL`. The nucleus branch shapes test `A`.
A computed comparison therefore branches on whatever `A` last held.

**Resolution to implement.** The comparison helpers return in `A`. Branches test
`A`, storing a `boolean` stores `A`, and the transfer disappears rather than
being counted. This changes the runtime routines from the level-0 versions,
which is acceptable because the nucleus runtime is already a different set of
nine.

### 5. The `select` lowering is incomplete

The quoted nine bytes assume a byte selector already normalised into `A`, while
the grammar permits a `u16` selector, and the sequence omits base normalisation
for a case span not starting at zero, the range check, and any alignment
padding.

**Resolution to implement.** State that the selector is `u8`. Give the complete
sequence including normalisation and range check, and assemble it in a
generated test the way `../level0-lowering.md`'s shapes are pinned. Re-quote the
comparison against a ladder from the complete sequence.

### 6. Byte-indexed access reads two bytes

The variable-index sequence is `LD HL,(index)`, which reads two bytes. For a
`u8` index — the common case on a stack pointer — that loads the adjacent
variable as the high byte.

**Resolution to implement.** Separate `u8` and `u16` index forms, both
assembled in the generated lowering test.

## Deferred, with reasons

**Blank lines in `statement-list`.** Deferred with the review's agreement, on
condition that the lexer's newline collapse is documented and tested. Both are
now done: the grammar states the dependency where `statement-list` is defined,
and `test/grammar.test.ts` asserts that the tokenizer's collapse loop exists,
so removing it fails a test that names the grammar rule depending on it.

The grammar has `{ statement }` with no `NEWLINE` alternative, which was the
repair for a real FIRST/FOLLOW collision. It relies on the lexer collapsing
consecutive newlines into one boundary token, so a blank line between two
statements is absorbed by the first statement's own terminator. Corpus cases
covering blank lines at each block boundary come with the nucleus slice.

**`../bootstrap-plan.md` is stale.** It says no Lanternfly source exists, lists
front-end forms that now exist as missing, duplicates the code estimate, and
refers once to two passes. The repair — reduce it to the shared machine and
validation foundation, move superseded phases to a decision log, and let
`../bootstrap-ladder.md` own the generation sequence — is right and is a separate
pass, because doing it in the same change as the nucleus repairs would make
both hard to review.

## Order

1. Blockers 1 and 2 together: intrinsic and conversion forms in the grammar,
   subtraction restricted to `u16`.
2. Blockers 4, 5 and 6: the Boolean ABI, the complete `select` sequence, and
   the two index forms, each assembled in a generated test.
3. Blocker 3: the construct matrix, which then holds the first two in place.
4. A small real nucleus slice, so production coverage is measured rather than
   zero by construction.
5. Freeze the nucleus.
6. Rewrite `../bootstrap-plan.md` as the shared foundation.

The seed does not start until step 5.
