# AZM algorithms and native game evidence

This dossier asks a narrower question than the general AZM/ZAX comparison:
what storage and routine facilities does Lanternfly need when small algorithms are
written above the assembler, and which of those facilities appear in complete
games?

The study used:

- AZM Books 1–3 and every Book 3 example at Debug80 documentation commit
  `524bf2226bd4a4674273680d992781894ae68a3b`;
- the shared, TETRO and PACMO guides and production source at TETRO commit
  `53ef6e0648a7a95a2a038a0f6f40ab94d8831a41`.

Books 1 and 2 establish the assembler and machine model. Book 3 is the main
algorithm source. The TETRO and PACMO pass checks whether an attractive
algorithm feature is also useful in game code. The
[reading ledger](reading-ledger.md) records the completed files and line
counts.

## What AZM already solves

AZM has a strong static layout system:

- packed arrays, records and unions;
- nested field and constant-index paths;
- exact sizes and offsets;
- named aliases;
- modules and explicit imports;
- register contracts for routines;
- source listings, diagnostics and maps.

These are assembler-time facilities. A layout path such as a record field can
be reduced to a constant offset, but a runtime array index still requires Z80
code to calculate an address. AZM also leaves arithmetic temporaries, loop
state, result flags and calling conventions visible in registers or global
scratch storage.

Lanternfly should preserve AZM's exact layouts while moving runtime address
calculation and value preservation into the compiler.

Book 2 supplies the recurring machine patterns:

- bounded and sentinel-terminated table walks;
- counted and conditional loops;
- forward and backward copies;
- signed and unsigned comparisons over the same bits;
- register calls and stack frames;
- ports as a separate machine address space.

It also shows why source semantics cannot be copied from Z80 instructions.
`DJNZ` with an initial count of zero executes 256 iterations. A Lanternfly loop over
an empty region must execute zero times regardless of the instruction selected
by a backend.

## Book 3 algorithm inventory

| Chapter and example  | Principal storage                        | Addressing pressure                            | Routine pressure                                 |
| -------------------- | ---------------------------------------- | ---------------------------------------------- | ------------------------------------------------ |
| GCD and power        | scalar integers                          | none beyond scalar values                      | reusable functions, multiplication and remainder |
| insertion sort       | byte array and scalar workspace          | dynamic element indexing over a bounded region | array argument, length, scalar locals            |
| string routines      | framed byte sequences                    | sequential read, bounded destination write     | length and capacity contracts                    |
| bit flags            | one scalar mask and named bit values     | shifts and masks                               | small pure helpers                               |
| ring buffer          | exact state record plus fixed byte array | field access, wrapped dynamic indexing         | success plus output byte                         |
| factorial            | scalar call frames                       | stack addressing                               | recursion and a provable depth bound             |
| include library      | exported routines and static text        | shared data references                         | namespaces and interface contracts               |
| linked list and tree | statically allocated nodes and links     | nullable/self references                       | traversal and link mutation                      |
| eight queens         | nested fixed arrays and records          | repeated indexed tests and updates             | backtracking, recursion and bulk clear           |

The examples do not point toward one large runtime. They identify a small
number of language facilities whose costs must remain visible.

## Bounded regions are the missing aggregate argument

A reference to `BYTE[64]` preserves the exact shape of one array. That is
valuable for game state, but it does not express a sorting or scanning routine
that accepts existing arrays of several lengths.

The algorithms repeatedly need a bounded region:

```text
base reference + element count
```

For writable destinations they may also need:

```text
base reference + current length + capacity
```

This is not a request for dynamic arrays. The storage remains statically
allocated and the region borrows part or all of it. No ownership, allocation,
growth or garbage collection follows from the facility.

An initial implementation can lower a view to an ordinary reference and count
pair. A later source spelling could make the pair one checked type. The choice
affects:

- whether `COUNT(view)` is runtime or compile-time;
- whether a subview can be formed without pointer arithmetic;
- whether read-only and writable views are distinct;
- whether a view may cross a bank boundary;
- whether bounds checks belong to the type or the build profile.

The evidence establishes the need for a bounded aggregate parameter before it
settles that surface design. Exact array references remain preferable whenever
the callee requires one exact shape.

## Static strings are framed byte regions

Book 3 covers NUL-terminated, length-prefixed and high-bit-terminated strings.
The native games use NUL-terminated LCD text and sentinel-terminated LCD
command scripts. None requires a heap string, concatenation object or
automatic resizing.

The useful first boundary is therefore:

- static encoded bytes;
- an explicit framing convention;
- a bounded source or destination where overrun matters;
- library operations such as length, compare and bounded copy;
- platform services that accept one documented framing.

Lanternfly need not make every byte array a string. A framing type or interface
contract can distinguish text from arbitrary binary data without changing its
packed representation. Capacity should be explicit for writable text. A
terminator alone cannot prove that a destination is large enough.

The LCD scripts add another useful pattern: a fixed record containing a row
selector and a text reference, stored in a sentinel-terminated table. In Lanternfly
this should be an exact record table, not manually interleaved `.db` and `.dw`
data.

## Named scalar sets improve state without changing representation

Book 3 names bit positions and derives masks from them. PACMO assigns small
integers to directions and monster states. TETRO uses small selector values for
piece, rotation, phase and colour.

Constants can express all of these programs. A nominal enum-like scalar type
would additionally:

- reject a direction where a colour is expected;
- let diagnostics print a state name;
- retain an explicitly selected byte or word representation;
- allow exhaustive `SELECT CASE` checks;
- produce the same packed layout as the underlying integer.

This is a safety and readability feature, not a prerequisite for addressing.
It should not delay arrays, records or references. The design still needs to
decide whether arbitrary numeric values may be converted to such a type and
whether flag sets are a separate declaration or ordinary masks.

## Results should not inherit processor flags

The ring buffer pop operation naturally has two results: whether an item was
available and, if so, the item. Native PACMO has the same shape in search and
collision helpers, where carry or zero reports success while registers contain
data.

Lanternfly does not need tuple returns to express this. One possible surface is:

```lanternfly
FUNCTION TryPop(ring AS REF TO Ring, OUT value AS BYTE) AS INTEGER
    IF ring.count = 0 THEN
        RETURN 0
    END IF

    value = ring.items[ring.readIndex]
    ring.readIndex = (ring.readIndex + 1) MOD COUNT(ring.items)
    ring.count = ring.count - 1
    RETURN -1
END FUNCTION
```

`OUT` is illustrative, not accepted grammar. The current type model can carry
a `REF TO BYTE`, but ordinary assignment to a reference variable rebinds the
reference. It does not yet say how a routine writes the referenced scalar.
Lanternfly therefore needs one explicit rule:

- output and in/out parameters behave as aliases;
- an explicit dereference operation writes through a scalar reference; or
- dedicated `OUT` and `INOUT` parameter modes provide the aliasing contract.

The first and third choices read more like BASIC or Pascal than a general
pointer operation. Read-only aggregate reference contracts belong to the same
decision.

Explicit source results also remove incidental assembly results. Several
native routines leave formatter state in registers or carry set after a
display path. Those residues should not become Lanternfly return values.

## Static links do not imply a heap

Book 3 builds a linked list and binary search tree from named, preallocated
nodes. The examples prove a useful distinction:

- dynamic connectivity does not require dynamic allocation;
- a null link and a self-referential record type are enough to describe many
  bounded pointer structures;
- ownership can remain entirely static.

This makes nullable typed references a plausible later Lanternfly facility even
while the language remains heap-free. It does not make linked structures a
first-edition priority. The games prefer arrays, record arrays, indexes and
sentinels. Those representations are denser, easier to bound and friendlier to
banked memory.

If nullable references are added, the language will need:

- an explicit `NONE` or null value;
- narrowing from maybe-reference to proven non-null reference;
- equality and branch rules;
- self-reference through links but not by-value recursion;
- address-class preservation for near and far links;
- diagnostics for unproved dereference.

General pointer arithmetic is still unnecessary.

## Recursion is a target-profile and cost question

Factorial and eight queens show that recursion can make an algorithm direct.
They do not show that every Z80 game profile can afford it. The correct split
is:

- the language model may describe recursive calls;
- an initial bare-metal profile may reject call cycles;
- a profile that accepts recursion must state its stack convention;
- build output should report frame size and a maximum stack bound when one can
  be proved;
- an unbounded recursive path should be diagnosed as unbounded rather than
  given a reassuring estimate.

Eight queens has a small, data-derived depth bound. A compiler can expose that
fact without requiring a tracing garbage collector or heap.

## Production TETRO cross-check

TETRO uses exact static storage throughout:

- four parallel eight-byte board planes;
- four-byte piece rotations selected through pointer tables;
- fixed piece metadata tables;
- a transaction-like set of pending movement and rotation values;
- a fixed framebuffer and back buffer;
- word score tables;
- sentinel-terminated LCD command scripts.

The negative entry row stored as `$FD` confirms the need for `SBYTE`.
Collision, rendering and board merge all consume the same four-row shifted
piece representation. A Lanternfly translation should share one typed piece view
rather than expose the separate register conventions used by each assembly
routine.

Several parallel tables describe one piece: rotation pointers, right bounds
and colours. An array of exact metadata records would preserve locality and
prevent mismatched indexes. Parallel planes remain reasonable because the
scan hardware consumes plane-shaped arrays directly. Lanternfly needs both
array-of-record and record-of-array layouts; it should not prescribe one
universal representation.

The scan loop, keypad ports, speaker timing, LCD transactions and fixed display
dwell are native platform services. The piece and board algorithms above them
are ordinary Lanternfly candidates.

## Production PACMO cross-check

PACMO uses:

- a 15 by 15 world encoded as fifteen packed 16-bit rows;
- an equally shaped visited bitmap;
- an exact six-byte `Monster` record repeated three times;
- fixed power-pill and spawn coordinate tables;
- sentinel termination;
- world-to-viewport coordinate transforms;
- state, direction and timer scalars;
- reference-like selection of the current monster record;
- Manhattan-distance candidate selection.

The six-byte monster stride is direct production evidence against
power-of-two padding. The compiler must multiply an index by the exact record
size.

The assembly declares `Monster0`, `Monster1` and `Monster2`, then creates field
aliases for each. Lanternfly should express the same storage as:

```lanternfly
TYPE Monster
    x AS BYTE
    y AS BYTE
    direction AS BYTE
    moveTimer AS BYTE
    respawnTimer AS BYTE
    state AS BYTE
END TYPE

DIM Monsters[3] AS Monster
```

A local reference or alias selects `Monsters[index]`. This removes eighteen
manual field aliases while keeping the same eighteen-byte layout.

World rows reveal a second kind of structured access. The logical object is a
15-column bit row, but the stored object is two bytes whose bit order matches
the rendering and collision code. Lanternfly's ordinary masks and shifts can express
the current representation. A packed-bit-array feature is not required for
the first translation. Such a feature should be considered only if it improves
source clarity without hiding layout or turning every access into an
unexpected helper call.

## What is logical state and what is assembly scaffolding

The source study separates four categories.

### Lanternfly storage

- scores, lives, positions, directions and timers;
- board, world and visited arrays;
- exact framebuffer and monster records;
- piece, point, spawn and command tables;
- references or aliases selecting existing objects.

### Compiler temporaries

- address calculations;
- preserved operands across calls;
- loop cursors that have no game meaning;
- shifted copies used only to test or render one row;
- intermediate products and masks.

### Standard or runtime operations

- multiplication and division when the processor lacks them;
- integer power and square root;
- bounded fill, copy and comparison;
- numeric formatting;
- bounded text length and copy.

### Platform services

- port I/O and keypad scanning;
- fixed-dwell matrix refresh;
- speaker timing;
- LCD commands;
- bank switching and far-call mechanics.

The categories matter because assembly often stores a compiler temporary in
global RAM. Reproducing every such byte as a Lanternfly global would preserve the
implementation rather than the program.

## Consequences for Lanternfly

The new evidence reinforces facilities already chosen:

- exact zero-based arrays and packed records;
- runtime indexing by non-power-of-two strides;
- arrays of records and references;
- local scalar and reference values;
- aggregate aliases;
- `BYTE`, `SBYTE`, `INTEGER` and `WORD`;
- masks, shifts, comparisons and structured loops;
- near/far and device address distinctions;
- no initial heap.

It adds four concrete design pressures:

1. reusable aggregate algorithms need bounded views or an equally explicit
   reference-and-count convention;
2. scalar output and in/out parameters need a clear alias or dereference
   contract;
3. small nominal scalar sets deserve an enum design experiment;
4. recursion-capable profiles need stack-cost and depth reporting.

It narrows two deferred areas:

- the initial text facility should be framed static bytes with bounded library
  operations, not a rich dynamic string;
- nullable self-references can be heap-free, but arrays and indexes remain the
  preferred first representation.

## Recommended staging

K0 and K1 should keep exact fixed arrays and records as their centre. No new
view syntax is needed to translate the current hosted bodies or the central
TETRO/PACMO state.

K2 should test three representative routines:

- insertion sort over a bounded byte view;
- ring pop with a Boolean result and scalar output reference;
- PACMO spawn selection over a fixed or sentinel point view.

Those translations will settle view spelling, mutability contracts and result
conventions with real lowering code.

An enum experiment can proceed independently because it does not change
layout. Nullable links and recursion should remain profile-gated work after
the non-recursive game engine is translated.

The central storage judgement is unchanged: Lanternfly needs more power in how it
addresses fixed memory, not a more elaborate allocation model.
