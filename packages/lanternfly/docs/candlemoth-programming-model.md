# The programming model Candlemoth is written in

`candlemoth-size-discipline.md` governs what to optimise and in what order.
This document is narrower: it records how Candlemoth's source is *shaped*, and
why that shape differs from the structured-programming default.

The short version: **a routine per concept is the wrong default on this
machine.** Encode decisions in tables, read the tables with code written once,
and keep routines for the places where the work genuinely differs. But the
rule has an edge, and finding the edge is most of this document.

## What structured programming costs here

Two costs, and only one of them is obvious.

**Depth.** A recursive-descent expression parser with one routine per
precedence level enters every level to reach a single operand. Candlemoth's
did: `parseExpression`, `parseOr`, `parseAnd`, `parseNot`, `parseComparison`,
`parseAdditive`, `parseMultiplicative`, `parseUnary`, `parsePrimary` — nine
frames to read the name `a`. Every one of those routines is in the same
strongly-connected component, because they call one another, so every call
site among them carries save-around-call. Nine frames means eight save and
restore sequences to read one name.

**Parameters.** Static frames give every parameter a fixed address, so passing
one is a store at the call site rather than a register move. A no-argument
call is three bytes; a call with one byte parameter is `LD A,n`, `LD (addr),A`
and `CALL nn` — eight. Factoring common code into a parameterised routine, the
standard structured move, therefore *adds* five bytes per call site and
removes the body once.

That second cost is the one that catches people out, and it inverts a rule
most programmers hold without examining. Below about six call sites, factoring
a small routine out makes the program bigger.

## The two table shapes, and which one pays

**A table that replaces control flow pays.** The character-class table is 256
bytes and removes a ladder of range tests from every character the tokenizer
reads. The keyword spellings are 103 bytes of constant array plus two index
tables and a two-line loop, where one call per letter was 130 lines. The
operator precedence table is 13 rows and removes five routines' worth of
nesting.

**A table that only replaces code does not.** An emission table — every fixed
instruction sequence in one byte array, played back by one routine taking a
shape number — was measured before it was written. Fourteen emitting routines
at roughly 21 bytes each is about 294 bytes; the table plus its playback loop
plus two index tables is about 141. That saves 150 bytes and adds five bytes
at each of some thirty call sites, which is 150. It is a wash, and it was not
written.

The distinction is worth stating as a rule: **a table pays when it removes
branching, and breaks even at best when it only removes duplicated straight
line code.** On a machine with register parameters the second case would pay;
on static frames it does not.

## What changed in the expression parser

Six recursive levels became one loop over a precedence table. The grammar
moved from the order in which routines called each other into two tables: 13
rows of precedence and a 10-row map from punctuation to operator ordinal.

Precedence also classifies, so no second table is needed. Levels one and two
are the word operators, three is comparison, four and five are arithmetic —
the same number that orders the operators says which rules apply to them.

Measured against the previous draft:

| | Before | After |
| --- | --- | --- |
| Code lines in the binary grammar | 307 | 279 |
| Routines | 8 | 9 |
| Static frame bytes | 32 | 39 |
| Frames entered to read one operand | 9 | 4 |

**The source barely shrank and the static frames grew.** The saving is in what
happens per expression: four frames instead of nine, three save-around-call
sequences instead of eight. That is a run-time saving that shows up in the
instruction count for a self-compilation, and its effect on image size is
unknown until a compiled image exists.

The after column also does strictly more than the before column, which had no
short-circuit Boolean lowering, no typed constant folding and no integer word
operators. Reading the two line counts as a like-for-like comparison would
overstate the result in one direction and understate it in the other.

## What stays structured

**Prefix operators.** `not` and unary minus are right-associative, so a chain
of them is genuinely nested and a table buys nothing. Two forms, one routine.

**The statement dispatcher.** A ladder of keyword tests is what it is, because
level 0 has no routine values and so no jump table. A `select` would compile
to the same comparison chain. The fix belongs in the lowering — emitting a
jump table for a dense `select` — rather than in the source.

**The hand-written runtime.** 262 bytes for fourteen routines, and the
discipline document is right that measurement should decide whether work there
matters. The ten comparison routines share a shape and could become one
routine and a condition table; that is perhaps 70 bytes, and it is on the list
rather than done.

## The rule this leaves

Before factoring anything out, count the call sites and multiply by five. That
is the parameter cost, and it is the number a structured-programming instinct
does not include.

Before writing a routine per case, ask whether the cases differ in what they
*do* or only in which constants they use. Constants belong in a table; only
different work deserves a routine.

Neither rule is a licence to write the whole compiler as one procedure.
Depth costs, and so does duplication; what the machine changes is where the
line sits, and on static frames with no register parameters it sits several
call sites further towards the table than it would elsewhere.
