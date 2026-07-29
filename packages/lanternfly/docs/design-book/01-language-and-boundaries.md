# A language between intention and substrate

## The problem Lanternfly solves

A Glimmer program already says when code runs. It declares state, triggers,
pulses, timers, curves, cards, resources and display bindings. Yet the body of
a rule still drops into assembly:

```asm
        ld      a,(Count)
        inc     a
        cp      10
        jr      c,_save
        xor     a
_save:
        ld      (Count),a
```

The game idea is smaller:

```lanternfly
Count = Count + 1
IF Count >= 10 THEN Count = 0
```

Lanternfly gives that idea an executable form. It does not replace Glimmer's model
and it does not pretend the machine has disappeared. It occupies the layer
between them.

```text
Glimmer scheduling and resources
             |
        typed body boundary
             |
            Lanternfly
             |
     target lowering and runtime
             |
       AZM / 6502 asm / C / BASIC
```

This position explains most of the design.

Lanternfly must be more readable than assembly because replacing instruction
mnemonics is its purpose. It must be more exact than informal pseudocode
because the result runs on machines with eight-bit values, banked memory and
fixed layouts. It must be independent of Glimmer because the same body
language should work in a standalone program or another host.

## No Glimmer vocabulary

Lanternfly has no keyword for a pulse, effect, render, card, curve, binding or state
change. It sees imported declarations:

```lanternfly
IMPORT Count AS BYTE
IMPORT ShapeDot AS NEAR REF TO Shape
IMPORT ShapeDraw(shape AS REF TO Shape, x AS BYTE, y AS BYTE)
```

Those declarations might have come from Glimmer, a hand-written interface, a C
header model or a platform package. Lanternfly does not distinguish them.

When a Lanternfly body writes `Count`, Glimmer may arrange change tracking around the
body. That is host code. The assignment itself remains an ordinary assignment.
This keeps the language honest: compiling the same body outside Glimmer does
not mysteriously acquire reactive behaviour.

## No substrate vocabulary in ordinary code

Lanternfly source also avoids Z80 registers, 6502 zero page, 8086 segment registers,
C pointer syntax and BASIC line numbers. These belong to backends.

That does not make Lanternfly a high-level general-purpose language. Its abstractions
remain close to static data:

- integers with explicit widths and signedness;
- fixed arrays and exact records;
- references to existing storage;
- direct assignment and calls;
- structured branches and loops;
- visible target services.

The language hides register allocation. It does not hide whether a value is a
byte, whether an array has 64 elements or whether a reference may cross a bank.

## BASIC-like, not BASIC-compatible

Lanternfly borrows the parts of early BASIC that made small programs approachable:

- assignment reads from left to right;
- control uses words;
- zero and nonzero are meaningful conditions;
- `AND`, `OR`, `XOR`, `NOT` and `MOD` are ordinary operators;
- procedures are named;
- declarations can be read aloud.

It rejects some historical BASIC traits:

- no line numbers;
- no implicit floating-point default;
- no undeclared variables;
- no significant single-letter typing suffixes;
- no ambiguous array upper-bound convention;
- no unchecked jump into the middle of a block;
- no target-dependent integer meaning.

The result should feel familiar rather than nostalgic.

## Typed, but not ceremonious

Every stored value has a type. The type determines width, signedness, layout
and legal access. Lanternfly is not interested in elaborate generic programming,
class hierarchies or type-level computation.

A declaration should answer a practical question:

```lanternfly
DIM Score AS WORD
DIM PlayerY AS SBYTE
DIM Board[8] AS BYTE
DIM Monsters[3] AS Monster
DIM CurrentPlane AS NEAR REF TO BYTE[8]
```

How many bytes exist? Which values fit? Is the name storage or a reference?
Can the target reach it directly? Those are useful facts on every backend.

## Static by default

The programs studied for Lanternfly use fixed storage:

- Snake has a 64-byte circular body;
- Tetro has four eight-byte planes and static piece tables;
- Pacmo has a 15-row packed world and three monster records;
- TMS9918 programs use fixed pattern, colour and sprite tables.

No program needs a heap to express its game logic. Lanternfly therefore begins with
static aggregates. It can add scalar call-local storage without adding local
arrays, dynamic allocation or ownership.

This is a positive model, not merely a missing feature. A static memory map is
inspectable, debuggable and suitable for machines where memory capacity and
bank placement are part of the program.

## A small core and explicit libraries

The core defines computation:

- literals and typed expressions;
- assignment;
- field and index access;
- branches and loops;
- routine invocation;
- reference formation and comparison.

The standard library defines useful target-independent operations such as
integer square root, power, fill and copy. A platform library defines key
input, random bytes, framebuffer plots, VRAM writes and sound cues. A backend
runtime supplies hidden helpers for operations the CPU cannot perform directly.

These three categories must not blur:

| Category         | Stable source meaning       | Typical implementation               |
| ---------------- | --------------------------- | ------------------------------------ |
| core operation   | language specification      | instruction or generated sequence    |
| standard service | Lanternfly library contract | inline, helper call or host built-in |
| platform service | target package contract     | ROM call, port routine, C API        |
| runtime helper   | invisible backend mechanism | linked only when needed              |

`ISQRT` is visible because the programmer chose it. A compiler helper used to
multiply an index by 13 is invisible because the programmer chose an array
access.

## Pass-through remains a boundary

Some work should stay native:

- startup and stack setup;
- interrupt handlers;
- cycle-balanced scanout;
- direct device protocols;
- deliberately hand-tuned inner loops;
- operations not yet supported by a backend.

Native code is allowed through an explicit, target-qualified boundary. It does
not introduce hidden words into Lanternfly and it does not weaken the type of every
ordinary expression.

The first Glimmer integration can continue to accept direct AZM bodies beside
Lanternfly bodies. If Lanternfly later becomes the usual surface, native sections remain
the escape hatch.

## What success looks like

Lanternfly succeeds if the game corpus divides cleanly:

1. ordinary rules, state changes, searches, collision tests and rendering
   calculations become Lanternfly;
2. hardware timing and platform entry remain services or native code;
3. generated output stays readable enough to audit;
4. the same Lanternfly algorithm can target another CPU or a hosted language without
   changing its meaning;
5. the language stays small enough that its complete core can be understood.

It does not need to become the name of the whole system. Glimmer may overshadow
it, and an eventual integrated product may simply be called Glimmer. Lanternfly is
still a useful name for the component and for the layer whose rules must remain
clear.
