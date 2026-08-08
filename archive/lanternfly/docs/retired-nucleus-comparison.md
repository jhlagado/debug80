# Nucleus

A small typed language for sixteen-kilobyte Z80 systems, executed by a register
virtual machine.

## Status

**This is a hypothesis with a falsification test, not a specification.**

Every figure is marked either *counted* — produced by AZM or by the Debug80 Z80
runtime and reproducible from a test in this package — or *estimated*, which
means an argument that has not yet met an assembler.

The document is falsified if the measured VM core, once written, cannot reach
the budget in [The budget](#the-budget) without giving up the type model in
[Types](#types) or the error model in [Errors](#errors). The response to that is
to change this document.

Nothing here governs Lanternfly, and nothing Lanternfly has decided governs it.

## A note on the name

`packages/lanternfly/docs/nucleus/v2.md` uses "nucleus" for something else: the
restricted *Lanternfly* subset below level 0, which exists to reach a
self-compilation fixpoint cheaply. That nucleus is Lanternfly. This one is a
different language with a different execution model.

The collision is deliberate for now and unresolved. Either this package takes
the name and the Lanternfly subset is renamed, or the reverse.

## Why this is not a smaller Lanternfly

Lanternfly's nucleus v2 strips the language to 29 productions — no parameters,
no locals, no recursion, no results, no enums, no `for` — and still projects
about 31K, with roughly forty per cent uncertainty either way
(`packages/lanternfly/docs/nucleus/v2.md`). Removing nearly every feature barely
moved the number.

The bytes are not in the feature list. They are in three commitments that
survive every cut:

1. **A conversion lattice.** Not the syntax of types — the relations between
   them. `u8`/`u16`/`i16` promotion, exactness rules, typed folding, type
   identity in every symbol.
2. **Native code generation.** Every decision about which register holds a
   value is compiler code.
3. **Per-site safety.** A bounds check costs bytes at each of 169 subscript
   sites, so safety scales with program size.

Nucleus keeps types and drops the lattice, keeps safety and moves it into the
interpreter, and generates code for a machine that has no register allocation
problem. Those three changes are the whole design.

**The surface language is therefore more comfortable than level-0 Lanternfly,
not less.** Level 0 gave up strings entirely, along with hexadecimal and
character literals, `else if`, declarations after the first statement,
multi-line conditions and recursion — all to keep a native code generator small
(`packages/lanternfly/docs/level0.md`). Nucleus has them, because the
interpreter absorbs the cost that made them expensive.

## The budget

Sixteen kilobytes, resident, holding the whole system: front end, virtual
machine, runtime and editor. User source, bytecode, symbol table and data live
in what is left.

| Component | Estimate |
| --- | --- |
| Tokenizer and character-class table | 700 |
| Symbol table | 500 |
| Expression parser and operator table | 500 |
| Statement parser and control stack | 800 |
| Declarations | 300 |
| Emitter and numeric diagnostics | 300 |
| **Front end** | **~3.1K** |
| Dispatch and opcode table | 300 |
| Opcode handlers | 1.4K |
| 16-bit multiply and divide | 120 |
| **Virtual machine** | **~1.8K** |
| Console, editor, source buffer | ~2.5K |
| **Total** | **~7.4K** |

*Estimated, all of it.* The VM row is the first to become counted, because it
is the first thing written.

## Types

Three type codes. No implicit conversion anywhere.

| | |
| --- | --- |
| `int` | 16-bit signed |
| `str` | counted, declared capacity, stored in the frame |
| `array` | of `int` or of `byte`, one dimension, compile-time size |

`byte` is a **storage class, not a value type**. `screen[i]` loads a byte and
widens to `int`; `screen[i] = n` stores the low byte and range-checks `n` at
run time. Values are always `int`, so no conversion rule is needed to describe
what happens.

Conversion between `int` and `str` is an explicit call: `str$(n)`, `val(s)`.

Not present: unsigned types, `i8`, 32-bit types, floating point, enums,
records, subranges, multidimensional arrays, type aliases.

With three type codes the operator table's result column *is* the type checker.
Estimated cost: 200 to 400 bytes.

## Errors

**A Nucleus program never corrupts the machine. It stops and says why.**

Checks live inside opcode handlers, so each exists once and costs nothing per
site. This is the trade Lanternfly cannot make: its bounds checks cost about
six bytes at every subscript, *counted*, against eight bytes once here.

| Code | Raised by |
| --- | --- |
| `E01` | division by zero |
| `E02` | integer overflow |
| `E03` | index out of range |
| `E04` | string capacity exceeded |
| `E05` | call depth exceeded |
| `E06` | byte value out of range |

Uninitialised variables are removed rather than detected: a frame is zeroed on
entry.

**No message text is resident.** The machine reports a code and a bytecode
address and returns control to the monitor:

```
? E03 @ 0A3C
```

The host maps that back through the listing the compiler already produced:

```
E03  index out of range
     screen[i] = value
     clear.nuc:14, in clear()
     i = 1024, bound = 1024
```

So diagnosis costs three bytes on the target and everything else on the
workstation.

Handled errors are out of scope and stay affordable. A handler in a VM is a
saved frame pointer and resume address, and unwinding is popping the frame
stack — an estimated forty bytes, whenever it is wanted.

## The machine

**A register virtual machine, three-address, byte-aligned operand fields.**

The first draft of this design used a stack machine on the Forth analogy. That
was wrong, and the reason is worth recording because it recurs.

`a = b + c`, estimated, dispatch taken as ~50T:

| | bytes | T-states |
| --- | --- | --- |
| Stack: `LD b; LD c; ADD; ST a` | 7 | ~446 |
| Register: `ADD a,b,c` | 4 | ~160 |

The register machine wins on both axes, by about the 2× Lua reported when it
made the same change in Lua 5.0. Dispatch dominates an interpreter's cost, and
locals-as-slots remove the load/store traffic rather than making it cheaper.
Compiler-shaped code gains more, because compare and branch fuse:
`JNE tok, #tokName, addr` is 5 bytes and one dispatch against 9 bytes and four.

Two Z80-specific consequences:

- **Operand fields are whole bytes.** Nibble packing saves a byte and costs
  more T-states than the byte is worth: `LD A,(HL) / INC HL` is 11T, and
  nibble extraction exceeds that.
- **128 opcodes, not 256**, so the dispatch table is one page and its index is
  `A + A`.

The compiler is barely affected. A register VM's temporary allocator is a
compile-time stack of slot numbers with a per-routine high-water mark, which is
the same structure a stack machine's compiler already keeps.

## First measurement

How a slot index becomes an address, which a three-address instruction does
three times. `asm/variant-{a,b,c}.asm` implement the same seven opcodes three
ways; `test/frame-addressing.test.ts` runs the identical bytecode on each and
checks they agree on the answer before comparing costs.

| Variant | Addressing |
| --- | --- |
| **A** | frame base in `IX`, `PUSH IX / POP HL / ADD HL,BC`, as a subroutine |
| **B** | page-aligned frames, page byte as an immediate, as a subroutine |
| **C** | variant B inlined, page byte read from a fixed cell |

*Counted*, at 4 MHz, from `npm run measure -w nucleus`:

| | A | B | C |
| --- | --- | --- | --- |
| VM core, 7 opcodes | 165 b | **162 b** | 210 b |
| `sum 0..99`, 100 iterations | 129,189 T | 100,251 T | **86,583 T** |
| `ADD s1,s2,d` | 28 b / 458 T | 28 b / 350 T | 43 b / 299 T |
| one further operand | 147 T | 111 T | 94 T |
| dispatch alone | 54 T | 54 T | 54 T |

**Variant B wins outright**: 22% faster than A for three bytes fewer. Variant C
buys a further 14% for 48 bytes, which is 30% of the core — a trade to revisit
when the core is complete and the byte budget is real, not now.

### What the measurement changed

**The estimates in this document were optimistic by two to three times.** A
register `ADD` was estimated at ~160 T and costs 350 T on variant B. Every
timing claim above written before this section is an estimate of the same
quality, and should be read that way.

**Dispatch is not the bottleneck.** It costs 54 T, close to the 50 T estimated,
but it is only 18% of an `ADD`. The remaining 286 T is operand handling. That
inverts the reasoning borrowed from Lua, where dispatch dominates: on a Z80
with no register file, moving values costs far more than deciding what to do
with them.

Three consequences, each now worth measuring rather than arguing:

- **An operand costs about 111 T.** Removing one from an instruction saves more
  than the entire A-to-B addressing win. A two-address `ADD d, s` and an
  immediate form `ADDI d, s, #n` are therefore the next experiments, ahead of
  any further addressing work.
- **The register machine's margin is narrower than claimed.** Recosting the
  stack machine with counted figures puts `a = b + c` at roughly 610 T against
  350 T. Register still wins, by about 1.7× rather than the 2.8× estimated, and
  the argument from native expansion in the next section is unaffected.
- **The VM budget is low.** Handlers here run 13 to 48 bytes. Ninety opcodes at
  the observed average is nearer 2.2K than the 1.4K in the budget table.

At 4 MHz, 350 T is 87.5 µs, so roughly 11,400 arithmetic operations a second.
That is the speed of the BASIC interpreters this language is meant to sit
beside, and it is the reason the native back end below is part of the design
rather than an enhancement.

### An encoding finding

Operands are encoded **source-first, destination-last**. Destination-first
forces the handler to hold an address across two further operand fetches, and
with `DE` holding the interpreter pointer and `BC` the only pair `ADD HL,rr`
can use, that is a push and a pop per instruction with nothing to spend them
on.

## Native expansion

A three-address instruction already has the shape of an IR, so the native back
end is a template per opcode with slot indices baked in as immediate
displacements:

```
ADD a,b,c   →   LD HL,(fb+2b)     ; 3
                LD DE,(fb+2c)     ; 3
                ADD HL,DE         ; 1
                LD (fb+2a),HL     ; 3
```

Ten bytes against four, an estimated ~40T against ~160T. Routines are marked
individually, so bytecode and native code mix in one program through a thunk.

The same expansion from a **stack** machine emits the push and pop traffic
literally, and removing it needs a stack-to-register pass — a real optimiser.
That is the second reason the register machine wins, and it is the one that
mattered most.

Safety checks live inside the templates, so they survive expansion. `fast`
keeps them; a separate `raw` drops them.

## The language

Fourteen productions.

```
program   := decl*
decl      := 'const' name '=' const
           | 'var' name 'as' type
           | 'sub' name '(' params ')' [ 'as' type ] body 'end'
type      := 'int' | 'str' '[' const ']'
           | 'int' '[' const ']' | 'byte' '[' const ']'
stmt      := assign | call | if | while | for | return | out
if        := 'if' expr 'then' stmt* { 'else' 'if' expr 'then' stmt* } [ 'else' stmt* ] 'end'
while     := 'while' expr stmt* 'end'
for       := 'for' name '=' expr 'until' expr stmt* 'end'
expr      := precedence loop over an operator table
primary   := number | char | string | name | call | name '[' expr ']' | '(' expr ')'
```

There is no type syntax beyond `type`, which is where production counts
usually multiply.

### Worked examples

Hardware and byte arrays. `digits[i]` is bounds-checked at no cost to the call
site.

```
const SEGPORT = 0x02
const DIGPORT = 0x01

var digits as byte[6]

sub scan()
    var i as int
    for i = 0 until 6
        out SEGPORT, digits[i]
        out DIGPORT, 1 << i
        wait(2)
    end
end
```

Strings, with capacity declared and storage in the frame. No heap, so none of
the collection pauses that made Microsoft BASIC's string handling notorious.

```
sub greet()
    var name as str[16]
    var line as str[32]

    name = "TEC-1G"
    line = "Hello, " + name
    print line
end
```

Recursion, which costs zero compiler bytes on a frame stack. Lanternfly's
nucleus v2 spends its longest section removing it — 5,122 bytes of arrays,
Tarjan over the call graph, and save-around stubs.

```
sub gcd(a as int, b as int) as int
    if b = 0 then
        return a
    end
    return gcd(b, a mod b)
end
```

Nested expressions and `else if`. Every line here is illegal in level-0
Lanternfly, and nucleus v2 goes further by normalising to one operator per
statement.

```
sub hexDigit(c as int) as int
    if c >= '0' and c <= '9' then
        return c - '0'
    else if c >= 'a' and c <= 'f' then
        return c - 'a' + 10
    else if c >= 'A' and c <= 'F' then
        return c - 'A' + 10
    end
    return -1
end
```

### What it compiles to

```
sub clear(value as int)
    var i as int
    for i = 0 until 1024
        screen[i] = value
    end
end
```

Slots: `value` = 0, `i` = 1.

```
0000  LDI   s1, #0                4
0004  JMP   000D                  3
0007  STB   screen, s1, s0        5
000C  LOOP  s1, #1024, 0007       6
0012  RET                         1
                                 19 bytes
```

The same loop as native Lanternfly, with its per-site bounds check, is an
estimated 40 to 45 bytes.

## Self-hosting

Not a goal. BASIC was not self-hosted on a TRS-80, and Forth's self-hosting is
a property of Forth's thirty-line compiler rather than of small languages.

The split is: virtual machine and front end in Z80 assembly; library routines —
number formatting, string helpers, display drivers — written in Nucleus once it
runs. Useful, and nothing depends on it.

## Method

Bottom up, from measured assembly upwards. Nucleus v2's method was
design-then-project and produced a number that "cannot separate a six-hundred-byte
saving from a nine-hundred-byte one." The inverse order is used here: write the
interpreter, measure it, and let the result decide the instruction set and then
the language.

Every claim about Z80 bytes or timing in this package is produced by AZM and the
Debug80 runtime, from a test, or is labelled an estimate.

## Open

- Two-address and immediate operand forms, which the first measurement makes
  the most valuable thing to try next.
- Whether variant C's 48 bytes are worth 14%, answerable only against a
  complete core.
- The opcode count, and whether 128 leaves room for the fused compare-branches
  that make compiler-shaped code dense.
- Whether `str` concatenation belongs in the VM or in a library routine.
- Whether the front end is written in Z80 assembly or generated, and if
  generated, by what.
- The name, per the note above.
