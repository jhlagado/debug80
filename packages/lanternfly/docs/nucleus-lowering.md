# Nucleus lowering

The instruction table. Every nucleus construct and the Z80 it becomes.

**Draft, not normative.** See `docs/nucleus-review-actions.md`.

**Every sequence below is assembled.** The tables are generated from
`src/bootstrap/nucleus-manifest.ts` by `npm run generate:nucleus`, and the byte
counts come from the assembler rather than from a person — two of the counts
written by hand were wrong, one of them a sequence that does not exist. The
`Given` column states the condition where a sequence holds only under one,
because the two errors were both cases quoted as general.

Draft alongside `docs/nucleus.md`, which defines the machine, and
`candlemoth/nucleus.grammar`, which defines the syntax. This document is what
makes the admission rule checkable: a form belongs in the nucleus when it
appears here as one instruction or a fixed short sequence.

Byte counts are from the instruction encodings and are marked as estimates
where a sequence depends on context. **No compiled nucleus image exists**, so
nothing here is a measurement of a real program.

## Registers

`HL` is the accumulator and `DE` the left operand, as at level 0. `A` holds a
byte-typed value, which is the one convention that differs and the one that
matters most: a `u8` that stays in `A` costs three bytes to load where widening
it into `HL` costs six.

`BC` is free at every shape below, which is what lets a service call carry its
selector there.

## Register access

<!-- generated:registers -->
| Construct | Sequence | Bytes | Given |
| --- | --- | --- | --- |
| `w[5]` | `LD HL,($9010)` | 3 | — |
| `w[5] = …` | `LD ($9010),HL` | 3 | — |
| `b[5]` | `LD A,($9005)` | 3 | — |
| `b[5] = …` | `LD ($9005),A` | 3 | — |
| `w[i]` | `LD HL,($9100)` / `ADD HL,HL` / `LD DE,$9000` / `ADD HL,DE` / `LD E,(HL)` / `INC HL` / `LD D,(HL)` / `EX DE,HL` | 12 | the index is a `u16`; a `u8` index uses the form below |
| `w[i]` where `i` is a `u8` | `LD A,($9100)` / `LD L,A` / `LD H,0` / `ADD HL,HL` / `LD DE,$9000` / `ADD HL,DE` / `LD E,(HL)` / `INC HL` / `LD D,(HL)` / `EX DE,HL` | 15 | a byte index is loaded through `A`; `LD HL,(i)` would read the adjacent byte as the high half |
| `b[i]` where `i` is a `u8` | `LD A,($9100)` / `LD L,A` / `LD H,$90` / `LD A,(HL)` | 7 | — |
| every non-constant subscript | `LD DE,$0040` / `CALL $0200` | 6 | — |
<!-- /generated -->

**A constant index carries no runtime bounds check**, because the check is
decidable at compile time. That is why registers are named and why a variable
index is four to six times the cost.

## Taking a word's halves

The two operations a byte view over the word bank would have provided. Both are
recognitions on a constant operand — no analysis.

<!-- generated:halves -->
| Construct | Sequence | Bytes | Given |
| --- | --- | --- | --- |
| `u8(w and 255)` | `LD A,L` | 1 | the word is in `HL` |
| `u8(w / 256)` | `LD A,H` | 1 | the word is in `HL` |
| `hi * 256 + lo` | `LD H,B` / `LD L,C` | 2 | **both halves are already in registers** — this is the case the document first quoted as general, and it is not |
| `hi * 256 + lo` | `LD A,($9000)` / `LD H,A` / `LD A,($9001)` / `LD L,A` | 8 | the ordinary case, both halves being byte variables |
<!-- /generated -->

`emitWord` writes exactly `u8(value and 255)` and `u8(value / 256)` today. Left
unrecognised those are a mask and a divide; recognised they are the two
instructions that pick a half of `HL`.

## Arithmetic

Unchanged from `level0-lowering.md` for the shared operators, minus everything
signed.

<!-- generated:arithmetic -->
| Construct | Sequence | Bytes | Given |
| --- | --- | --- | --- |
| `a + b` | `ADD HL,DE` | 1 | — |
| `a - b` | `EX DE,HL` / `OR A` / `SBC HL,DE` | 4 | — |
| `d = a - b`, all `u8` | `LD HL,$9001` / `LD A,($9000)` / `SUB (HL)` | 7 | the round-trip conditions in `nucleus-review-actions.md` all hold |
| `a * b`, `a / b` | `CALL $0200` | 3 | — |
| `a * 2` | `ADD HL,HL` | 1 | — |
| `a and <single-bit constant>` | `BIT 3,(HL)` | 2 | the value is addressed through `HL` |
<!-- /generated -->

Signed comparison and signed division are absent from the nucleus runtime,
which takes it from fourteen routines to nine.

## Conditions

<!-- generated:conditions -->
| Construct | Sequence | Bytes | Given |
| --- | --- | --- | --- |
| `if flag then`, `x <> 0` | `LD A,($9005)` / `OR A` | 4 | — |
| `a < b` and the other five | `CALL $0200` | 3 | the helper returns 0 or 1 in `A`, so no transfer follows |
| `not flag` | `XOR $01` | 2 | — |
<!-- /generated -->

`x <> 0` folds to the flag test rather than a comparison routine, which is what
makes `if flag then` and `if flag <> 0 then` identical code and what makes
`boolean` free to keep.

## Control

<!-- generated:control -->
| Construct | Sequence | Bytes | Given |
| --- | --- | --- | --- |
| `while`, `exit`, `continue`, an `else` arm's skip | `JP $0200` | 3 | — |
| `if` and `while`, entering the body | `OR A` / `JP Z,$0200` | 4 | the condition is already in `A` |
| `exit` on a condition | `OR A` / `JP NZ,$0200` | 4 | the condition is already in `A` |
| a call statement | `CALL $0200` | 3 | — |
| one of the six or seven hottest routines | `RST $10` | 1 | — |
| `return`, and the implicit one at a body's end | `RET` | 1 | — |
| `select` on a dense `u8` selector | `LD H,$92` / `ADD A,A` / `LD L,A` / `LD E,(HL)` / `INC HL` / `LD D,(HL)` / `EX DE,HL` / `JP (HL)` | 9 | the selector is in `A` and normalised to zero, and the address table is page-aligned; the range check is separate |
| the guard that falls to `else` | `CP $19` / `JP NC,$0200` | 5 | the selector is in `A`; `span` is the case count |
| a case span not starting at zero | `SUB $05` | 2 | — |
<!-- /generated -->

Every jump is absolute, forward and backward. `JR` reaches only ±127, so
choosing it would make the branch form depend on a measured distance, and two
implementations that measure differently emit different bytes for the same
source. `level0-lowering.md` states the same rule.

### Statement shapes

```
if c then A end             c; jump-if-false L1; A; L1:
if c then A else B end      c; jump-if-false L1; A; jump L2; L1: B; L2:
while c ... end             L1: c; jump-if-false L2; body; jump L1; L2:
while true ... end          L1: body; jump L1                    (no test)
exit                        jump to the enclosing loop's exit label
continue                    jump to the enclosing loop's top
```

**A constant-true loop condition emits no test.** Without that rule
`while true` pays four bytes per iteration for a test that never fails, and the
idiomatic nucleus loop — `while true … exit … end` — would cost more than the
flag it replaces.

### `select`

A dense selector, with the address table page-aligned:

```
LD   H,high(table)      ; 2
ADD  A,A                ; 1     index × 2
LD   L,A                ; 1
LD   E,(HL)             ; 1
INC  HL                 ; 1
LD   D,(HL)             ; 1
EX   DE,HL              ; 1
JP   (HL)               ; 1
```

Nine bytes, plus two per case for the address, plus a range check that falls to
`else` outside the case span. Constant time.

Against a ladder at roughly five bytes per arm and a linear walk: for a
twenty-five arm dispatch that is **59 bytes against about 125**, and one
dispatch against twelve comparisons on average.

Page alignment requires twice the case count to stay under 256, so at most 128
cases. Sparse or widely spread cases keep the ladder; the compiler chooses by
the span of the case constants, which is a constant-time decision on values it
already has, not an analysis.

## Block operations

<!-- generated:block -->
| Construct | Sequence | Bytes | Given |
| --- | --- | --- | --- |
| `destination = source` | `LD HL,$9000` / `LD DE,$9100` / `LD BC,$0040` / `LDIR` | 11 | — |
| `fill(a, v)`, and `clear(a)` with zero | `LD HL,$9000` / `LD (HL),$00` / `LD DE,$9001` / `LD BC,$003F` / `LDIR` | 13 | — |
| a 256-entry byte table subscripted by a `u8` | `LD H,$92` / `LD L,A` / `LD A,(HL)` | 4 | the subscript is in `A` |
<!-- /generated -->

Each is one instruction of work over N bytes. They are inlined rather than
called: a runtime `fill` would need the same three register setups plus a
`CALL`, which is no smaller and slower.

## Tables

**A 256-entry byte table is page-aligned.** Indexing becomes:

```
LD   H,high(t)          ; 2
LD   L,A                ; 1
LD   A,(HL)             ; 1
```

Four bytes, against eight for loading a base and adding an index. The
character-class table is indexed once per source character, so this is the
hottest lookup in a compiler.

This is a layout rule, not a language feature: the compiler aligns any
256-entry byte array whose subscript is a `u8`.

## `RST` vectors

Page zero holds eight restart addresses and the flat profile owns them, but
**seven are usable, not eight**: address `$0000` carries the three-byte entry
jump, so `RST 00` is unavailable. The remaining slots sit eight bytes apart,
which fits a `JP nn` to the real routine and nothing more, so **each vector
costs three bytes and one extra jump per call at run time.**

Recomputed on the current level-0 front end as a proxy for a nucleus compiler's
call distribution, with the vector jumps counted:

| Slots | Calls | As `CALL` | As `RST` + vectors | Saving |
| --- | --- | --- | --- | --- |
| 7 | 311 | 933 B | 311 + 21 = 332 B | **601 B** |
| 6 | 288 | 864 B | 288 + 18 = 306 B | **558 B** |

An earlier revision of this document claimed 658 bytes from eight slots with no
vector cost. Both parts of that were wrong: `RST 00` is taken, and a restart
slot is too small to hold a routine, so it holds a jump to one.

Six slots rather than seven if a fault vector is wanted at `RST 08`, which is
the conventional place for one. Which routines take the slots is a layout
decision from the call graph the analysis pass already builds.

## Runtime routines

Nine, against level 0's fourteen. The signed comparisons and signed division
are gone with `i16`.

| Ordinal | Routine | In | Out |
| --- | --- | --- | --- |
| 0 | `multiply` | DE × HL | HL, low sixteen bits |
| 1 | `divide` | DE / HL, unsigned | HL |
| 2 | `compareEqual` | DE, HL | HL = 0 or 1 |
| 3 | `compareNotEqual` | DE, HL | HL = 0 or 1 |
| 4 | `compareLess` | DE, HL | HL = 0 or 1 |
| 5 | `compareLessEqual` | DE, HL | HL = 0 or 1 |
| 6 | `compareGreater` | DE, HL | HL = 0 or 1 |
| 7 | `compareGreaterEqual` | DE, HL | HL = 0 or 1 |
| 8 | `boundsCheck` | HL index, DE limit | HL unchanged, or traps |

Trap semantics are as `level0-lowering.md` states: a diagnostic byte to port
`$03`, exit status `$02`, then halt.

## Rules that are recognitions, not optimisations

Collected, because the admission rule turns on the distinction. Each is a match
on a constant operand or a fixed shape, decidable without analysis:

- `u8(w and 255)` → `LD A,L`
- `u8(w / 256)` → `LD A,H`
- `hi * 256 + lo` → `LD H,hi` / `LD L,lo`
- `x <> 0`, `x = 0` → the flag test
- `x and <single-bit constant>` → `BIT n`
- `x shl 1`, `x * 2` on a word → `ADD HL,HL`
- a constant-true loop condition → no test
- a constant array subscript → compile-time bounds check
- a byte-typed subexpression → stays in `A`
- a 256-entry byte table subscripted by a `u8` → page-aligned

## What waits for measurement

- Whether the parse stack should use the hardware stack, at one byte per push
  against losing the bounds check as an overflow check.
- Which routines take the six or seven `RST` slots.
- Whether a constant multiplier should become shifts and adds, and at what
  threshold.

None of these can be decided from source appearance, and
`candlemoth-size-discipline.md` is explicit that the binary and the memory map
set the priorities.
