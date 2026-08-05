# Lanternfly Level 0 — draft for review

The subset a compiler can be written in. Its boundary is empirical: it is
whatever Candlemoth's own source needs, and no more. This draft is the
starting hypothesis, to be tightened or loosened by writing the compiler.

Level 0 is not a different language. Every level-0 program is a Lanternfly
program that uses fewer features, and a level-2 compiler accepts it
unchanged.

## The test this subset has to pass

A recursive-descent compiler that reads characters, produces tokens,
parses, checks types and emits Z80 bytes, running in 64K with roughly 16K
of its own code, and able to compile its own source.

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
- Records with named fields and exact layout.

- `i16`, because **level 0 is not closed under its own arithmetic without
  it**. Section 3.1 gives `u8 - u8` the result type `i16`, and unary minus
  on a `u8` likewise. Without `i16` a level-0 program could not write
  `a - b` over two bytes without a conversion at every site, which is a
  semantic divergence from Lanternfly rather than a subset of it. Cost is
  signed compare, arithmetic shift right, signed division and sign-extended
  widening — perhaps 400 to 700 bytes.

Not in level 0: `i8`, `u32`, `i32`, floating point, strings, subranges,
multidimensional arrays, opaque address types. `i8` buys only a storage
width, since its arithmetic results are `i16` anyway.

- **Integer conversions**, `u8(x)` and `u16(x)` and their signed
  counterparts, **and the checked ordinal conversion** `SomeEnum(x)`, which
  section 3 already defines: an invalid constant is a compile error and an
  invalid runtime value raises `F-RANGE`. Omitting it forced a
  twenty-five-arm `select` in the tokenizer for what one call expresses. The first draft omitted them, which made its own proposed
  workaround unwritable: a compiler narrows constantly, and section 3.1's
  result types mean it must.

Branch displacements are *not* the reason for signed types: a displacement
is computed in `u16` as `target - pc - 2`, accepted when it is below 128 or
at or above `0xFF80`, and narrowed. Two lines — but only with a conversion
operator to narrow with.

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

- Module `const` with a constant initializer, including array and record
  initializers.
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

Section 11.1 allows one scalar result and section 11.3 forbids `write` on a
scalar parameter, so **there are no scalar out-parameters**. A routine like
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

`if` / `else`, `while`, `for … to` and `for … until`, `select` / `case` /
`else`, `return`, `exit`, `continue`.

Statements are newline-terminated under the **logical-line rule of section
2.4**, which level 0 inherits unchanged: a physical newline ends a statement
except inside parentheses or square brackets, so a long condition spans
lines by being parenthesised. Level 0 invents no continuation syntax.

`select` matters more than it looks: a tokenizer and a parser are both
large dispatches. Multi-value cases (`case a, b`) and range cases
(`case '0' to '9'`) are **in** — a tokenizer without range cases is
markedly larger.

Also in, because a compiler needs them: `size`, `byteSize`, `offset`,
`lower`, `upper`, `clear` and `fill`. Out: `for each`, the conditional
expression.

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

## What this excludes, and why that is the point

Tasks, state cells, pulses, derivations, the instant, strings, error
handling, modules, generic parameters, placement, volatile storage,
capability-gated types, multidimensional arrays, subranges, opaque
addresses, `alias`.

None of them is needed to write a compiler. Every one of them is code the
seed does not have to contain and a construct Candlemoth does not have to
implement before it can compile itself.

## Estimated seed effort

The seed must implement: a tokenizer over this grammar; a recursive-descent
parser; a type checker over `u8`, `u16`, `i16`, `boolean`, enumerations,
one-dimensional arrays and records, with the conversions between them; a
code generator for the Z80
covering the control forms, `u8`/`u16` arithmetic, array indexing with
bounds checks, record field access, the calling convention and the
save-around-call recursion protocol. In idiomatic TypeScript, with no
constraints on how it allocates, this is a substantial but ordinary
compiler.
