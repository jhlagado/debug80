# Lanternfly Level 0 — draft for review

The subset a compiler can be written in. Its boundary is empirical: it is
whatever Candlemoth's own source needs, and no more. This draft is the
starting hypothesis, to be tightened or loosened by writing the compiler.

Level 0 is not a different language. Every level-0 program is a Lanternfly
program that uses fewer features, and a level-2 compiler accepts it
unchanged.

## The boundary rule

**A form is in level 0 when Candlemoth's own source uses it.** Not when it
seems likely to be wanted, and not when an argument can be made for it — when
a passage of the compiler needs it.

That rule was written into this document from the start and then not applied:
the first draft argued several forms in on the strength of what a compiler
would probably need, and the compiler was subsequently written without them.
Range cases are the clearest case. This document justified them by saying a
tokenizer without them is markedly larger; the tokenizer was then written with
a 256-entry character-class table and never wanted one.

The rule is now applied, and the forms below have moved out of the active
subset. **This is a reversible boundary, not a deletion from Lanternfly.**
Each remains a Lanternfly feature at levels 1 and 2, and each comes back into
level 0 on the same evidence that would have kept it: a passage of Candlemoth
that needs it, quoted, with the measured cost to the seed.

| Moved out | Uses in 3,150 lines |
| --- | --- |
| Records | 0 |
| Integer `xor` | 0 |
| `size`, `byteSize`, `offset` | 0 |
| `lower`, `upper`, `clear`, `fill` | 0 |
| Multi-value cases, `case a, b` | 0 |
| Range cases, `case a to b` | 0 |
| `for … to` | 0, and every loop is `for … until` |
| Array parameters | 0 |
| `write` parameters | 0 |

`for … to` is the surprising one, and it is the rule working rather than
failing. Every counted loop in the compiler is exclusive, and the inclusive
form is one comparison away whenever a passage needs it.

Removing these takes parser, type-checker and lowering work out of both
bootstrap compilers while leaving every level-0 program a valid Lanternfly
program.

## The test this subset has to pass

A recursive-descent compiler that reads characters, produces tokens,
parses, checks types and emits Z80 bytes, and compiles its own source.

It is a **loaded program**, not a resident one: `docs/abstract-machine.md`
names the host, and on it the compiler has a little over 63K of free memory
with source and object code streaming through services. An earlier draft of
this line put the compiler in a sixteen-kilobyte window and made its size the
test. That was a different machine's constraint, and no measurement was ever
against it.

Everything below is justified by that program and nothing else. Where a
feature is not needed to write it, the feature is not in level 0.

## Types

- `u8`, `u16` — the only integer types. Token kinds, table indices,
  addresses-as-values, byte counts.
- `boolean`.
- Enumerations over `u8`, for token kinds, node kinds, type kinds and
  error codes. Needed because `select` over named cases is how a parser
  dispatches, and because an unnamed integer would make the source
  unreadable.
- Fixed arrays with a compile-time size, one dimension.

- `i16`, because **level 0 is not closed under its own arithmetic without
  it**. Section 3.1 gives `u8 - u8` the result type `i16`, and unary minus
  on a `u8` likewise. Cost is signed compare, arithmetic shift right, signed
  division and sign-extended widening — perhaps 400 to 700 bytes.

  `i16` is the one type kept without a declaration using it. No variable in
  Candlemoth is declared `i16`, and the type still arises: `nextByte - 48`
  and `depth - 1` are both `u8 - u8`, so both are `i16` and both are narrowed
  at the assignment. A subset that produced a type it could not name would
  not be a subset. This is the boundary rule applied to a type the *rules*
  produce rather than to a form the *source* writes.

Not in level 0: `i8`, `u32`, `i32`, floating point, strings, subranges,
multidimensional arrays, opaque address types, and **records**. `i8` buys
only a storage width, since its arithmetic results are `i16` anyway. Records
are out under the boundary rule: the front end declares none in 3,150 lines,
and every table in it is parallel scalar columns because each field is read by
a different pass with a different access pattern. Removing them takes
field-offset computation and exact-layout rules out of the seed.

- **Integer conversions**, `u8(x)` and `u16(x)` and their signed
  counterparts, **and the checked ordinal conversion** `SomeEnum(x)`, which
  section 3 already defines: an invalid constant is a compile error and an
  invalid runtime value raises `F-RANGE`. Omitting it forced a
  twenty-five-arm `select` in the tokenizer for what one call expresses. The first draft omitted them, which made its own proposed
  workaround unwritable: a compiler narrows constantly, and section 3.1's
  result types mean it must.

Branch displacements are not a reason for signed types at all, because there
are no branch displacements: **every jump is three-byte absolute**, forward
and backward alike, so nothing computes one. `docs/level0-lowering.md` gives
the reason — `JR` reaches only ±127, so choosing it would make the branch
form depend on a measured distance, and two implementations that measure
differently emit different bytes for the same source.

The reason signed types are needed is section 3.1's result table, below.

**Literals are decimal only.** Hexadecimal, binary and character literals
are outside level 0, and the seed rejects each with a diagnostic rather than
accepting what Candlemoth would not. Candlemoth's own source uses decimal
throughout, including for the character codes its keyword table installs.

**No strings.** Identifiers are interned into a name arena and thereafter
carried as an offset and a length into it. They are not offsets into the
source, which streams through a window and cannot hold stable positions.
Case is folded at intern time and the original spelling discarded, since a
compiler with no strings cannot echo a name.

## Storage

- Module `const` with a constant initializer, including array initializers.
  Seven constant arrays in the front end, from the 256-entry character-class
  table down to a four-entry index.
- Module `var`.
- Routine locals, scalar and aggregate.
- `static var` inside a routine.

Not in level 0: `at` placement, `volatile`, `state var`, aliases, and —
with no `extern` and no machine-code arrays — any reason for them.

**Recursion and per-invocation state.** Section 11.4 rejects a
per-invocation aggregate local inside a recursive cycle, and a
recursive-descent parser is one large cycle. That does not cripple the
parser, whose per-invocation state is genuinely scalar — a token kind, a
symbol index, a type index, a saved emit offset, a label number. It bites
in two other places.

Parameters are read-only. `write` parameters are out under the boundary rule,
along with array parameters: the front end passes no aggregate and writes
through no parameter. Section 11.1 allows one scalar result and section 11.3
forbids `write` on a scalar parameter in any case, so **there are no scalar
out-parameters**. A routine like
`parseExpression` must return a type, a constant flag and a constant value
together.

**Measured answer, from writing that parser.** Because those three results
are *scalars*, they live in module-level variables and a caller about to
recurse copies what it needs into its own ordinary locals first;
save-around-call preserves those locals across the call, which is the
protocol's own job. `parseAdditive` does exactly this and needs nothing
further:

```lanternfly
leftType = resultType
leftIsConstant = resultIsConstant
leftValue = resultValue
nextToken()
parseMultiplicative()
```

A **depth-indexed pool** passed as a `write` aggregate is needed only when a
result is itself an aggregate, which no part of an expression compiler
produces. It remains available for that case and is not a general
convention.

And `static var` is shared across recursive activations, so giving a
routine a scratch record is silently wrong under recursion. Candlemoth
hand-rolls a depth-indexed frame pool because the language declines to
provide a stack. Survivable, and worth naming as a smell rather than
discovering.

## Routines

- `sub` with parameters and an optional result.
- Scalar parameters by value; aggregate parameters by reference, exact
  capacity, read-only unless marked `write`.
- `forward sub`, for mutual recursion in the ordinary way. It does **not**
  solve the save-around-call question: that protocol applies to routines
  inside a strongly-connected component of the call graph, and a
  declaration carries a name and a signature while the call edges live in
  the bodies. Candlemoth's analysis pass reads those bodies and settles
  cycle membership before its layout pass fixes any address.
- **Recursion**, which the target profile must therefore grant. Expression
  nesting is the depth that matters and it is small; the cost is the
  save-around-call convention of section 11.7.

Not in level 0: `fails`, `fail`, `or fail`, `on error`, `defer`, generic
aggregate parameters.

**Error handling is not a saving, it is a different strategy.** A
single-pass compiler does not propagate errors, it **panics and
resynchronises**: report, skip tokens to the next statement or declaration
boundary, continue. `or fail` unwinds to the caller, and a recursive-descent
parser that unwinds loses the position it needs to resynchronise from. The
status-variable pattern is better suited here, not merely cheaper.

The refinement that matters: checking a status flag after every parse call
is some two hundred sites at eight bytes, or 1.6K. Instead, on error set a
flag and continue parsing in **no-emit mode**, checking the flag only where
its absence would cause an infinite loop.

## Control

`if` / `else`, `while`, `for … until`, `select` / `case` / `else`, `return`,
`exit`, `continue`.

`for … to` is out under the boundary rule. Every counted loop in Candlemoth
is exclusive, and the inclusive form differs by one comparison — the loop
leaves when the control variable passes the limit rather than when it reaches
it — so it comes back the moment a passage needs it.

Statements are newline-terminated under the **logical-line rule of section
2.4**, which level 0 inherits unchanged: a physical newline ends a statement
except inside parentheses or square brackets, so a long condition spans
lines by being parenthesised. Level 0 invents no continuation syntax.

`select` matters more than it looks: a tokenizer and a parser are both large
dispatches, and the front end has four of them across twenty-five arms. **One
constant per `case`.**

Multi-value cases (`case a, b`) and range cases (`case a to b`) are out. This
document argued range cases in on the grounds that a tokenizer without them is
markedly larger; the tokenizer was then written with a 256-entry
character-class table and used neither form. That is the boundary rule
catching an argument the evidence did not support, and it is the clearest
example of why the rule exists.

Out: `for each`, the conditional expression, and the aggregate intrinsics
`size`, `byteSize`, `offset`, `lower`, `upper`, `clear` and `fill` — the last
seven listed here as things a compiler needs, and used nowhere in one.

## Modules

**Level 0 has none**, and it has no include mechanism either. The host
concatenates the source files into one stream and keeps a side table
mapping each global line back to a file and line; the compiler reports
global line numbers and the host translates them.

Candlemoth therefore implements nothing here — zero compiler bytes — and
both implementations agree by construction, neither having the feature.
The specification's position against textual includes concerns the
*language*; a host-side concatenation convention that level 1 replaces
with real `import` commits the language to nothing.

## No assembly, no machine code, no extern

Level 0 contains **no inline assembly, no placed machine-code arrays and
no `extern sub`**. Candlemoth's source is Lanternfly and nothing else.

This is affordable because the runtime helpers a compiler needs — 16-bit
multiply, divide, comparison — are code the compiler *emits*, not code its
own source contains. Both the seed and Candlemoth carry those helpers in
their code generators and plant them in the programs they produce. Neither
needs to include one.

What remains is I/O, and the bootstrap profile supplies it as **five
intrinsics** rather than a binding mechanism. Each lowers to one or two instructions and needs
no symbol table, no address binding and no service registry:

| Intrinsic | Lowering | Meaning |
| --- | --- | --- |
| `readSourceByte() as u8` | `IN A,(0x00)` | next source byte, `0xFF` at end |
| `rewindSource()` | `OUT (0x05),A` | return the input to offset zero |
| `writeCodeByte(b as u8)` | `OUT (0x01),A` | append to the emitted image |
| `writeDiagnostic(b as u8)` | `OUT (0x03),A` | append to the diagnostic stream |
| `setExitStatus(b as u8)` | `OUT (0x02),A` | record the outcome |

**`readSourceByte` is deliberately not `pollCharacter`.** Section 12.4.1's
operation returns zero when no byte is *waiting*, which is a not-ready
answer rather than an end-of-input one, and that section says an
end-of-file result is outside this edition. Borrowing the name for
different semantics would imply a compatibility that does not exist. The
terminator is `0xFF`, which never appears in level-0 source since it is
ASCII, and a `0xFF` inside the stream is invalid source.

There is an intrinsic for every port. Without one, Candlemoth could not
reach the port at all, having no assembly and no external routines.

**These are bootstrap-profile intrinsics, not core language.** A profile
declares a set of intrinsic names with fixed signatures and lowerings, and
the compiler pre-binds them in the global scope before parsing — a table
inside the compiler, not a binding mechanism in the language. Candlemoth's
source is therefore not portable to a target that does not declare them, and
naming one where the profile does not supply it is `E-TARGET-001`.

`0xFF` is framing and never arrives as source data: the producer validates
that the source is ASCII and appends the terminator. A compiler cannot both
treat `0xFF` as the end and diagnose an embedded one, since at its boundary
they are the same byte.

## Program shape

A level-0 program is a designated subroutine — a prologue — and nothing
else. No tasks, no instants, no scheduler, no epilogue needed. Blocking is
legal there, which is what lets the compiler read its input.

## Operators

`+`, `-`, `*`, `/`, the six comparisons, and `and`, `or`, `not` —
which section 6 makes logical on `boolean` operands and bitwise on integer
ones. The front end uses both readings: `resultIsConstant and leftIsConstant`
is logical, `value and 255` is a mask.

`xor` is out. Section 6 gives it the same dual reading and the front end uses
neither, so it is not a keyword in the tokenizer and not a form the seed
implements.

`mod` is out for the same reason, and this document claimed it until the token
audit checked. It is not a keyword in the tokenizer, it has no row in the
operator table, and the front end never uses it. Claiming a form that no part
of the implementation carries is the failure mode the boundary rule exists to
catch, and it survived here because nothing compared the document against the
tokenizer until `level0-grammar-report.md` was generated.

## What this excludes, and why that is the point

Tasks, state cells, pulses, derivations, the instant, strings, error
handling, modules, generic parameters, placement, volatile storage,
capability-gated types, multidimensional arrays, subranges, opaque
addresses, `alias`, and everything in the boundary-rule table above.

None of them is needed to write a compiler. Every one of them is code the
seed does not have to contain and a construct Candlemoth does not have to
implement before it can compile itself.

## Estimated seed effort

The seed must implement: a tokenizer over this grammar; a recursive-descent
parser; a type checker over `u8`, `u16`, `i16`, `boolean`, enumerations and
one-dimensional arrays, with the conversions between them; and a code
generator for the Z80 covering the control forms, `u8`/`u16` arithmetic,
array indexing with bounds checks, the calling convention and the
save-around-call recursion protocol. In idiomatic TypeScript, with no
constraints on how it allocates, this is a substantial but ordinary compiler.

The boundary ruling removes record layout and field access, the aggregate
intrinsics, multi-value and range case selection, `for … to`, integer `xor`,
array parameters and `write` parameters from that list. It also removes them
from Candlemoth, which is the point: work not done twice.

**The seed must reject every form outside this subset**, with a test per
excluded form. A seed that accepted a superset would let Candlemoth's source
use a construct Candlemoth does not implement, and the fixpoint would fail at
step B with a maximally confusing symptom.
