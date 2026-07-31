# Language and boundaries

## The layer Lanternfly occupies

A Glimmer program already describes scheduling, state, resources and display
work. Until now, the body of a rule has commonly dropped into assembly:

```asm
        ld      a,(Count)
        inc     a
        cp      10
        jr      c,_save
        xor     a
_save:
        ld      (Count),a
```

The corresponding game rule is direct:

```lanternfly
counterValue = counterValue + 1

if counterValue >= 10 then
    counterValue = 0
end
```

Lanternfly gives that rule a precise compiled form. It preserves fixed widths,
exact layouts and visible native cost while removing register allocation,
branch distances and instruction selection from ordinary source.

```text
Glimmer scheduling and resources
             |
       typed body manifest
             |
          Lanternfly
             |
    typed IR and target lowering
             |
       AZM / C / BASIC / another CPU
```

The same language can compile a standalone program. Glimmer is the first host,
not part of Lanternfly's semantics.

## A compiler for small systems

Lanternfly is an ahead-of-time compiler rather than an interpreter. A program
should run in the same broad speed class as compiled C or Pascal, with the
storage and helper costs visible in generated artifacts. The initial compiler
runs on a desktop and emits AZM for Z80 systems. Its architecture also allows
other CPU backends and hosted C or BASIC output.

The longer goal includes native compilers on selected eight-bit machines. That
goal favours a small grammar, fixed storage, simple name resolution and
compiler passes that can be implemented without a large runtime. A native
compiler may support a smaller implementation stage, but it must preserve the
same meaning for every construct it accepts.

## Structured BASIC on a systems foundation

The surface borrows BASIC's readable words:

```lanternfly
var score as u16 = 0

if playerAlive and enemyVisible then
    updateChase()
end
```

Declarations read as `name as Type`. Control uses `if`, `select`, `for`,
`while`, `exit`, `continue` and `return`. Word operators handle Boolean and
bitwise work. Blocks close with one bare `end`.

Lanternfly leaves behind line numbers, implicit declarations, numeric truth,
default floating point, optional call parentheses, `goto`-centred structure
and dialect-specific user-interface statements. The resemblance is
educational rather than compatible.

Pascal contributes a second influence: nominal enums, checked subranges,
ordinal array domains and exact structured data. Lanternfly expresses ranges
with the BASIC words `to` and `until` instead of symbolic punctuation:

```lanternfly
enum Direction as u8
    left
    right
    up
    down
end

range ScreenColumn as u8 = 0 until 32
```

The result remains easy to read aloud while carrying more information than a
collection of unrelated integer constants.

## No Glimmer vocabulary

Lanternfly has no keywords for pulses, effects, renders, cards, bindings,
resources or update scheduling. A host supplies ordinary typed names:

```lanternfly
counterValue = counterValue + 1
drawShape(shapeDot, dotX, dotY)
```

The manifest says which names are mutable storage, constants, aggregates or
routines. Glimmer may run generated update work after the body, but assignment
inside the body remains an ordinary Lanternfly assignment. The same source
outside Glimmer does not acquire reactive behaviour.

## No substrate vocabulary in ordinary source

Registers, flags, 6502 zero page, 8086 segments, C pointers and generated BASIC
line numbers belong to backends. Source instead describes stable facts:

- integers with explicit width and signedness;
- `boolean`, enums and checked subranges;
- fixed arrays with ordinal index domains;
- exact records;
- declared paths and temporary aggregate aliases;
- structured control and typed calls;
- visible native and platform boundaries.

A declaration answers questions that matter on every target:

```lanternfly
var playerY as i8 = -3
var board as u8[1 to 8, 1 to 8]
var monsters as Monster[3]
```

The compiler knows the value domain, byte count, field offsets and legal
indices. A backend remains free to choose registers, frame slots or helper
calls.

## Storage identity without pointers

Lanternfly deliberately has no source-level pointer or reference values,
address-of or dereference operations, pointer arithmetic, function values or
closures. Persistent identity uses declared paths and ordinal selectors:

```lanternfly
monsters[selectedMonster].timer
board[row, column]
```

An aggregate parameter or local `alias` temporarily names existing array or
record storage. A backend may carry an address internally, but the source
cannot store, return, compare, convert or rebind that carrier.

This is a language boundary, not a temporary omission. Fixed pools, selectors
and multidimensional arrays express the current pointer-table algorithms
without introducing a second, unsafe value model.

Opaque `near address` and `far address` values remain available at native
interfaces. They do not point into ordinary Lanternfly storage and support no
source dereference or arithmetic.

## Static by default

The motivating programs use fixed memory:

- Snake has a 64-byte circular body;
- Tetro has fixed planes and piece tables;
- Pacmo has packed world rows and three exact monster records;
- TMS9918 programs use fixed pattern, colour and sprite tables.

Module arrays and records therefore own static storage. Scalar locals may use
automatic storage. Aggregate locals are aliases to existing objects rather
than frame allocations. The first edition has no heap, garbage collector,
resizable collection or unbounded object graph.

Static allocation makes the memory map inspectable. It also lets a compiler
reject an object that cannot fit its target region before the program runs.

## Core, libraries and native work

Language operations, platform services and backend helpers occupy separate
interfaces. Source does not import an internal division helper, and display
operations do not become language keywords. Chapter 5 develops these
boundaries and the artifacts that expose their cost.

Target assembly stays available through `asm`/`end` for startup, interrupts,
exact device protocols and deliberately tuned inner loops. An assembly block
is target-specific and carries conservative effects; it does not weaken type
checking elsewhere.

## The measure of success

Lanternfly is doing its job when ordinary state changes, searches, collision
tests and rendering calculations move out of assembly; hardware timing and
device protocols remain explicit services or assembly; generated output can
still be audited; and the same algorithm keeps its meaning across backends.

The complete language should remain small enough to understand. Its power
comes from exact types, regular storage and compilation, not from accumulating
every facility found in later desktop languages.
