# The nucleus

A subset of Lanternfly small enough that a compiler for it is small, shaped so
that its constructs land on single Z80 instructions. The level-0 compiler is
written in it.

**Draft, not normative.** A review found the three nucleus documents
describing different languages, and the nucleus not implementable as written:
the five profile intrinsics take arguments a parameterless language cannot
pass, and the type system is not closed under its own subtraction. Those are
resolved before this is frozen. `docs/nucleus-review-actions.md` tracks them.

`candlemoth/nucleus.grammar` is the grammar, `docs/nucleus-grammar-report.md`
its generated analysis, and `docs/nucleus-lowering.md` the instruction table.

## Why it exists

Level 0 has 45 productions, five types, parameters, locals, routine results,
static frames and save-around-call. A seed must implement all of it before
anything self-hosts, and the three-pass architecture — layout and emission
agreeing on addresses, the label table surviving a streaming output, the
fixpoint — has never run.

The nucleus exists to run that architecture on a quarter of the language. If
the architecture is wrong, that is found out cheaply. If it works, the level-0
compiler stops being a bootstrap risk and becomes an ordinary program written
on proven ground.

Measured against level 0 by the same analyzer:

| | Level 0 | Nucleus |
| --- | --- | --- |
| Productions | 45 | 29 |
| BNF rules after expansion | 126 | 82 |
| Nonterminals | 71 | 44 |
| Keywords | 23 | 17 |
| Contextual decisions | 2 | 1 |

**This is a trade, not a free win.** The level-0 compiler written in the
nucleus is larger than the same compiler written in level 0 — every argument
becomes an explicit register move. What it buys is a smaller seed and
validation one artifact earlier.

## The admission rule

**A form belongs in the nucleus when it lowers to one instruction, or a fixed
short sequence, with no whole-program analysis.**

"No analysis" was the earlier wording and it was too strong. A local semantic
check — one the type checker performs anyway as it walks an expression, using
information it already holds — is not what the rule excludes. What it excludes
is a pass over the whole program: liveness, call-graph membership, reachability.

That is the gate, and it differs from level 0's. Level 0's rule was empirical:
a form is in when Candlemoth's source uses it. For a machine, the question is
what the machine does in one go. Under this rule, several forms that level 0
excluded as unused come back — `select`, `fill`, `clear` — because they are
instructions of this machine whether or not today's source reaches for them.

The rule also decides what stays out, and for a better reason than "unused":

- `DJNZ` needs `B` provably free across a loop body. That is an analysis.
- `IX` displacement needs a record layout. That is an analysis.
- Keeping a value in a register across statements needs liveness. That is an
  analysis.

Those are optimisations for a compiler with measurements in hand, not
instructions of a virtual CPU.

**The rule is a gate with teeth because nucleus creep is the failure mode.**
Every time the level-0 compiler is awkward to write there will be pressure to
add one more form. Four of those and the nucleus is level 0, two compilers
exist for one language and nothing has been gained. A proposed addition states
its lowering, in instructions, before it is discussed.

## The compatibility invariant

**Every nucleus program is a Lanternfly program with identical meaning.**

Nothing in this document is nucleus-only semantics. The register banks are
ordinary arrays. The stacks are ordinary arrays with an ordinary index. The
subroutines are ordinary parameterless subroutines. `fill` and `clear` are
section 8.5 standard operations. A level-2 Lanternfly compiler accepts every
nucleus program unchanged and produces the same results.

This constraint decides several things below that would otherwise go the other
way. It is why a condition is a `boolean` rather than a non-zero integer, and
why there is no byte view over the word bank.

## Types

`u8`, `u16` and `boolean`. Fixed one-dimensional arrays of those.

No `i16`: no nucleus operation produces a signed result, because there is no
unary minus and no subtraction rule that widens. That removes four signed
comparison routines and signed division from the runtime.

No enumerations: an enum is named constants plus a type identity plus a checked
ordinal conversion, and `const` supplies the first without the other two.

**`boolean` is a declarable type, not merely the transient result of a
comparison.** A comparison produces `boolean` and `if` and `while` require
`boolean`, both because Lanternfly requires it and because the alternative —
testing an integer for non-zero — would make nucleus programs invalid
Lanternfly. Once the type is present, forbidding storage of it saves nothing:
a `boolean` occupies one byte like a `u8`, loads the same way, and tests the
same way. It costs the distinction that makes `if count then` a type error
rather than a silent bug.

## Storage

Module-level `var` and `const`. Nothing else.

- No parameters. A subroutine takes none.
- No locals. A subroutine declares none.
- No routine results. A subroutine returns nothing.

A `const` array's initialiser is placed where the declaration sits, so the
array's storage is those image bytes. A `var` array is zeroed storage and takes
no initialiser, because its contents cannot be image bytes and the nucleus has
nowhere to run an initialising loop before the designated start.

### The register banks

Two module-level arrays, which are the machine's registers:

```lanternfly
var w as u16[256]      // words: addresses, counts, indices
var b as u8[256]       // bytes: characters, flags, small counters
```

**A constant index is the fast path**, and it is why these are registers rather
than an array with a pointer. `w[5]` lowers to `LD HL,(wbase+10)` — three
bytes, absolute, and its bounds check is performed at compile time so it costs
nothing at run time. A variable index costs twelve bytes and a runtime bounds
check.

**Supply is not scarce, so registers are named rather than allocated.** The
level-0 front end has roughly 260 scalar working values in total. A 256-entry
word bank is 512 bytes against some 20,000 bytes of tables. Every value gets
its own register permanently, the way a global gets its own name; nothing is
reused and nothing needs an allocator.

The two banks are separate storage. Lanternfly cannot express a byte view over
the word bank — `alias` requires the aliased path's type to match exactly, and
it is a local declaration besides — and the addition is not needed, because
taking a word's halves is a lowering rule rather than a storage arrangement.
See `nucleus-lowering.md`.

### Stacks

**Each stack is its own array, sized exactly.** Not a region of a register bank.

```lanternfly
var parseStack as u8[64]
var parseTop as u8         // the top element, cached
var parseDepth as u8       // how many are in the array
```

Its own array because the bounds check then serves as the overflow *and*
underflow check at no extra cost. A stack carved out of the bank traps on
overflow past the bank's end but silently corrupts a live register on
underflow.

**The top element is cached in a named register.** Peeking is then three bytes
against eighteen, and a parser peeks far more often than it pushes: every
iteration compares the top, only some iterations move the stack.

**Element width matches the data.** A stack of symbol numbers is `u8`, which
removes the index doubling and halves the storage.

Recursion, where it is needed, is a stack in data rather than in routine
nesting. That is what removes save-around-call from the compiler: the
programmer pushes what must survive, visibly.

## Subroutines

```lanternfly
sub scanName()
    ...
end
```

No parameters, no result, no locals. A call is `CALL nn` — three bytes, with no
argument stores, which is the cheapest call the machine has. Arguments and
results travel in the register banks by convention.

A subroutine survives at all because a machine with `CALL` and `RET` and no
computed jump needs one, and because factoring is otherwise unavailable.

## Control

`if` / `else`, `while`, `select` / `case` / `else`, `return`, `exit`,
`continue`.

`while` is the only loop. `for` is a counted loop with an implicit control
variable and limit storage, and `while` plus an explicit counter is the same
thing written out.

`exit` and `continue` are in, and the arithmetic is not close. Leaving a loop
early with a flag costs a test on every iteration — eight bytes of code plus
two of storage plus six at each exit point — against three bytes for the jump
`exit` becomes. They pay for themselves at around eight loops, and a compiler
has far more. `continue` shares `exit`'s loop-label stack, so its marginal
cost is a keyword and a few lines.

`select` is in because it lowers to a jump table. A ladder of comparisons is
roughly five bytes per arm and a linear walk; the table is nine bytes plus two
per case and one dispatch. Jump tables are how an assembly programmer writes a
dispatch, and a compiler is mostly dispatch.

## Operators

`+`, `-`, `*`, `/`, the six comparisons, and `not`.

No `and` or `or`. Short-circuit lowering emits the same code as nested `if` in
the common case, so they buy nothing until an `else` hangs off a compound
condition, and they cost the emission-suppression machinery. **They are the
first forms to return** if writing real nucleus source proves painful without
them — and that judgement is made from written source, not from argument.

`not` stays because it costs nothing at any of its three lowerings: as a whole
condition it swaps the branch arms, over a comparison it inverts the operator,
and over a stored `boolean` it is `XOR 1`.

No unary minus: with unsigned arithmetic only, negation is `0 - x`.

## Standard operations

`fill(target, value)` and `clear(target)`, both section 8.5 Lanternfly. Whole
array assignment, also already Lanternfly. Each lowers to `LDIR` — one
instruction that moves N bytes, and the most valuable thing the Z80 has that a
high-level language usually cannot express.

These were excluded from level 0 under its empirical rule because Candlemoth's
source did not use them. It did not use them because it was written in a style
that did not reach for them. Under the nucleus rule they are instructions and
they are in.

`find` is **not** in, and would have been a genuine addition to Lanternfly
rather than the un-exclusion of an existing operation. `CPIR` is a linear scan
in one instruction and it is tempting, and no existing operator means "search",
so reaching it needs new syntax. Shaping the language around the bootstrap's
convenience is the wrong direction. The nucleus writes its scans as loops.

## What the grammar analysis says

One contextual decision: a name at statement head is an assignment or a call,
resolved by the symbol's class. Level 0 has a second — a name in a primary is a
call or a conversion — and the nucleus does not, because expressions contain
neither.

No left recursion, no unreachable production, no unproductive production, and
no LL(1) collision without a declared predicate. `docs/nucleus-grammar-report.md`
is generated from the grammar and the test suite fails when the two disagree.

## What is deliberately not decided here

**Whether the parse stack uses the hardware stack.** `PUSH HL` and `POP HL` are
one byte each, which nothing in a register bank approaches, and the trade is
two bytes per operation against losing the free bounds check as an overflow
check. That is a measurement, not an argument, and it waits for an image.

**The bank sizes.** 256 entries each is a starting figure from the level-0
front end's working-set count. The real number comes from writing nucleus
source.

**Whether `and` and `or` return.** Stated above as the first candidates, on
evidence from written source.
