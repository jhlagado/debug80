Glimmer Interactive Runtime Specification

Z80 Fragments, Reactive State, and Game-First Application Creation

1. Purpose of this document

This document defines the conceptual and technical foundation for a Z80-based interactive software creation system called Glimmer.

(Glimmer is a separate project from TecMate/TECM8, which is ongoing and somewhat different.)

The naming is not final. The important thing is the model.

The project began as a way to replace BASIC with something more suitable for writing performant games on a Z80/TMS9918-class machine. It has since widened into a broader idea:

«Build a compact 8-bit interactive-program runtime where games are the first and most demanding profile, but not the only possible kind of software.»

The central idea is:

user-visible programming language: real Z80 assembly
project structure: small named fragments (snippets of Z80)
runtime model: polling loop + state records + dirty bits + generated glue
creative model: resources + state + bindings + effects + packaged output

This document is intended for a coding agent to use as a planning foundation. It is not a final implementation spec. Syntax, memory layout, and naming can change. The core philosophy should remain stable.

---

2. Philosophical motivation

2.1 BASIC was not the right abstraction for games

Many 1980s home computers shipped with BASIC because it was small, interactive, and approachable. BASIC was good for teaching programming, experimenting, and simple utilities.

However, BASIC was not ideal for performant games.

Typical problems:

- too slow for frame-critical game logic
- poor fit for tiles, sprites, animation, collision, and frame timing
- encouraged unstructured "POKE", "PEEK", and "CALL" programming
- forced users to reinvent game loops, input, collision, animation, and drawing
- made larger programs hard to structure
- distributed programs as listings rather than compact runnable packages

BASIC democratized access to programming, but it did not necessarily democratize making good games.

This project asks:

«If designing an 8-bit game computer today, knowing what we now know, what should replace BASIC?»

The answer proposed here is not a high-level language, and not simply “here is an assembler.” The answer is a structured environment where real Z80 code is written in small, named, meaningful fragments and stitched together by a runtime.

2.2 The user should learn the machine

The project should not hide the machine behind a thick abstraction.

The user should learn:

- registers
- flags
- conditionals
- loops
- indexed memory
- data tables
- calls and returns
- state variables
- input polling
- display updates
- performance constraints
- hardware APIs

The visible programming language should be Z80 assembly.

However, the user should not have to start by writing an entire game engine or application runtime from scratch.

The machine should provide:

- a runtime loop
- state management
- display/input/file/sound APIs
- asset/resource handling
- generated glue code
- a small editor model
- debugger/build support

The educational goal is:

«Teach machine code by letting the user modify meaningful behaviour inside a working interactive system.»

2.3 Games are the first stress test

Games remain the first target because they force the system to be honest.

A game needs:

- input
- timing
- graphics
- sprites
- state
- collision/rules
- sound
- display updating
- packaging
- performance discipline

If the runtime can handle simple games, it can probably handle many non-game interactive tools.

The reverse is not true. A simple menu utility runtime may not be strong enough to handle games.

Therefore:

«Build the system game-first, but do not make it game-only.»

2.4 Avoid a desktop GUI fantasy

This system is not trying to turn a TEC-1G-class machine into a modern desktop platform.

It should not imply:

- windows
- mouse-first UI
- object-oriented GUI framework
- general event bus
- heap-heavy widgets
- dynamic component tree
- desktop application architecture

The appropriate 8-bit model is much plainer:

poll inputs
update state
run small routines
update changed display regions
repeat

This is closer to a game loop, a monitor, a card system, or a small interactive appliance than to a modern desktop GUI.

---

3. Core design statement

The design can be summarized as:

«Glimmer programs are built from named one-screen Z80 fragments connected by state variables, bindings, effects, resources, and a compact polling-based runtime.»

Or more mechanically:

resources

- state declarations
- input/control bindings
- effect declarations
- named Z80 fragments
- generated glue
- runtime APIs
  = runnable interactive program

The user writes Z80.

The system supplies the structure.

---

4. Key principles

4.1 The runtime owns the loop

The user should not normally write the entire main loop.

The runtime owns:

- polling
- phase ordering
- input state
- dirty state tracking
- calling effect routines
- display flushing
- frame cleanup
- resource loading
- system APIs

The user supplies small routines at named points.

4.2 The user owns behaviour

User routines define behaviour:

- increment this value
- move this actor
- update this sprite
- react to this state change
- redraw this field
- render the next chunk of a computation
- save this document
- change this screen/card

The system should avoid forcing the user to write boilerplate for common runtime mechanics.

4.3 One-screen fragments are a feature

The TMS9918 display is typically constrained to around 32 columns by 24 lines in text-oriented modes. This is not merely a limitation; it should shape the programming model.

The preferred unit of code is a fragment (also called a snippet): a short named routine that ideally fits on one screen.

This supports:

- fast editing on constrained hardware
- less scrolling
- clearer routines
- better pedagogy
- smaller file operations
- direct jumping between fragments
- dependency navigation
- routine-level assembly/debugging

A normal programming session should feel like:

choose fragment
edit small Z80 routine
assemble/check
run/test
jump to related fragment

not:

open giant source file
scroll
search
edit
scroll more

4.4 Real Z80 should remain visible

The system may provide conveniences, but it should not conceal the generated assembly.

The user should be able to inspect:

- their fragment source
- expanded/generated AZM
- generated labels
- generated wrappers
- final assembled listing
- symbol map
- machine code if desired

The educational promise depends on transparency.

4.5 Reactive state, not GUI callbacks

The system should avoid making the primary model “onclick handlers” or desktop-style events.

Instead, use:

state cells
dirty bits
pulses
bindings
effects
phases

A button, key, joystick input, timer, or slider should normally change state. Dependent routines run because state became dirty.

The mental model is:

something changed
dependent routine runs
output updates

not:

a widget called my event handler

4.6 Polling is natural

The system is likely to be polled rather than interrupt-driven for most user-level behaviour.

This fits the hardware and the teaching model.

A polling loop can handle:

- keyboard matrix
- joystick
- timers
- serial status
- file/status flags
- dirty display regions
- state updates
- cooperative long-running tasks

Interrupts may exist at the system level, especially for timing or sound, but the user-facing programming model should not depend on users understanding interrupt-driven GUI events.

---

5. Terminology

The following terms are proposed. Names can change, but the concepts are important.

5.1 Program / project

A complete Glimmer software unit.

Contains:

- state declarations
- routine fragments
- resources/assets
- bindings
- effects
- build metadata
- package metadata

5.2 Profile

A profile is a domain-specific layer over the same runtime.

Possible profiles:

- game profile
- card/screen app profile
- utility profile
- music/art profile
- teaching/demo profile
- development-tool profile

The runtime should support games first, but the underlying model should not be game-only.

5.3 State cell

A named variable managed by the runtime.

Example:

Count : byte
Score : word
PlayerX : byte
Zoom : fixed
CurrentCard : byte
RenderActive : byte

State cells can be marked dirty when changed.

5.4 Pulse

A one-frame or one-cycle state cell used to represent a transient command or input.

Example:

IncPressed
FirePressed
SaveRequested
RenderStepRequested

A pulse is set by input or code, consumed by effects, then cleared automatically.

5.5 Binding

A declarative link between an input/control and a state cell or pulse.

Examples:

bind key KEY_1 rising -> IncPressed
bind joystick LEFT -> RequestedDirection
bind slider ZoomControl <-> Zoom
bind textfield NameField <-> PlayerName

Bindings generate polling/update code.

5.6 Effect

A named routine that runs when one or more dependencies are dirty.

Example:

effect DrawScore
phase render
depends Score
routine DrawScore_Z80

The routine body is Z80.

5.7 Phase

A phase is an ordering group in the runtime loop.

Suggested phases:

input
derive
logic
render
commit
cleanup

Phases prevent chaotic execution ordering.

5.8 Fragment / snippet

A small named Z80 code fragment.

It is the primary editing unit.

A fragment has:

- name
- kind
- phase or hook metadata
- dependencies
- writes list
- Z80 body
- local labels
- generated wrapper
- source mapping

5.9 Resource

A non-code data item.

Examples:

- sprite
- tile
- tilemap
- screen/card layout
- font
- sound effect
- music pattern
- text block
- file template
- palette/colour table
- numeric lookup table

5.10 Hook

A named routine slot in a profile.

Game hooks might include:

Actor_Init
Actor_Update
Actor_Touch
Room_Enter
Room_Tick

Card/app hooks might include:

Card_Open
Card_Draw
Command_Run
Field_Changed
Screen_Tick

Hooks can be implemented as effects or direct runtime calls.

---

6. Hardware and environment assumptions

The target machine is conceptually:

Z80 CPU
TMS9918-style VDP
32-column by 24-line text-oriented display constraints
tile/sprite graphics
limited RAM
limited or slow filesystem/storage
keyboard/keypad/joystick input
possibly PSG-style sound
possibly SD-card or TEC-FS-like storage

Important implications:

- text editing must respect a small display
- source files should not be enormous monolithic files
- file access may be slow
- fragments should be small
- display updates should be dirty-region based where possible
- runtime structures should avoid large dynamic allocation
- generated code should be inspectable and reasonably compact
- user routines should return quickly
- long computations should be chunked cooperatively

---

7. Source model

7.1 The project is not one giant source file

The project should be stored as structured records, not primarily as a single large file.

Conceptual structure:

Project
├── manifest
├── state declarations
├── bindings
├── effects
├── fragments
│ ├── ApplyIncrement
│ ├── ApplyDecrement
│ ├── DrawCount
│ ├── PlayerUpdate
│ └── RenderNextChunk
├── resources
│ ├── sprites
│ ├── tiles
│ ├── maps
│ ├── cards/screens
│ └── sounds
└── build outputs

Each fragment can be loaded, edited, assembled, and saved independently.

This suits slow storage and small screens.

7.2 Build output may be one generated AZM file

Although the source project is structured, the build process may generate a single AZM file or module set.

Pipeline:

project records
→ meta-compiler
→ generated AZM source
→ AZM assembler
→ binary/package
→ emulator/hardware

Generated AZM should include:

- runtime API symbols
- state storage
- dirty bits
- binding code
- phase dispatch code
- generated wrappers
- user fragments
- cleanup code
- symbol/debug metadata

7.3 Fragment-local labels

Fragments should support local labels.

For example, inside "ApplyIncrement":

.ok:
ret

During code generation, local labels should be namespaced into ordinary
globally unique AZM labels:

FX_ApplyIncrement_ok:
ret

This avoids collisions between fragments.

Note on separators: `$` is not user-facing label syntax in AZM. It is
reserved for the current assembly address (`$ - TableStart`) and hexadecimal
literals (`$4000`). Generated labels therefore use a plain underscore
separator and must be globally unique across the assembled program. Label
privacy, when needed, comes from AZM's `.import` mechanism: `@Name:` labels
are public exports and plain labels are private to the imported source unit.
Future AZM may internally qualify private labels, but that is an
implementation detail, not source syntax.

---

8. One-screen fragment editor

8.1 Basic editor philosophy

The primary editor should be card-based, not file-scroll-based.

A fragment should ideally fit on one TMS9918 page.

Possible layout:

ApplyIncrement LOGIC
D:IncPressed W:Count
------------------------------

ld hl,Count \ inc (hl)
ld a,(hl) \ cp 10 \ jr c,.ok
xor a \ ld (hl),a
.ok: ret

---

A:asm B:run C:deps D:exit
err:

>

The editor should make it easy to:

- select a fragment
- edit a fragment
- assemble/check current fragment
- jump to dependencies
- jump to writers/readers
- see errors
- exit quickly

8.2 Backslash instruction stacking

AZM currently supports a backslash delimiter for stacking multiple instructions on one line when labels are not required before each instruction.

Example:

ld hl,Count \ inc (hl)
ld a,(hl) \ cp 10 \ ret c
xor a \ ld (hl),a \ ret

This is valuable because a 32-column display can show more program logic on one page.

Style guidance:

Stack straight-line instructions.
Keep labels visible.
Avoid over-stacking complex branch logic.
Prefer clarity over maximum density.

8.3 Soft one-screen limit

A normal fragment should have a soft limit:

fits on one 32x24 screen

If a fragment is too long, the editor can warn:

Fragment exceeds one-screen style.
Consider splitting into helper fragment.

This should not necessarily be a hard error, but the system should encourage small fragments.

8.4 Fragment browser

The editor should include a fragment browser.

Example:

FRAGMENTS

> ApplyIncrement
> ApplyDecrement
> DrawCount
> PlayerUpdate
> MoveLeft
> MoveRight
> CheckWall

Filters:

All
Input
Logic
Render
Game
Card
Utility
Dirty writers
Dirty readers

8.5 Dependency view

Because the system is reactive, navigation by dependency is important.

From "DrawCount":

DrawCount
depends on:
Count

Count is written by:
ApplyIncrement
ApplyDecrement

From "ApplyIncrement":

ApplyIncrement
writes:
Count

triggered by:
IncPressed

causes:
DrawCount

This helps the user understand the program without opening a long file.

---

9. Reactive runtime model

9.1 Basic loop

The runtime loop should be simple and inspectable.

Conceptual loop:

MainLoop:
call __PollBindings
call __RunDeriveEffects
call __RunLogicEffects
call __RunRenderEffects
call __CommitOutputs
call __ClearFrameState
jp MainLoop

A game profile may add frame synchronization and actor systems.

A card/app profile may add screen/card dispatch.

But the core shape remains:

poll
update state
run dependent routines
draw/commit changes
cleanup
repeat

9.2 State cells and dirty bits

Each state cell has:

id
name
address
size
flags
dirty bit position
possibly initial value

Small systems may use one dirty byte. Larger systems may use multiple dirty bytes.

Example:

D_COUNT equ 00000001b
D_INC equ 00000010b
D_DEC equ 00000100b

Dirty0: db D_COUNT

9.3 Pulses

Pulses are transient.

Example:

IncPressed
DecPressed
FirePressed
SaveRequested

Pulses are set by bindings or routines, used by effects, then cleared.

This avoids callback-style event handlers.

9.4 Effects

Effects are routines that run when dependencies are dirty.

Declaration:

effect DrawCount
phase render
depends Count
begin
ld a,(Count)
add a,'0'
ld b,10
ld c,5
call API_DrawChar
end

Generated dispatch:

ld a,(Dirty0)
bit D_COUNT_BIT,a
jr z,.__skip_draw_count
call FX_DrawCount
.__skip_draw_count:

9.5 Writes and dirty propagation

Effects can declare which state cells they write.

Example:

effect ApplyIncrement
phase logic
depends IncPressed
writes Count

Generated wrapper:

FX_ApplyIncrement:
; user code begins
ld hl,Count \ inc (hl)
; user code ends

    ; generated because writes Count
    ld a,(Dirty0)
    or D_COUNT
    ld (Dirty0),a

    ret

Initial implementation should probably use the simple rule:

If an effect declares writes X, mark X dirty after the effect runs.

Later, this may be optimized to compare old/new value.

9.6 CurrentDirty and NextDirty

A future implementation may need two dirty masks:

CurrentDirty
NextDirty

Reason:

- effects running in one phase may dirty state for a later phase
- some changes should take effect next frame
- dirty propagation can otherwise become order-sensitive

Initial implementation may use a single dirty mask for simplicity.

The coding agent should evaluate when the second mask becomes necessary.

9.7 Phases

Suggested phases:

input
derive
logic
render
commit
cleanup

Definitions:

- "input": poll hardware and update input state/pulses
- "derive": update derived state
- "logic": game/app logic
- "render": generate display changes
- "commit": write dirty output to VDP/sound/hardware
- "cleanup": clear pulses and consumed dirty bits

Games may use:

input
actor
collision
logic
render
commit
cleanup

But the general principle remains.

---

10. Example: Counter Toy

This is a minimal non-game example to prove the programming model.

10.1 Behaviour

Press KEY_1: increment Count
Press KEY_2: decrement Count
Whenever Count changes: redraw Count

10.2 User-facing meta-source

program CounterToy

state Count : byte = 0 dirty_on_start

pulse IncPressed
pulse DecPressed

bind key KEY_1 rising -> IncPressed
bind key KEY_2 rising -> DecPressed

effect ApplyIncrement
phase logic
depends IncPressed
writes Count
begin
ld hl,Count \ inc (hl)
ld a,(hl) \ cp 10 \ jr c,.done
xor a \ ld (hl),a
.done:
end

effect ApplyDecrement
phase logic
depends DecPressed
writes Count
begin
ld hl,Count
ld a,(hl) \ or a \ jr nz,.not_zero
ld a,9 \ ld (hl),a \ jr .done
.not_zero:
dec (hl)
.done:
end

effect DrawCount
phase render
depends Count
begin
ld a,(Count) \ add a,'0'
ld b,10 \ ld c,5
call API_DrawChar
end

10.3 Generated structure

The generator emits:

API_ReadKeys equ $8000
API_DrawChar      equ $8003
API_FlushDisplay equ $8006
API_InitDisplay   equ $8009

KEY_1_BIT equ 0
KEY_2_BIT equ 1

D_COUNT_BIT equ 0
D_INC_BIT equ 1
D_DEC_BIT equ 2

D_COUNT equ 00000001b
D_INC equ 00000010b
D_DEC equ 00000100b

Count: db 0
IncPressed: db 0
DecPressed: db 0
PrevKeys: db 0
Dirty0: db D_COUNT

Start:
call API_InitDisplay

MainLoop:
call __PollBindings
call __RunLogicEffects
call __RunRenderEffects
call API_FlushDisplay
call __ClearFrameState
jp MainLoop

Generated binding code:

__PollBindings:
call API_ReadKeys
ld b,a

    ld a,(PrevKeys)
    cpl
    and b
    ld c,a

    ld a,b
    ld (PrevKeys),a

    bit KEY_1_BIT,c
    jr z,.__no_inc
    ld a,1
    ld (IncPressed),a
    ld a,(Dirty0)
    or D_INC
    ld (Dirty0),a

.__no_inc:

    bit KEY_2_BIT,c
    jr z,.__no_dec
    ld a,1
    ld (DecPressed),a
    ld a,(Dirty0)
    or D_DEC
    ld (Dirty0),a

.__no_dec:

    ret

Generated dispatch:

__RunLogicEffects:
ld a,(Dirty0)
bit D_INC_BIT,a
jr z,.__skip_inc
call FX_ApplyIncrement
.__skip_inc:

    ld a,(Dirty0)
    bit D_DEC_BIT,a
    jr z,.__skip_dec
    call FX_ApplyDecrement

.__skip_dec:

    ret

__RunRenderEffects:
ld a,(Dirty0)
bit D_COUNT_BIT,a
jr z,.__skip_draw_count
call FX_DrawCount
.__skip_draw_count:

    ret

Wrapped user fragment:

FX_ApplyIncrement:
ld hl,Count \ inc (hl)
ld a,(hl) \ cp 10 \ jr c,FX_ApplyIncrement_done
    xor a \ ld (hl),a
FX_ApplyIncrement_done:

    ld a,(Dirty0)
    or D_COUNT
    ld (Dirty0),a

    ret

Cleanup:

__ClearFrameState:
xor a
ld (IncPressed),a
ld (DecPressed),a
ld (Dirty0),a
ret

This example demonstrates:

- state declaration
- input binding
- pulse
- effect
- writes declaration
- dirty bit propagation
- generated wrapper
- generated dispatch
- user-visible Z
