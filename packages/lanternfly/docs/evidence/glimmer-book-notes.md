# Glimmer book evidence notes

These notes record language evidence while the Glimmer books are read in
published order. They are observations for the Lanternfly design, not reviews of the
book prose.

## Book 1

### Chapter 1: The Shape of a Game

The first complete Mover programs establish the boundary Lanternfly must preserve.
Glimmer declares state, pulses, input bindings, scheduling, and update
delivery. The bodies contain ordinary imperative work, and Glimmer adds the
change-bit update after the body returns.

The two movement effects reduce to a small Lanternfly core:

```text
IF DotX > 0 THEN
    DotX = DotX - 1
END IF

IF DotX < 7 THEN
    DotX = DotX + 1
END IF
```

The current assembly expresses the boundary tests through flags and jumps.
Lanternfly needs unsigned byte comparison, assignment, subtraction and addition, but
it does not need Z80 flags or labels for these bodies.

`DrawDot` introduces a different requirement. It clears a framebuffer, reads a
state value, supplies an x coordinate, y coordinate and colour, then calls a
platform routine. The current routine receives its arguments in Z80 registers:

```asm
ld a,(DotX)
ld b,a
ld c,3
ld a,COLOR_WHITE
call FbPlot
```

A Lanternfly translation wants a typed service call resembling
`FbPlot(DotX, 3, COLOR_WHITE)`. This is evidence that readable service calls
matter early even if user-defined formal arguments and local variables remain
later language work. A backend or imported interface can own the initial
calling convention.

The held-key example shows code that belongs to Glimmer rather than Lanternfly. Its
counter, edge handling and repeat timing implement the `bind` declaration.
Replacing the assembly bodies with Lanternfly should leave that generated machinery
outside the body language.

Labels beginning with an underscore are local to an assembly body, and Glimmer
supplies the return. Structured Lanternfly conditions can remove the labels from
ordinary bodies. Native pass-through still needs a target-local label rule.

The generated excerpts supply three useful implementation constraints:

- Glimmer state and pulses are ordinary labelled storage that a Lanternfly interface
  can import.
- The frame loop and dispatcher surround the body and therefore remain
  independent of its language.
- `updates DotX` lowers after the body, so a Lanternfly assignment must not acquire
  hidden Glimmer change-tracking semantics.

### Chapter 2: First Light

Beacon's `NextColour` body adds a bounded wrap:

```asm
ld a,(Colour)
inc a
cp 8
jr c,_store
ld a,1
_store:
ld (Colour),a
```

The direct Lanternfly form is an increment followed by a range check and replacement.
It should not require a programmer to materialise flags or a branch label.
This is also a useful test for type-aware comparison: `Colour` is an unsigned
byte, so the comparison with eight is unsigned.

The body could be written with remainder only after accounting for its
one-based range. The clearest translation remains the condition:

```text
Colour = Colour + 1
IF Colour >= 8 THEN
    Colour = 1
END IF
```

This example raises the overflow question. Incrementing values seven and below
cannot overflow, but a general byte increment can. Lanternfly must define the width
and overflow of the addition independently of the wider arithmetic used by a C
or BASIC substrate.

The generated dispatcher uses `AND` to test dependency masks. It confirms that
binary masks are fundamental to the complete program even when a particular
game body contains only comparisons. Glimmer owns this dispatcher, but the
same operation appears in game flags elsewhere in the corpus.

The build pipeline adds a source-mapping requirement:

```text
Lanternfly body
    -> generated substrate body
    -> assembled or compiled program
    -> Debug80 map back to the Lanternfly line
```

When Glimmer hosts the body, the mapping has another owner above it. Lanternfly needs
to preserve body-level attribution so Glimmer can compose that mapping with its
own generated wrapper. The readable generated file remains a debugging and
cost-inspection interface.

Beacon again calls `FbClear` and `FbPlot`. Platform services appear in the
generated substrate library and carry register contracts today. An imported
Lanternfly service declaration can provide the equivalent typed boundary while the
backend retains the register-level contract.

### Chapter 3: State

The expanded Beacon adds the first 16-bit game value:

```asm
ld hl,(Score)
inc hl
ld (Score),hl
```

`Score` is a Glimmer `word`, used here as an unsigned count and passed to
`HudWriteU16`. This supports the provisional Lanternfly distinction between a signed
16-bit `INTEGER` for ordinary arithmetic and an unsigned 16-bit `WORD` for the
full counting range. A direct translation is `Score = Score + 1`, with the
resolved storage type determining width and overflow.

The example does not say what happens after 65,535. Lanternfly must supply that rule
because assembly naturally wraps, C depends on signedness, and a BASIC
substrate may report overflow. The corpus needs to show whether game code
relies on wrapping or prevents the boundary itself.

`NextColour` updates a byte and a word in one body. Lanternfly therefore needs
independent typed assignments inside the same block; a block-wide accumulator
or single-width expression mode would be too restrictive.

`DrawBeacon` reads both `DotX` and `Colour`, and `ShowScore` passes a word to a
display routine. Their likely Lanternfly forms are:

```text
FbPlot(DotX, 3, Colour)
HudWriteU16(Score)
```

These calls reinforce the need for imported typed service signatures. They do
not establish a need for user-defined local variables.

The generated change masks span multiple facts and eventually multiple bytes.
That is Glimmer implementation evidence for mask operations, while the body
language remains concerned only with the declared storage values. A Lanternfly body
must observe live values, regardless of which Glimmer change bit scheduled it.

### Chapter 4: Pulses and Bindings

Rover repeats the bounded movement rule on two axes and adds a reset body:

```asm
ld a,3
ld (DotX),a
ld (DotY),a
```

The corresponding Lanternfly assignments are independent constant stores. A body can
update several imported state cells without grouping them into an aggregate or
transaction.

The draw path now passes two runtime coordinates:

```text
FbPlot(DotX, DotY, COLOR_WHITE)
```

This is a service-call argument requirement, distinct from multidimensional
memory indexing. Lanternfly must support several scalar inputs to an imported service
even if its first user-defined routine syntax remains minimal.

The complete generated polling routine belongs to Glimmer's binding
implementation. It uses processor flags, an armed-key sentinel, a countdown
and early returns. None of those mechanics should leak into Lanternfly simply because
the enclosing Glimmer program uses Lanternfly bodies.

Coordinates are again unsigned bytes bounded to zero through seven. The book's
first four chapters therefore provide strong evidence for compact unsigned
storage even if signed `INTEGER` becomes Lanternfly's ordinary expression type.

### Chapter 5: Compute, Effect, Render

Meter adds division by a constant:

```asm
ld a,(Count)
srl a
srl a
srl a
ld (BarLen),a
```

The Lanternfly body should say `BarLen = Count / 8` or possibly
`BarLen = Count SHR 3`. Division states the game rule; the backend can select
the three shifts because `Count` is unsigned and the divisor is eight. Keeping
both `/` and `SHR` lets source distinguish arithmetic intent from deliberate
bit manipulation.

`ShowCount` zero-extends a byte into a word before calling `HudWriteU16`:

```asm
ld a,(Count)
ld l,a
ld h,0
call HudWriteU16
```

This is direct evidence for safe widening from `BYTE` to `WORD` or another
unsigned type at an imported call boundary. The programmer should not have to
spell the register transfer.

`DrawBar` is the first body that needs an elementary loop and temporary scalar
state. It clears the framebuffer, skips an empty bar, then counts through
`BarLen` pixels while passing a different x coordinate to `FbPlot`. Assembly
uses `B` both as a countdown and a derived coordinate, with `PUSH` and `POP`
around the call.

A Lanternfly loop could express the whole operation without exposing either the
register or its preservation:

```text
FbClear()
FOR x = 0 TO BarLen - 1
    FbPlot(x, 3, COLOR_GREEN)
NEXT x
```

This creates pressure for a compiler-owned loop variable before a general
local-variable facility. The design should distinguish a scoped induction
variable introduced by `FOR` from arbitrary local declarations. If the first
language omits `FOR`, an explicit counter local becomes necessary much sooner.

Meter's phase propagation remains wholly Glimmer-specific. Lanternfly bodies read
live storage, while Glimmer schedules their wrappers and update delivery. The
warning about same-phase bodies reading each other's writes reinforces the
absence of transactional or snapshot semantics in Lanternfly assignment.

### Chapter 6: The 8x8 Matrix Profile

Compass introduces a threshold ladder that derives three values from one
position around a 28-cell rim. The assembly uses comparisons and jumps to four
range-specific arms, then shares a final colour store. This maps naturally to
`IF`, `ELSE IF`, and `ELSE`, or to a range-capable `SELECT CASE`.

The four arms contain ordinary unsigned calculations:

```text
0..6:   x = Position,      y = 0
7..13:  x = 7,             y = Position - 7
14..20: x = 21 - Position, y = 7
21..27: x = 0,             y = 28 - Position
```

All operands fit in a byte because the preceding range selection proves the
subtractions safe. Lanternfly can preserve byte results here, but the general
promotion rule still needs to say whether `28 - Position` is evaluated as a
byte, an `INTEGER`, or a context-sized expression before assignment.

The framebuffer provides direct evidence for explicit layout padding. Three
colour-plane bytes carry the natural data, while a fourth auxiliary byte makes
the row stride four so `y * 4` lowers to two shifts. This is a deliberate
profile layout:

```text
row = red, green, blue, auxiliary
```

It supports exact semantic record layout as Lanternfly's default and an explicit
field or padding declaration when a programmer or platform chooses a favourable
stride. The language should not round every three-byte record invisibly.

Colour values are genuine masks. Red, green and blue occupy three bits;
yellow, cyan, magenta and white combine them. `FbPlot` tests and ORs those bits
into separate planes. `AND`, `OR`, shifts and rotations therefore serve data
modelling as well as conditions.

The profile library also illustrates the boundary between ordinary Lanternfly and
target services. Its scanner performs port I/O, timing loops, register
preservation and hardware sequencing. Game bodies should call this code through
a typed interface. A future system-library dialect of Lanternfly may express parts of
it, while native substrate code remains appropriate for exact port and timing
work.

`FbPlot` calculates `Framebuffer + y * 4`, and `MxMask` converts x into a
descending bit mask. These routines are useful later lowering case studies:
they exercise fixed stride multiplication, pointer traversal, shifts, loops,
and a checked register-level service boundary.

### Chapter 7: Time

`FrameCount` provides the book's first explicit dependence on byte wraparound:
it climbs through 255 and returns to zero. Although Glimmer generates that
increment, a Lanternfly program reading or implementing a similar counter needs
portable wrapping semantics. This is concrete support for defined fixed-width
overflow rather than leaving behaviour to C, BASIC, or a processor flag.

The blink body is the clearest example of unified binary and logical data:

```asm
ld a,(Visible)
xor 1
ld (Visible),a
```

`Visible` stores canonical zero or one, and XOR toggles it. A Lanternfly expression
`Visible = Visible XOR 1` preserves the BASIC-like operator model. An eventual
stored Boolean type could offer `Visible = NOT Visible`, but the existing
program uses an ordinary byte and depends on its bit representation.

`DrawDrop` treats any zero `Visible` as false and skips plotting. The natural
Lanternfly condition is `IF Visible THEN`, which supports numeric truth in conditions.
The design still needs to document that `NOT` is complement when applied to an
ordinary integer.

The one-shot timer uses a `word` countdown of 384 because a byte ends at 255.
This is another unsigned 16-bit use rather than evidence for a signed default.
Timers remain Glimmer declarations, but Lanternfly bodies must be able to assign
integer literals to imported `WORD` storage with a range check.

`Quicken` combines a lower bound, unsigned subtraction, and two independent
stores:

```text
IF Fall >= 8 THEN
    Fall = Fall - 4
END IF
Heat = 0
```

The current rule intentionally allows the period sequence to reach four before
holding there. This is a useful warning against replacing explicit conditions
with an assumed `MAX` formulation without checking the original boundary.

Timers, ramps and `FrameCount` are generated before Lanternfly bodies run. Their
substantial countdown and delivery code strengthens the language boundary:
Lanternfly needs to express the small rules that alter periods, progress and visible
state, while Glimmer retains scheduling and tick mechanics.

### Chapter 8: Motion Curves

The comet example supplies the first direct case for indexed data access. A
Glimmer curve becomes a static byte table, and the body uses `Travel` as its
runtime index:

```asm
ld a,(Travel)
ld e,a
ld d,0
ld hl,Curve_Glide
add hl,de
ld a,(hl)
ld (CometX),a
```

The corresponding Lanternfly operation should be no more elaborate than:

```text
CometX = Glide[Travel]
```

This is the minimum useful array model: a statically allocated base, a known
element type, a known length, a runtime scalar index, and a stride of one. No
heap, iterator object, or general pointer arithmetic is required.

The curve length and ramp step count are connected by construction. That gives
the compiler useful shape information even when the generated assembly omits a
runtime bounds check. Lanternfly must eventually choose whether accesses are checked,
unchecked, or selected by build profile. It should preserve the declared bound
in its type and debug information either way.

The chapter's page-aligned version separates semantic layout from performance
layout. Aligning each table to 256 bytes lets the Z80 replace addition with a
single low-byte load:

```asm
ld hl,Curve_Glide
ld a,(Travel)
ld l,a
```

This is evidence for explicit alignment and placement controls on static
resources. It is not evidence for silently padding every array or record.
Alignment is a backend-visible promise that makes a particular lowering valid.

The runtime-selectable version chooses one of three curve bases from `Preset`
and then performs the same indexed load. A first Lanternfly spelling could repeat the
access in a `SELECT CASE`:

```text
SELECT CASE Preset
CASE 0
    CometX = Straight[Travel]
CASE 1
    CometX = Glide[Travel]
CASE ELSE
    CometX = Spring[Travel]
END SELECT
```

A more capable spelling would select an alias or reference and index it once:

```text
curve = Glide
IF Preset = 0 THEN curve = Straight
IF Preset = 2 THEN curve = Spring
CometX = curve[Travel]
```

That second form is important design evidence for a local collection name that
aliases statically allocated global data. The local value is only a reference
and associated shape; it does not allocate or copy an array. This matches the
useful ZAX restriction that aggregate locals are aliases rather than local
aggregate storage.

`NextPreset` is another bounded wrap, this time over the range zero to two.
`ShowPreset` adds one to a byte and widens the result for `HudWriteU16`. Both
fit the arithmetic and service-call model already established.

The sophisticated mathematics in this chapter—powers, square roots, damping,
overshoot and anticipation—runs while Glimmer builds the curve tables. The
runtime body only looks up bytes. Lanternfly may still need power and square-root
services for programs that perform those calculations at runtime, but this
example does not justify making floating-point curve generation part of the
core language. It instead demonstrates the value of static generated resources
that Lanternfly can consume through an ordinary typed array interface.

### Chapter 9: Shapes, Sound and Displays on the Board

Fanfare exposes a numeric problem hidden by earlier examples. `VelX` and `VelY`
are declared as bytes, but each stores either one or `$FF`; `$FF` is interpreted
as negative one when added to a coordinate and negated on a bounce. The storage
is an unsigned byte while the algorithm gives one value a signed meaning.
Lanternfly should make that meaning visible. Plausible approaches include an explicit
signed-byte type, a signed `INTEGER` velocity narrowed at the coordinate
assignment, or a direction enumeration lowered to one byte. Simply calling
every eight-bit value `BYTE` leaves an important arithmetic interpretation
implicit.

The movement body itself is ordinary structured logic:

```text
SparkX = SparkX + VelX
IF SparkX = 0 OR SparkX = 6 THEN
    VelX = -VelX
    Score = Score + 1
    Snd_Bounce()
END IF
```

The y arm repeats the same rule. This uses unary negation, `OR`, byte-coordinate
arithmetic, word increment, and a side-effecting no-argument service call. A
corner legitimately executes both arms, increments twice, and starts the sound
twice. Refactoring the two conditions into one would change the program.

Shapes, sounds and text are Glimmer resources rather than Lanternfly declarations.
They nevertheless cross the body-language boundary through generated data and
callable services. A Lanternfly-visible interface might describe `Shape_Spark` as an
opaque static resource and `ShapeDraw` as a routine accepting a shape reference
plus x and y coordinates. Lanternfly need not know how a shape declaration is parsed
or generated.

`ShapeDraw` also has a sharp precondition: a shape extending past the 8x8
display writes beyond the framebuffer. Lanternfly bounds checks on its own arrays
would not protect a native service with such a contract. Imported routines need
documented preconditions and effects, and debug builds may eventually wrap
selected services with checks. The language cannot promise memory safety across
an unchecked native boundary.

Sound calls show another ordinary side effect. `Snd_Bounce()` starts or
restarts asynchronous profile state and returns immediately. It has no special
Lanternfly status because it arose from a Glimmer declaration. The same rule applies
to `HudWriteU16` and the LCD operation: Lanternfly sees typed imported operations,
while Glimmer or the platform decides how they are supplied.

The LCD example distinguishes a call from an inline assembler operation.
`lcd_row MsgHello, LcdRow1` is an AZM op with immediate parameters and expands
to six instructions at each use. Lanternfly source should use the same grammatical
call syntax for a service regardless of whether a backend emits a call, inlines
an expansion, invokes C, or emits BASIC statements. Inline-versus-call is a
lowering and cost decision, not a different source-language concept.

The generated resource formats reinforce exact static layout:

- text is a zero-terminated byte sequence;
- a shape is a three-byte header followed by one mask byte per row;
- a sound wrapper embeds two immediate scalar values.

Lanternfly may expose typed views or imported resource types for such data, but it
should not bake these Glimmer-specific formats into the language.

### Chapter 10: Arrays and Layout Types

Canvas is the decisive initial case for structured memory. Its state consists
of a byte array and a two-field record:

```text
state Picture : byte[8]
state Cursor : Point
```

The assembly body has to construct both forms of access manually. Lanternfly should
make the intended operations direct:

```text
IF Cursor.y > 0 THEN Cursor.y = Cursor.y - 1
Picture[Cursor.y] = Picture[Cursor.y] OR MxMask(Cursor.x)
```

This one example justifies record field selection, runtime array indexing,
reading and writing selected elements, nested expressions as indexes, and
compound use of a loaded element. These are more central to the game logic than
general-purpose routine locals.

The Glimmer array is statically allocated, zero-filled, fixed length and
homogeneous. It has no heap identity and cannot grow. That is an excellent
starting model for Lanternfly:

```text
DIM Picture AS BYTE[8]
```

The bound should remain part of the declaration and compiler type information.
Whether global storage is automatically zero-filled belongs to the storage and
target specification, not to array indexing itself.

`DrawCanvas` walks two arrays with different strides: `Picture` has stride one,
while the green plane of `Framebuffer` has stride four. In source terms the
operation is a fixed eight-iteration copy from `Picture[row]` to
`Framebuffer[row].green`. This is the first clear array-of-record lowering:

```text
FOR row = 0 TO 7
    Framebuffer[row].green = Picture[row]
NEXT row
```

The address formula is the conventional one:

```text
base + index * element-size + field-offset
```

Lanternfly should own that formula so each backend can choose increments, shifts,
constant multiplication or native indexed addressing. Programmers should not
have to expose a Z80 register pair merely to select one row.

The layout declaration establishes the useful field repertoire in existing
Glimmer work: bytes, words, nested records, fixed raw runs and addresses.
`Sprite` has an exact size of eleven bytes:

```text
Point pos       2
BYTE speed      1
WORD score      2
BYTE frames[4]  4
ADDRESS tile    2
```

There is no automatic power-of-two rounding in this current AZM-facing model.
The explicit total supports exact semantic layout by default. A programmer can
add padding or request alignment when a favourable stride matters.

Field notation should replace repeated assembler offset expressions:

```text
Hero.pos.y
```

Nested field access is compile-time structural knowledge, not runtime
reflection. For an array of `Sprite`, the compiler combines the runtime index
with the exact record size and constant field offsets.

The bare `frames : 4` field is better represented in Lanternfly as a fixed byte array
than as an untyped hole. Typed arrays preserve indexing, bounds and intent while
lowering to the same four bytes. Explicit padding can have its own declaration
if the programmer means storage that should not be read as data.

The existing `addr` field is a two-byte near address. It can name data or code,
which is convenient in assembly but too imprecise for a typed source language.
Lanternfly's eventual reference types should distinguish at least data references
from callable references, record their referent where known, and identify near
versus far representation. The current `addr` remains valuable backend
evidence, not a sufficient portable type.

The alias form `type Board = byte[8]` gives a reusable structural name without
creating a distinct runtime object. Lanternfly needs both named record layouts and
aliases for fixed array shapes. It can postpone questions of nominal versus
structural assignment until whole-record assignment actually appears in the
corpus.

Glimmer attaches one change flag to each aggregate state cell. Lanternfly must not.
It reads and writes the memory selected by its expressions; Glimmer continues
to decide that an enclosing `updates Picture` declaration raises one reactive
flag. This cleanly preserves the language boundary while allowing Lanternfly to
replace every hand-written address calculation in the body.

### Chapter 11: Dependency Reports and Debugging

The deliberately broken Canvas example reveals an advantage Lanternfly can bring to
Glimmer without absorbing Glimmer semantics. Glimmer can recognize a direct
assembly store such as `ld (Marks),a`, but cannot prove that `ld (hl),a` writes
an element of `Picture`. A Lanternfly compiler does know the target of:

```text
Picture[Cursor.y] = Picture[Cursor.y] OR mask
```

It can report that the body writes the aggregate `Picture`, then pass that fact
to a separate Glimmer consistency check against `updates Picture`. This is
semantic information exported by Lanternfly, not a Lanternfly rule that raises a reactive
flag. The separation permits better diagnostics while keeping the languages
independent.

The same analysis can distinguish reads, writes and service calls at field and
aggregate granularity. Glimmer may only care that some part of `Cursor` was
written, while Lanternfly diagnostics and a debugger can still name `Cursor.y`.

Lanternfly adds another source layer to the existing mapping:

```text
Lanternfly body -> generated substrate -> machine addresses
```

Glimmer already preserves assembly body coordinates through generated files and
AZM diagnostics. Lanternfly must emit equivalent line mappings so an error or
breakpoint points to the Lanternfly statement the programmer wrote. Generated AZM,
C or BASIC should remain inspectable as a secondary view, but it must not
become the primary diagnostic location.

Register contracts catch stale Z80 values across calls. Ordinary Lanternfly code
should avoid that class of error by expressing values and typed calls rather
than register ownership. Its Z80 backend still needs accurate imported
contracts to allocate registers, save live values and validate generated code.
AZM's contract checker can therefore serve as a second validation layer for
the backend.

This gives imported routines two related interfaces:

- a Lanternfly-facing signature describing parameter and result types and visible
  memory or device effects;
- a substrate-facing ABI describing registers, stack use and clobbers.

They may be declared together in a target support package, but source programs
should depend on the first. For example, a Lanternfly declaration of `FbPlot` accepts
three bytes and returns nothing; the Z80 implementation maps them to A, B and C
and records the actual clobber set.

Debugging must cross both boundaries. A user should be able to step a Lanternfly
assignment as one source operation, then deliberately enter its lowering or an
imported native service when instruction-level detail matters. Variables,
fields and indexes should remain inspectable by their Lanternfly names even if the
backend temporarily holds values in registers.

The chapter also makes cost visibility important. `HudWriteU16`, framebuffer
copy loops and inlined operations have very different costs despite equally
simple call syntax. Lanternfly should offer a listing or report that relates each
source statement to emitted bytes, calls and estimated target cycles. It should
not deform the source language into assembly merely to keep performance
observable.

### Chapter 12: Routines, Parts and Imports

The Glimmer `CursorSpot` helper has no formal arguments or declared result. Its
register convention returns a bit mask in B and an address in HL. This confirms
that useful composition is possible before Lanternfly has a complete Algol-style
routine system. A minimal implementation could call parameterless procedures
whose operands live in global state and whose backend ABI is declared
externally.

It also shows why such a model should be transitional. Neither the source nor
the caller states that HL is a reference to `Paint[Cursor.y]`. Register
contracts prove liveness and clobbers, but not referent type, bounds or aliasing.
A later Lanternfly routine signature can express that information without changing
the static-allocation philosophy.

In this particular example, Lanternfly removes the reason for `CursorSpot` entirely:

```text
Paint[Cursor.y] = Paint[Cursor.y] OR MxMask(Cursor.x)
Paint[Cursor.y] = Paint[Cursor.y] AND NOT MxMask(Cursor.x)
```

The helper exists because assembly field and index arithmetic is verbose.
Direct structured access should be tried before adding abstraction mechanisms
to the first language.

`CountLit` is stronger evidence for a routine with a result. It loops over the
eight picture bytes and their bits, maintaining counters and returning a word.
A full Lanternfly version needs loop induction variables, at least one accumulator,
and either a byte bit loop or a `BITCOUNT` library operation. This helps order
features:

1. structured memory and expressions eliminate routine-shaped address helpers;
2. `FOR` introduces compiler-owned scalar induction variables;
3. a small standard operation such as `BITCOUNT` can cover common target gaps;
4. explicit scalar locals and typed function results enable general routines;
5. aggregate routine parameters and locals remain aliases to static storage.

The order does not prohibit formal arguments. It avoids making them a
prerequisite for translating the common bodies.

Glimmer parts are source composition, and imports are native module boundaries.
Neither needs a special Lanternfly keyword inside a body. Lanternfly code included through
different Glimmer parts can share the program's state namespace, while an
imported Lanternfly or native module can expose typed symbols through a manifest or
interface file.

The native module's exported/private labels provide a minimum visibility model.
Lanternfly should have public and private declarations when it gains separate
modules, but the first body-language implementation can inherit program
composition from its harness. File organisation should not delay expression,
control-flow and addressing work.

The imported routines read `Paint` and `Framebuffer` directly by global label.
That is efficient and valid for one program, but it hides dependencies. A
portable support library should prefer explicit typed parameters or a declared
target context. Program-specific Lanternfly helpers may continue to access imported
global state while the language is small.

`ShowPaint` and `CountLit` also locate the standard/runtime library boundary.
Lanternfly source can call a stable operation such as a framebuffer copy or bit count.
A Z80 target may supply hand-written assembly, a 6502 target a different loop,
C a direct expression or library call, and a richer processor an instruction.
The service fills a capability gap; it does not force every backend to emit a
separate runtime routine.

Diagnostics and debug attribution must survive composition. A body in a
Glimmer part should still report its original file and Lanternfly line, and a call
into a native import should visibly cross into that module when the user elects
to step at substrate level.

### Chapter 13: Cards

Cards are an especially useful negative boundary. Active-card gating, entry
edges, frame-latched transitions and change re-raising are Glimmer behaviour.
Lanternfly should not gain `CARD`, `ENTER`, `GOTO CARD` or hidden transition
semantics merely because it compiles the bodies inside those declarations.

The bodies themselves remain small imperative programs. `StartRound`,
`ScorePoint`, `OpenGate` and the conditional restart translate directly:

```text
Score = 0
PlayClock = 512

Score = Score + 1

Armed = 1

IF Armed THEN
    CurrentCard = Card.Splash
END IF
```

`Card.Splash` is a generated symbolic constant. Lanternfly therefore needs to import
named constants from its harness or target environment. It does not need to
declare Glimmer's enumeration itself in the first version. A later enum type is
attractive because it could prevent assigning an unrelated byte to
`CurrentCard`, but symbolic constants are the minimum interoperation feature.

The clock render contains a power-of-two scaling:

```asm
ld hl,(PlayClock)
add hl,hl
add hl,hl
ld a,h
```

Semantically this computes the bar length from frames remaining, equivalent to
an unsigned division by 64 over the relevant range. Lanternfly source should state
that calculation and let the Z80 backend choose shifts or high-byte extraction.
The source must not depend on an incidental register representation.

Both `DrawClock` and `FinalBar` draw a bounded number of pixels. The first uses
a computed count from zero through eight; the second clamps the score to eight.
They reinforce a counted `FOR` loop whose body calls a clobbering service. The
compiler owns preservation or reconstruction of the induction value around the
call. This is precisely the mechanical work Lanternfly should remove.

The final-bar clamp can be written with ordinary control flow:

```text
length = Score
IF length > 8 THEN length = 8
```

That spelling requires a scalar temporary. Until arbitrary locals exist, the
same result can be expressed as two branches containing their own loops, or
provided by a small `MIN` operation. This is concrete pressure for scalar
locals, but it still comes after structured memory because only a few bodies
need them.

`PromptOn` and `Armed` are byte-valued truths. Conditions treat zero as false,
and `PromptOn XOR 1` toggles between canonical zero and one. The corpus
continues to support BASIC-style numeric truth rather than a mandatory distinct
Boolean storage representation.

The `CurrentCard` write also demonstrates that a Lanternfly body may update
harness-owned state. Such an assignment is an ordinary typed store from Lanternfly's
perspective. Glimmer alone decides that its declared `updates CurrentCard`
causes a transition on the following frame. The same source/body separation
holds even when the resulting side effect is structurally important to the
game.

Finally, imported state can have lifecycle rules Lanternfly does not own. Timers
count down elsewhere; `PlayClock` is read as an ordinary word and written to
arm it. A target interface should document those external effects, but Lanternfly
should not pretend the variable is an ordinary isolated memory cell for
optimization purposes. Imports need volatility or effect metadata sufficient
to prevent a backend caching a value across calls or harness phases.

## Book 2: Complete Games

### Chapter 1: Building Skyfall

Skyfall confirms that most complete-game bodies remain assignments, bounds
tests, service calls and short branches. It adds one important warning about
numeric semantics. The assembly catch test deliberately relies on byte
underflow:

```asm
ld a,(DropX)
sub b
cp 3
jr nc,_miss
```

When a drop lies left of the paddle, subtraction wraps to a large unsigned
byte, which correctly counts as a miss. A high-level translation:

```text
IF DropX - PadX < 3 THEN
```

is only equivalent if the subtraction remains an eight-bit unsigned operation.
If Lanternfly promotes both bytes to a signed `INTEGER`, a left-hand drop produces a
negative result and becomes a false catch.

The grammatical source should preferably state the geometry:

```text
IF DropX >= PadX AND DropX < PadX + 3 THEN
```

A capable backend can recognize or otherwise lower that bounded-range test
efficiently. If programmers need the modular idiom, Lanternfly's fixed-width rules
must make it explicit—through byte-typed arithmetic, a wrapping operation, or a
well-defined conversion. This example belongs in the numeric-semantics test
suite.

`RandCol` masks an imported random byte with `%00000111`. This is direct
evidence that `AND` must retain integer mask behaviour, not merely short-circuit
truth behaviour. The result also illustrates a small typed function:

```text
FUNCTION RandCol() AS BYTE
    RETURN RandomByte() AND %00000111
END FUNCTION
```

The initial implementation could instead expose `RandCol` as a parameterless
import returning a byte; the game bodies do not depend on how the service is
implemented.

Round initialization is a sequence of global scalar assignments and one call.
It requires neither arguments nor locals:

```text
Score = 0
Lives = 3
PadX = 3
Gravity = 18
DropX = RandCol()
DropY = 0
```

This is representative evidence for Lanternfly's smallest useful core.

The `Fall` rule is the largest logic body so far. Structured `IF`, `ELSE` and
early completion can express it without labels, while the state variables
continue to carry values between invocations. A few scalar temporaries would
improve readability, but they are not necessary to preserve the algorithm.

Skyfall uses unsigned types consistently by role:

- coordinates, lives, periods and gates are bytes;
- score is an unsigned word;
- the one-shot wait is a word because ninety currently fits in a byte but the
  timer declaration chooses a wider capacity;
- characters are byte codes, and `Lives + '0'` performs character arithmetic.

Lanternfly therefore needs byte character literals even if it postpones a distinct
string or character type. Conversion from a digit value to a character must
have a defined range assumption.

The falling speed has a floor:

```text
IF Gravity >= 7 THEN Gravity = Gravity - 1
```

The source is clearer than an assembly flag idiom and lowers directly.
Similarly, paddle movement is bounded mutation. These repeat often enough to
justify examples and optimizer patterns, but not new language constructs.

The draw routines reinforce typed service calls and argument reloads after
clobbering calls. Lanternfly should express:

```text
FbPlot(DropX, DropY, COLOR_YELLOW)
ShapeDraw(Shape_Paddle, PadX, 7)
```

The Z80 backend handles register placement and clobbers. On C or BASIC, the
same calls can remain ordinary source calls or map to platform wrappers.

No aggregate state is needed because the design deliberately permits only one
falling block. The text explicitly says multiple drops would lift that
simplification with an array. Lanternfly's fixed array and record facilities are the
natural route to that extension; no heap or tree structure is implied.

### Chapter 2: Reading Tetro

Tetro separates small reactive rules from a substantial native board engine.
The split is useful evidence rather than a permanent prescription. Lanternfly's
initial success criterion is not only translating the short rules; it should
eventually express most of the engine without losing its static memory model or
making its table accesses obscure.

The settled board uses four parallel fixed arrays:

```text
BoardRows  : BYTE[8]
BoardRed   : BYTE[8]
BoardGreen : BYTE[8]
BoardBlue  : BYTE[8]
```

This is already compatible with minimal Lanternfly. A later refactoring could define
an eight-element array of exact-layout row records, but the parallel planes
match the framebuffer and make whole-plane operations natural. Lanternfly should
support both representations rather than impose object-shaped data.

The generated rotational resources introduce two important static table
shapes:

- a conceptual `shape[7][4][4]` byte table, with repeated entries represented
  as aliases;
- a `reference-to-shape[7][4]` pointer table selecting a bitmap at runtime.

Every selection flattens `piece * 4 + rotation`. This is direct evidence for
fixed multidimensional arrays or equivalent nested fixed arrays. The Lanternfly
spelling should preserve the dimensions:

```text
piece = ShapeRotations[CurPieceIndex, CurRotation AND 3]
```

The backend may flatten it to `base + (piece * 4 + rotation) *
element-size`. The source should not manually duplicate that formula.

`ShapeRotPtrTable` and `BoardPlaneTbl` are arrays of near data references.
They make references a real game-data requirement, not only an ABI concern.
Each selected reference aliases statically allocated storage; nothing is
created or freed. A useful first reference model can therefore be deliberately
restricted:

- references point to global, resource or statically allocated data;
- the referent type and address class are known;
- a reference may be copied, passed and indexed;
- no address arithmetic is exposed beyond typed field and element selection;
- there is no ownership, heap allocation or general graph construction.

The board engine's private storage (`CurPiecePtr`, bounds, colour bits and shift
count) exists partly because assembly routines have no ordinary locals. Scalar
stack locals could make those dependencies explicit and permit re-entrant code.
An aggregate local, if ever needed, should remain a reference to existing
static data, following the ZAX model.

`CheckCollAt` is a typed predicate hidden behind a register/flag ABI. In Lanternfly it
would read naturally as:

```text
FUNCTION CollisionAt(x AS BYTE, y AS BYTE) AS BYTE
```

or eventually as a `BOOLEAN` result if that type is adopted. The engine uses
carry set as true, while another routine's carry convention is described in
the prose in the opposite-sounding branch. Lanternfly signatures should normalize
such ABI details into source-level truth and let adapters handle flags.

`ApplyGravity` is a long state-machine branch, but it uses only existing state,
service calls and conditionals. It requires early exit, or a nested `IF`,
rather than arbitrary jumps. The source-level skeleton is:

```text
IF ClearMask = 0 THEN
    IF CollisionAt(PlayerX, PlayerY + 1) THEN
        LockPiece()
        full = FullRowsMask()
        IF full <> 0 THEN
            ClearMask = full
            PlayerY = 200
            ClearHold = 24
        ELSE
            SpawnPiece()
        END IF
    ELSE
        PlayerY = PlayerY + 1
    END IF
END IF
```

Only `full` pressures a scalar local; it could temporarily be a global return
cell or the call could be repeated, though neither is ideal. This again puts
scalar locals ahead of aggregate local allocation but behind structured
addressing.

`PlayerY = 200` is an intentional sentinel that parks an overlay outside the
visible board. A range-refined coordinate type would reject it, while an
ordinary byte permits it. Lanternfly's base numeric types should describe storage
width and signedness, not silently infer domain bounds from variable names or
uses. Optional distinct range types can come later.

The engine performs collision, four-plane locking, full-row scans, collapse,
score lookup and framebuffer reconstruction. Those tasks demand:

- nested fixed-array reads and writes;
- loops with scalar counters and accumulators;
- shifts, masks and bit tests;
- runtime-selected references;
- typed calls with scalar parameters and results;
- exact record/array strides.

They do not demand a heap, recursive structures, closures or dynamic array
growth. This strongly supports Lanternfly's proposed constrained middle ground.

The preview renderer repeats the simplest indexed resource access:

```text
PutChar(PieceNames[NextPieceIndex])
```

Text can be exposed as a fixed byte sequence or an opaque resource with an
indexable byte view. The source need not know the LCD's register ABI.

### Chapter 3: The TMS9918 Profile

The second display profile confirms that Lanternfly's body language can remain
platform-independent when hardware activity is represented by typed services.
Grove's movement rules are the same bounded byte assignments as Rover's. Only
the imported operations and resource handles differ:

```text
NamePut(Fern, 4, 18)
SpriteSet(Moth, MothX, MothY)
```

Lanternfly does not need to know that one backend expands these calls inline, writes
shadow RAM, marks dirty bits, or later streams to a VDP port.

The generated shadow memory is larger and more structured than the earlier
examples:

```text
NameShadow    : BYTE[24, 32]
NameDirtyRows : BYTE[3]
SpriteShadow  : SpriteAttribute[32]
```

where `SpriteAttribute` is an exact four-byte record containing y, x, pattern
and colour. This is strong evidence that Lanternfly array bounds must not inherit
Glimmer's user-state limit of 256 bytes. A dimension may have 256 elements and
the complete static object may be larger, provided its target address class and
linker placement can represent it.

Indexes into a 768-byte name table cannot be held in a byte. The address
calculation `row * 32 + column` therefore needs a wider intermediate even
though both inputs are bytes. Lanternfly's expression rules must define widening for
address calculations separately from modular byte game arithmetic, or lower a
typed array index without pretending the flattened offset is a byte. This is a
central numeric-design case.

The dirty-row commit uses a compact bitset: three bytes represent twenty-four
rows. It shifts each byte, tests the outgoing bit, and derives a row as
`group * 8 + bit`. Lanternfly's `AND`, `OR`, `XOR`, `NOT` and shifts are sufficient
to express this without a separate logical operator family. A small `BITSET`
library abstraction could improve common code later, but the core should retain
the underlying integer operations.

The commit routine also demonstrates nested loops with runtime-selected array
elements, a block transfer and scalar temporaries. This is plausible system
library Lanternfly once routines and locals mature. Direct `IN`/`OUT` instructions,
vblank polling and exact transfer timing can remain native target services.
The ordinary language should not acquire Z80 port syntax merely to replace
every line of the profile library.

VDP memory is not a normal CPU pointer. Its address is written to a port and
subsequent bytes stream through another port. Lanternfly's near/far data references
should not be stretched to pretend this is ordinary addressable RAM. A target
service such as `VdpWriteBlock(vramAddress, source, length)` can give the VDP
address its own opaque scalar or distinct target type.

The resource upload exercises constant multiplication and address offsets:
tile index times eight, colour bank selection, and foreground times sixteen
plus background. These should be ordinary constant expressions with backend
strength reduction. Explicit table alignment is unnecessary here; exact
resource positions are derived from the VDP format.

`sprite_at` and `tile_at` currently have different AZM op signatures: the
former reads state cells while the latter accepts immediate coordinates. Lanternfly
should erase that substrate distinction. One typed call can accept an
expression, and constant propagation decides whether the backend emits
immediates.

The `$D1` sprite terminator and `PlayerY = 200` in Tetro are further examples
of byte-sized sentinel values. A future domain type can distinguish visible
coordinates from special hardware values, but `BYTE` itself must remain
capable of storing the full zero-to-255 range.

Finally, the shadow commit makes externally changing state explicit. Lanternfly
writes normal RAM; Glimmer and the profile commit it later. This is analogous
to timer cells and card state: target interface metadata must prevent unsafe
optimization, while scheduling semantics remain outside Lanternfly.

### Chapter 4: Building Rushlight

Rushlight adds coordinate conversion, absolute difference and decimal
formatting to the arithmetic evidence. The fly's centre pixel becomes a tile
coordinate through:

```text
flyColumn = (FlyX + 4) SHR 3
flyRow = (FlyY + 4) SHR 3
```

This is deliberately integer arithmetic. `SHR` is useful and direct for
binary-scaled domains, while `/ 8` or `DIV 8` would express the same
non-negative calculation more generally. The backend can choose the identical
three shifts.

Gathering a lantern depends on statement order. The old `LampCol` and
`LampRow` identify the cell that must be cleared; only after the `NamePut`
side effect may the program store the new random coordinates. Lanternfly should
define ordinary sequential evaluation and visible call ordering. It must not
reorder imported side effects across state assignments.

Random placement uses mask-and-offset ranges:

```text
LampCol = RandomByte() AND %00011111
LampRow = (RandomByte() AND %00001111) + 4
```

These are elementary byte expressions. A later `RandomRange` library function
could improve portability and distribution for non-power-of-two ranges, but
the language still needs mask operations.

The wasp collision computes an absolute difference on each axis. In Lanternfly:

```text
IF ABS(WaspX - FlyX) < 6 AND ABS(WaspY - FlyY) < 6 THEN
    CurrentCard = Card.GameOver
END IF
```

This exposes another promotion requirement. Subtracting two unsigned bytes can
produce −248, so `ABS` must operate on a widened signed intermediate rather
than wrapped byte arithmetic. The Skyfall catch test intentionally wanted
wrapping subtraction; Rushlight wants mathematical subtraction from the same
storage types. Lanternfly cannot choose one implicit byte rule that makes both
expressions clear.

A workable direction is:

- values retain fixed-width storage types;
- ordinary arithmetic promotes byte operands to a signed or wider evaluation
  type capable of the operation;
- assignment performs an explicit, diagnosed or defined narrowing;
- modular arithmetic is requested through conversion or wrapping operations;
- typed indexing always widens sufficiently for the complete object.

The precise evaluation type remains a design decision, but these two games
provide the tests it must pass.

The LCD score routine is a hand-coded substitute for division and remainder.
It repeatedly subtracts ten once for the tens digit and again for the ones
digit. Lanternfly should permit the grammatical form:

```text
PutChar('0' + (Score DIV 10))
PutChar('0' + (Score MOD 10))
```

The Z80 standard/runtime layer can provide or inline byte division; C and
16/32-bit targets can use native operators. `DIV` and `MOD` are therefore more
fundamental than exposing the subtraction loop. A decimal-format service is
also useful, but should not be the only way to perform integer division.

The display deliberately assumes a score ceiling of 99. Lanternfly should not infer
or silently enforce that from the formatting code. A debug range assertion or
an explicit clamp can document it:

```text
ASSERT Score <= 99
```

Assertions are not required for the first implementation, but the example
belongs in the diagnostics dossier.

The chase rule compares each axis and moves one step toward its target. It is a
natural `IF`/`ELSE IF`:

```text
IF WaspX < FlyX THEN
    WaspX = WaspX + 1
ELSE IF WaspX > FlyX THEN
    WaspX = WaspX - 1
END IF
```

No low-level flags need appear. The same structure expresses the y arm.

The repository's Sprite Chase variant reads pulse cells directly, treating
each as an imported byte-valued truth. That further supports Lanternfly access to
harness-owned scalar state without harness keywords. It also gives `IF UpP
THEN` a straightforward meaning.

Most of Rushlight's native-looking body lines are device calls and repeated
register setup. Typed services remove them. The remaining game logic is close
to the pseudocode used in the prose, which is strong evidence that Lanternfly can
replace the assembly without absorbing the VDP profile.

### Chapter 5: Two Displays, One Language

The comparison chapter validates the architectural split. The same imperative
body language can serve a scan-driven framebuffer and a shadow/commit VDP
because display mechanics remain behind imported operations. Lanternfly's core
semantics should not vary with `display matrix8x8` versus `display tms9918`;
only the visible target interfaces, costs and address spaces vary.

The chapter also names two larger structured-memory cases that the example pass
must inspect directly:

- Snake packs `(y * 8 + x)` positions into a 64-byte ring buffer;
- Tetro uses occupancy and colour-plane arrays, plus generated pointer tables.

The ring buffer will test modular indexes, head/tail arithmetic and fixed
capacity. Tetro has already established multidimensional tables and static
references. Together they cover substantially more than isolated scalar state.

Display scale affects algorithms without changing the language. An 8x8 board
uses cell coordinates, whole-frame redraws and compact masks; a VDP scene uses
pixel coordinates, grid conversion, persistent resources and dirty subsets.
Both need the same integers, fixed arrays, records, conditions, loops and typed
service calls.

Cost reports must therefore be target-specific. `SpriteSet` may write a few
shadow bytes and cause a later 128-byte transfer, while `FbPlot` changes one
small framebuffer. Lanternfly source can remain portable only if tooling exposes
these backend and profile costs without embedding them in syntax.

The frame loop and reactive machinery differ around the bodies but not within
them. This is further evidence that direct substrate pass-through can coexist
with Lanternfly indefinitely: Glimmer selects and generates the harness, while each
body is independently either Lanternfly or native substrate code.

## Shared Reference Appendices

### Appendix A: Declaration Reference

The declaration reference fixes the current Glimmer/AZM boundary. Block and
routine bodies are verbatim substrate text. Glimmer requires no instruction,
word or calling convention from that text beyond the ability of the chosen
substrate pipeline to place and call it. Lanternfly should enter through the same
body slot and initially change no surrounding declaration semantics.

Current Glimmer exposes:

- scalar `byte` and `word` state;
- `byte[1..256]` state arrays;
- exact AZM layout types containing bytes, words, near addresses, raw runs,
  nested layouts and fixed arrays of layouts;
- type aliases such as `Point[2]`;
- generated constants, resources, state labels and callable operations.

Lanternfly should not inherit incidental gaps such as the lack of Glimmer word-array
state. Its type checker and code generator may handle `WORD[N]` or record
arrays whenever the harness supplies statically allocated storage of that
shape. Conversely, Lanternfly must respect the actual type and size of every symbol
the harness imports.

The numeric literal forms already familiar to Glimmer users are decimal,
`$`-hexadecimal, `0x`-hexadecimal and `%`-binary. Lanternfly can retain decimal,
`$` hexadecimal and `%` binary as its concise BASIC-like core. Supporting
`0x` as an alias is inexpensive but not necessary to the language's identity.

Glimmer's layout grammar permits `Point[2]` and nested fields, not only the
simple `Point` shown in Canvas. This confirms that arrays of exact records are
already representable in generated AZM. Lanternfly's field/index design should cover
them from the outset even if early examples use only one record.

The current `addr` layout field is always the assembler's two-byte address.
Lanternfly must map that to an explicitly near data or code reference at the target
boundary. A far reference may occupy three or four bytes and therefore changes
record size; address class is part of a field's type and ABI.

Glimmer routines have no arguments, local declarations or result syntax. Their
AZM register contracts are inferred. This is a useful compatibility stage, not
a constraint on Lanternfly's eventual routine design.

Generated operations accept immediate cells and labels in substrate-specific
ways. Lanternfly target interfaces need enough metadata to turn uniform expression
calls into those AZM forms. If an op requires a compile-time constant, the
Lanternfly signature should state that restriction and diagnose a runtime argument.

The direct-store warning is the only body-aware Glimmer analysis described.
Lanternfly can export a complete semantic read/write/call summary as discussed
earlier. It must still leave `updates` authoritative because native
pass-through bodies and imported routines may write indirectly.

All resource declarations and card/timer/pulse rules remain outside Lanternfly.
Their generated names are ordinary imported constants, storage, references or
services. This reference therefore supports a strict no-Glimmer-keywords rule
for the Lanternfly grammar.

### Appendix B: The 8x8 Matrix Profile

The profile's register contracts can be recast as a compact Lanternfly target
interface. Conceptually:

```text
SUB FbClear()
SUB FbPlot(x AS BYTE, y AS BYTE, colour AS BYTE)
FUNCTION MxMask(x AS BYTE) AS BYTE
SUB ShapeDraw(shape AS NEAR REF TO Shape, x AS BYTE, y AS BYTE)
SUB HudWriteU16(value AS WORD)
```

The argument order in Lanternfly need not mimic A/B/C/HL. A backend adapter maps the
source signature to the verified AZM contract. The call-site cost and
clobbering information remain available in generated listings.

The framebuffer's auxiliary byte is a canonical explicit-padding example. Its
semantic record is three colour planes plus one named auxiliary or padding
field, giving a four-byte stride. Lanternfly exact layout can represent that without
a global power-of-two storage rule.

The profile also exposes useful implementation candidates for Lanternfly's standard
library:

- zeroing a fixed block;
- setting and testing a bit selected by an index;
- decimal encoding of an unsigned word;
- fixed-capacity table traversal.

Their public signatures can be portable even when the Z80 implementation is
hand-written and another backend uses native arithmetic or library facilities.

`ShapeDraw` uses nine private global scratch cells. This is concrete evidence
that scalar locals could materially improve runtime implementation quality and
re-entrancy. It is not evidence for aggregate stack allocation: the shape
itself remains static and is passed by near reference.

The LCD operation accepts an immediate message address and row constant at the
AZM level. In Lanternfly, a message resource has a typed reference or opaque handle,
and the target adapter may require that particular argument to be a
compile-time constant. This restriction should be visible in the imported
signature rather than encoded as special call syntax.

Rotational shape resources repeat the Tetro model exactly: a two-dimensional
table of near references, a parallel byte table and a colour table. They should
be used as the first multi-array/reference lowering fixture.

### Appendix C: The TMS9918 Profile

The VDP interface turns large counts and addresses into concrete type cases.
Block fills reach 2,048 bytes, name tables 768 bytes and sprite tables 128
bytes. Length parameters therefore need at least an unsigned word on the Z80
target. A general Lanternfly `LENGTH` or `SIZEOF` expression should produce an
address-sized or sufficiently wide unsigned value, not a byte derived from an
array's element type.

VRAM addresses such as `$3800` fit in a word but do not denote CPU memory. A
portable target interface could define an opaque `VRAM_ADDRESS` value while the
Z80 adapter represents it as a word. This is distinct from both a near CPU
reference and a banked far reference.

The shadow layouts again admit direct Lanternfly definitions, including a
32-by-24 byte grid and a 32-element record array. Native profile code may remain
the first implementation, but these are suitable later system-library
translation studies.

The ops and routine table supply enough information to write a typed interface
without changing Glimmer. Constant requirements, scalar widths, effects on
shadow memory and backend clobbers can all live in target metadata.

### Appendix D: Build and Debug

The existing four-artifact pipeline suggests a staged Lanternfly integration:

```text
.glim with Lanternfly bodies
    -> generated substrate with source mappings
    -> substrate check/compile
    -> binary artifacts and composed debug map
```

Lanternfly should also be usable without Glimmer: a harness-neutral front end accepts
typed symbol and service metadata, lowers a body or module, and returns
substrate text plus diagnostics, access summaries and mapping data. Glimmer is
one client of that interface.

Source maps must compose rather than be replaced. A machine address should
resolve first to the Lanternfly statement, with an optional route to the generated
AZM/C/BASIC and then to native library code. The current `.glim`/assembly split
shows that mixed-source stepping is already expected.

Diagnostics need a visible stage label and original-source coordinates.
Generated substrate errors should be translated through Lanternfly's mapping when
they originate in emitted code. Backend failures that indicate a Lanternfly compiler
bug should say so rather than blame an inscrutable generated line.

Build reports should distinguish generated, checked and executable artifacts,
especially when an earlier binary remains after a failed compile. Lanternfly should
not silently leave a stale executable looking current.

The dependency-only command performs no writes. A corresponding Lanternfly
analysis/listing command can report types, storage, inferred reads/writes,
required services and estimated costs without generating final artifacts.

### Appendix E: AZM Touchpoints

AZM provides a particularly capable first substrate. Lanternfly's Z80 backend can
emit `.type`, `sizeof`, `offset`, `.routine`, `.import`, `.equ` and `.enum`
constructs instead of flattening every abstraction prematurely. AZM then
checks generated routine boundaries and resolves exact layout.

This does not make those constructs Lanternfly semantics. A C backend can emit
fixed-width types and structs; a BASIC backend may flatten records and arrays
into calculated indexes; a 6502 assembler backend may emit constants and
labels. Lanternfly's typed intermediate representation is the common source of each.

AZM op expansion preserves diagnostic attribution at the invocation. Lanternfly
should preserve a similar nested origin: the source call is primary, while a
user can inspect the target adapter expansion that caused a backend error or
cost.

Exported and private AZM labels can implement Lanternfly visibility. Parameter and
result metadata still require a Lanternfly interface because `@` alone exports only a
name.

Generated `.enum` values establish an import path for qualified constants such
as `Card.Playing`. Lanternfly can initially consume those constants without adding
enum declarations to its own grammar. If it later adopts enums, the imported
group supplies the member set and storage width.

Strict register checking should remain enabled on generated AZM. It is a
valuable backend verifier even though Lanternfly users no longer manage registers
directly.
