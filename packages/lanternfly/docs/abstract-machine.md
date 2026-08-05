# The abstract machine

What Candlemoth compiles for, and what it runs on. One model, stated without
reference to any particular hardware, lets work on the compiler finish before
a target is chosen. A later target choice then changes a build parameter
rather than the compiler.

This replaces the ad-hoc arrangement the bootstrap harness grew: five I/O
ports, a hard-wired origin, and a code budget taken from the size of a
particular ROM window.

## The machine

**Flat 64K, sixteen-bit pointers, no exceptions.** Every address the compiler
computes is a `u16`. There are no far pointers, no segment register, and no
bank number anywhere in the language or in anything the compiler emits. This
is the constraint everything else is arranged around, because a pointer that
sometimes needs a bank is a different language.

**A program is a contiguous image loaded at an origin.** The origin is a build
parameter. Nothing in the language, the lowering table or the runtime names an
absolute address; the toolchain supplies one and the compiler emits code for
it. Two targets with different origins get two builds, not two compilers.

**Everything outside the program is one service call.** A fixed entry, a
function number, arguments in registers. The program never performs I/O
directly, never touches a port, and carries no description of what is on the
other side.

**Banking is storage, not addressing.** A bank is how a host keeps code that
is not currently addressable. It is the host's business and appears nowhere in
a compiled program. A service that lives in another bank is reached by calling
its number; whatever the host does to make that work happens behind the
service entry.

## The compiler is a program, not a resident

The single decision that matters most here, and the one that removes the space
problem.

The compiler is a file. It is loaded from bulk storage into ordinary memory
and it runs there, the way a CP/M compiler is a `.COM` file in the TPA rather
than something burned into a ROM. Its budget is the free memory of whatever
loads it, not the size of any particular window.

Treating it as a ROM resident was the source of the sixteen-kilobyte wall, and
the wall was self-inflicted: a compiler that has to fit an expansion window
competes with the window, while a compiler that is loaded competes with
nothing except the program it is compiling — which is not resident either,
because the object code streams out to storage as it is produced.

So the working figure for the compiler is **most of 64K**, less whatever the
host keeps resident. The tables measured so far, 18,736 bytes, are
comfortable rather than marginal. The measurements stay; the gate goes.

## Services

The compiler's entire host interface is five calls. That number is a design
constraint rather than an observation: a target is worth having only if it is
cheap to write, and five entry points is cheap.

| Number | Service | In | Out |
| --- | --- | --- | --- |
| 0 | read source byte | — | A, or the end marker |
| 1 | write object byte | A | — |
| 2 | write diagnostic byte | A | — |
| 3 | set exit status | A | — |
| 4 | rewind source | none | none |

The compiler reads *the source* and writes *the object*. It does not open
files, name them or close them. Binding those streams to files is the host's
business, which is what keeps the interface at five and the compiler ignorant
of any filesystem.

`rewind source` exists because the compiler makes three passes over its input.
A host backed by a file seeks; a host backed by a pipe buffers; neither is the
compiler's concern.

### Calling convention

Function number in `A`, one argument byte in `A` for the services that take
one — so a service that takes an argument is two instructions, and one that
does not is one. Result in `A`.

**A service preserves every register except `A` and the flags.** That is the
assumption the compiler is built on, and it is the right default: a host that
cannot preserve a register publishes which one, and the compiler saves around
that service alone. Assuming preservation and correcting for a published
exception costs a few bytes at a few sites; assuming the opposite costs a save
and restore at every call, and the calls are everywhere.

The scale is easy to miss. `writeCodeByte` is called from inside the emitter,
once per byte of output, with `HL` holding the accumulator and `DE` an
operand. A blanket save and restore there would be four instructions around
every byte the compiler produces.

## Profiles

A profile is the whole of what a target contributes. Three fields today.

| Field | Meaning |
| --- | --- |
| `origin` | Where the image begins |
| `ownsResetVector` | Whether the compiler emits the jump at address zero |
| `services` | How a service call lowers |

Two lowerings, and they differ by one emitted sequence:

- **`ports`** — the bootstrap machine. Each service is an `IN` or `OUT` on its
  own port. Two bytes, no resident code, nothing to install. This is what the
  harness already implements and what the fixpoint runs on.
- **`vector`** — a hosted machine. `LD A,n` then `CALL entry`, or `RST n` where
  the host offers one. Five bytes, and the host supplies the entry.

Nothing else in the lowering table changes between them. The five intrinsics
were already the abstraction; what was missing is that their lowering was
fixed rather than chosen.

### Profiles as written

| Profile | Origin | Reset vector | Services |
| --- | --- | --- | --- |
| `flat` | `$0100` | the compiler's | ports |
| `hosted` | supplied by the loader | the host's | vector |

`flat` is the bootstrap machine: a generic Z80 with the standard `IN` and
`OUT` and nothing resident. Page zero is reserved whole — the reset jump at
`$0000`, the restarts from `$0008` to `$0038`, the NMI entry at `$0066` — and
code starts at `$0100`, where CP/M starts it and for the same reason.

`hosted` is everything else. A monitor owns page zero and the vectors, the
loader places the image, and services are reached through the entry the host
publishes.

## Open host decisions

**Which host.** A TEC-1 with MON3 and a service registry, a CP/M machine, or
something else, all satisfy the model. The one thing the model asks of a host
is five services behind one entry.

**How a host that banks arranges itself.** A registry mapping service numbers
to bank and address, with the entry selecting the bank and restoring it, is
one way and is the shape TECM8 already uses. Whether the compiler's own code
ever spans banks is a packaging question that only arises if it exceeds the
memory it is loaded into, and on this model it does not.

**Whether the runtime routines move.** They are not position-independent —
the Z80's only `CALL` is absolute — so an image built for a different origin
is generated again rather than relocated. That is a build step, not a design
question.

## Consequences of the model

Unchanged: the language, the lowering table's every sequence, the fourteen
runtime routines, the three-pass architecture, the port-based harness, and
every test.

Changed: the compiler is a loaded program rather than a ROM resident, so its
size is measured and reported rather than gated; the origin is a profile field
rather than a constant; and a service call is a named operation with two
lowerings rather than a port.
