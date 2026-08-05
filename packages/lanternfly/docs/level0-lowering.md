# Level-0 lowering table

The exact instruction sequence for every level-0 construct, at byte
granularity. Phase 2 writes the seed against this document rather than by
transliterating Candlemoth, so this is where the two implementations agree.
Without it, byte-identity between them rests on nothing.

Every sequence below is pinned in `test/lowering.test.ts`, which assembles the
stated mnemonics through AZM and compares the result against the bytes claimed
here. The opcode constants in the Candlemoth source are checked the same way in
`test/opcodes.test.ts`. A change to an emitting routine that is not reflected
here fails one of those two tests.

## Registers

One convention runs through the whole table.

- **HL is the accumulator.** Every expression leaves its value there. A `u8`
  or `boolean` occupies L with H cleared, so a Boolean is 0 or 1 in HL.
- **DE is the left operand.** When an operation has two operands, the left one
  is in DE and the right in HL by the time the operation runs. Both operand
  paths converge on that arrangement — a folded left operand loads straight
  into DE, and a computed one is pushed and popped — so one sequence serves
  either case.
- **BC, IX, IY and the shadow set are untouched** by every shape here. The
  runtime routines may use them under the contracts below.

Nothing is kept in a register across a statement boundary. Every variable is
read from and written to its fixed address, which is what static frames buy:
a local costs the same three-byte load as a module-level name, and no
allocation state has to agree between the layout and emission passes.

## Expressions

<!-- generated:expressions -->
| Construct | Sequence | Bytes |
| --- | --- | --- |
| materialise a constant | `LD HL,nn` | 3 |
| materialise a constant left operand | `LD DE,nn` | 3 |
| save the left operand across the right | `PUSH HL` | 1 |
| restore the left operand | `POP DE` | 1 |
| `a + b` | `ADD HL,DE` | 1 |
| `a - b` | `EX DE,HL` / `OR A` / `SBC HL,DE` | 4 |
| `-a`, computed operand | `EX DE,HL` / `LD HL,0` / `OR A` / `SBC HL,DE` | 7 |
| `a or b`, Boolean — the right operand is skipped when the left is true | `LD A,L` / `OR H` / `JP NZ,nn` | 5 |
| `a and b`, Boolean — the right operand is skipped when the left is false | `LD A,L` / `OR H` / `JP Z,nn` | 5 |
| `not a`, Boolean operand | `LD A,L` / `XOR 1` / `LD L,A` / `LD H,0` | 6 |
| `a and b`, integer operands — bitwise, both evaluated | `LD A,L` / `AND E` / `LD L,A` / `LD A,H` / `AND D` / `LD H,A` | 6 |
| `a or b`, integer operands — bitwise, both evaluated | `LD A,L` / `OR E` / `LD L,A` / `LD A,H` / `OR D` / `LD H,A` | 6 |
| `not a`, integer operand — bitwise complement | `LD A,L` / `CPL` / `LD L,A` / `LD A,H` / `CPL` / `LD H,A` | 6 |
| `a * b`, `a / b`, every computed comparison | `CALL nn` | 3 |
<!-- /generated -->

A constant operand emits nothing where it is written. It materialises only
where something consumes it that could not fold it, which is why a wholly
constant expression costs no instructions at all.

There is no `SUB HL,DE` on this machine, so subtraction exchanges its operands
first and negation loads zero into the accumulator and subtracts into it.
Boolean operations are byte-wide because a Boolean occupies one byte of L,
which is the only place in the table where the operand width differs from the
accumulator width.

## Scalar access

<!-- generated:scalars -->
| Construct | Sequence | Bytes |
| --- | --- | --- |
| read a `u8` or `boolean` variable | `LD A,(nn)` / `LD L,A` / `LD H,0` | 6 |
| read a `u16` or `i16` variable | `LD HL,(nn)` | 3 |
| assign to a `u8` or `boolean` variable | `LD A,L` / `LD (nn),A` | 4 |
| assign to a `u16` or `i16` variable | `LD (nn),HL` | 3 |
<!-- /generated -->

A byte-wide read clears H rather than leaving it, so every value in the
accumulator is a full sixteen bits regardless of the type it came from. That
costs three bytes per read and removes a whole class of disagreement about
what the upper half holds.

## Element access

A subscript is bounds-checked, which the language requires. The address
computation and the access are separate shapes because an assignment computes
the address before it evaluates the value, and pushes the address across it.

<!-- generated:elements -->
| Construct | Sequence | Bytes |
| --- | --- | --- |
| address of `a[i]`, byte-wide element | `LD DE,nn` / `CALL nn` / `LD DE,nn` / `ADD HL,DE` | 10 |
| address of `a[i]`, sixteen-bit element | `LD DE,nn` / `CALL nn` / `ADD HL,HL` / `LD DE,nn` / `ADD HL,DE` | 11 |
| read `a[i]`, byte-wide, address in HL | `LD A,(HL)` / `LD L,A` / `LD H,0` | 4 |
| read `a[i]`, sixteen-bit, address in HL | `LD E,(HL)` / `INC HL` / `LD D,(HL)` / `EX DE,HL` | 4 |
| assign to `a[i]`, address in DE, value in HL | `LD A,L` / `LD (DE),A` | 2 |
| assign to `a[i]`, address in DE, value in HL | `EX DE,HL` / `LD (HL),E` / `INC HL` / `LD (HL),D` | 4 |
<!-- /generated -->

The byte counts above exclude the index expression, which precedes them, and
the three bytes that materialise the index when it folded.

A sixteen-bit element doubles its index with `ADD HL,HL`: one byte and eleven
cycles, against roughly nine hundred for a multiply call. Larger strides do not
arise, because level 0 has one-dimensional arrays of scalars only.

An assignment to `a[i]` emits, in order: the address shape, `PUSH HL`, the
value expression, `POP DE`, and the assign shape. The address is computed first
because both expressions use HL, and it has to survive the second one.

## Control

<!-- generated:control -->
| Construct | Sequence | Bytes |
| --- | --- | --- |
| reduce the accumulator to a flag | `LD A,L` / `OR H` | 2 |
| `while`, `for`, `exit`, `continue`, an `else` arm's skip | `JP nn` | 3 |
| `if` and `while`, entering the body | `LD A,L` / `OR H` / `JP Z,nn` | 5 |
| `for`, leaving at the limit | `LD A,L` / `OR H` / `JP NZ,nn` | 5 |
| a call, once its arguments are stored | `CALL nn` | 3 |
| `return`, and the implicit one at a body's end | `RET` | 1 |
<!-- /generated -->

**Every jump is three-byte absolute, forward and backward alike.** A relative
jump would save a byte per backward branch, and it is not taken.

The reason is reachability rather than length. `JR` is two bytes whichever
displacement it carries, so choosing it never changes an instruction's size —
an earlier version of this paragraph said it did, and that was wrong. What it
changes is that `JR` only reaches ±127, so a compiler that used it where it
fits and `JP` where it does not would make the branch form depend on a
measured distance. Two implementations that measure that distance differently
emit different bytes for the same source, and the fixpoint is a byte
comparison.

One shape everywhere costs a byte per backward branch and removes the
question.

Forward targets work at all because the layout pass records every label's
address in a table and the emission pass reads a table that is already
complete. The emission pass writes to a port, so its output cannot be seeked
and back-patching is unavailable — which is the reason for the third pass, not
an incidental property of it.

### Statement shapes

Composed from the rows above. `L1`, `L2` are label addresses from the table.

```
if cond then A end          cond; jump-if-false L1; A; L1:
if cond then A else B end   cond; jump-if-false L1; A; jump L2; L1: B; L2:
while cond ... end          L1: cond; jump-if-false L2; body; jump L1; L2:
for v = a to b ... end      a; store v; b; store limit;
                            L1: load v; PUSH HL; load limit; POP DE;
                                CALL compareGreater; jump-if-true L3;
                                body;
                            L2: load v; LD DE,1; ADD HL,DE; store v; jump L1;
                            L3:
for v = a until b ... end   as above with CALL compareGreaterEqual
exit                        jump to the enclosing loop's L3
continue                    jump to the enclosing loop's L2
```

`to` includes the limit and `until` stops below it, which is the whole
difference between them and selects the comparison routine. Both forms appear
in Candlemoth's own source, so a compiler that accepted only one could not
compile itself.

The loop's limit is evaluated once into compiler-owned storage. Re-evaluating
it each turn would be a second reading of an expression the source wrote once.

## Calls

A call stores its arguments directly into the callee's parameter storage,
left to right, then calls. Static frames mean a parameter has a fixed address,
so an argument is a store rather than a push, and the sequence is the same
whether or not the callee belongs to a recursive group.

```
f(x, y)     x; store f's parameter 0; y; store f's parameter 1; CALL f
```

Each store uses the scalar assign shape for that parameter's type. A
subroutine's parameters occupy the symbol slots immediately above its own,
which is what lets a call site reach a parameter by arithmetic — necessary
because a parameter is out of scope everywhere a call is written.

**Save-around-call is the caller's, at the call site.** A caller that is in
the same strongly-connected component as its callee saves the storage the call
would overwrite — the callee's parameters and any of the caller's own locals
still live — and restores it after the call returns. Callers outside the
component emit nothing.

The document said the opposite before, which conflicted with the plan, the
findings and the source. Putting it at the call site is what makes it
conditional on the call rather than on the routine: a routine in a recursive
group is called from inside the group and from outside it, and only the
inside calls need the saving. A callee that saved on entry would pay on every
call, including the ones that cannot recurse.

The analysis pass supplies the component membership, which is why it reads
every body before layout begins.

A body that falls off its end emits `RET`, so every subroutine returns whether
or not the source wrote `return`.

## Runtime routines

Fourteen routines, hand-written in AZM with register contracts, covered by
proofs. They live in `candlemoth/runtime.asm` and come to **262 bytes**.
`candlemoth/runtime.lafy` is generated from that source by
`npm run generate:runtime`, so the assembly and the bytes Candlemoth plants
cannot drift; `test/runtime-image.test.ts` fails when they do.

### Memory layout

```
0000        JP to the designated start                    3 bytes
0003..0007  free
0008        RST 08          \
0010        RST 10           |
0018        RST 18           |  the machine's, not the program's
0020        RST 20           |
0028        RST 28           |
0030        RST 30           |
0038        RST 38, and the IM 1 interrupt entry
0066        NMI entry       /
0100..0205  runtime image                                 262 bytes
0206..      program code, then program storage
```

**Page zero is reserved whole and code starts at `$0100`**, which is where
CP/M starts it and for the same reason. Address `$0000` holds the jump to the
designated start because that is where the processor begins; everything above
it in the page belongs to the restart vectors and the NMI entry. The 253 bytes
between the entry jump and `$0100` are not waste on a real target — they are
the vectors, and a target that uses `RST` or interrupts fills them.

An earlier draft of this document put the runtime at `$0003`, directly after
the entry jump, which covered every one of those locations. It passed, because
the bootstrap machine raises no interrupt and executes no `RST`. That is the
kind of wrong a green test suite does not catch, and the layout above is what
a Z80 program looks like whether or not the current host exercises it.

### Placement

**The image is not position-independent.** The routines call each other, this
machine's only `CALL` is absolute, and the comparison routines share two exits
reached by absolute jumps, so the bytes are correct at exactly one origin.

`placeRuntime` checks the address it is given rather than adding a base to an
offset. A runtime placed anywhere else would run its own absolute jumps into
program code, and the symptom — a comparison that returns a plausible wrong
answer — is one the fixpoint would surface long after the cause.

Nothing above binds the compiler to a low-memory target. The layout is stated
against a generic Z80 with the standard `IN` and `OUT`, which is what the
bootstrap machine is. A ROM-resident target moves the whole image and changes
only `RUNTIME_ORIGIN` and the address the entry jump carries.

The ordinal is the routine's index in the compiler's address table and is
part of this contract. The seed and Candlemoth must use the same ordinal so
each can find the routine's address.

| Ordinal | Routine | In | Out |
| --- | --- | --- | --- |
| 0 | `multiply` | DE × HL | HL, low sixteen bits |
| 1 | `divide` | DE / HL, unsigned | HL |
| 2 | `signedDivide` | DE / HL, signed | HL |
| 3 | `compareEqual` | DE, HL | HL = 0 or 1 |
| 4 | `compareNotEqual` | DE, HL | HL = 0 or 1 |
| 5 | `compareLess` | DE, HL, unsigned | HL = 0 or 1 |
| 6 | `compareLessEqual` | DE, HL, unsigned | HL = 0 or 1 |
| 7 | `compareGreater` | DE, HL, unsigned | HL = 0 or 1 |
| 8 | `compareGreaterEqual` | DE, HL, unsigned | HL = 0 or 1 |
| 9 | `compareSignedLess` | DE, HL, signed | HL = 0 or 1 |
| 10 | `compareSignedLessEqual` | DE, HL, signed | HL = 0 or 1 |
| 11 | `compareSignedGreater` | DE, HL, signed | HL = 0 or 1 |
| 12 | `compareSignedGreaterEqual` | DE, HL, signed | HL = 0 or 1 |
| 13 | `boundsCheck` | HL index, DE limit | HL unchanged, or traps |

In every case DE holds the left operand and HL the right, matching the
register convention above.

Equality needs no signed form, because a sixteen-bit subtract leaves equality
in one flag either way. Ordering does: the unsigned answer is in the carry and
the signed answer is in the sign against overflow, so the two orderings cannot
share a routine. Signed and unsigned multiplication produce the same low
sixteen bits, so one routine handles both.

`multiply` keeps the low sixteen bits and discards the high half, as required
for the language's wrapping multiplication. An exact multiplication that
leaves sixteen bits is caught by the folder at compile time, not here.

Both divisions truncate towards zero, the same direction the compile-time
folder truncates in, which is what keeps a folded division and an emitted one
agreeing. `signedDivide` of -32768 by -1 yields -32768: the negation of -32768
is itself in two's complement, so the sign handling produces the wrap without a
special case. That is defined behaviour rather than an omission.

### Traps

`boundsCheck` and both divisions trap rather than returning a fault, because
level 0 has no error subsystem and neither a failed subscript nor a division by
zero has a continuation. A trap writes a diagnostic byte to port `$03`, writes
exit status `$02` to port `$02`, and halts.

| Status | Meaning |
| --- | --- |
| `$00` | success |
| `$01` | compile fault |
| `$02` | runtime trap from the routines above |

| Diagnostic byte | Trap |
| --- | --- |
| `$01` | subscript out of range |
| `$02` | division by zero |

Halting rather than jumping to an installable handler is the whole of the
decision: a handler the program could install would be a continuation, and
there is nothing for it to continue.

## Reductions deliberately not taken

Three, all of which would change the byte counts above and none of which is
written. They are named here so the seed matches Candlemoth rather than
improving on it, and so the measurement in Phase 3 covers the same code.

- **A constant initialiser** could become an image byte instead of a load and
  a store. It does not: the load is planted before the fold is known.
- **A constant subscript** could skip its bounds check, since the check is
  decidable at compile time.
- **A constant multiplier** could become shifts and adds instead of a call to
  a routine costing about ninety times an add.

Measuring all three together, once the seed exists, is the sensible order.
Taking any of them before then means the two implementations disagree on
bytes for no gain that has been measured.
