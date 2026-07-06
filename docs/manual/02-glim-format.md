---
layout: default
title: 'Chapter 2 - The Glimmer Format'
parent: 'Glimmer Manual'
nav_order: 2
---

[<- Getting Started](01-getting-started.md) | [Manual](index.md)

# Chapter 2 - The Glimmer Format

A `.glim` file is line-oriented. Comments start with `;`. Inside effect
bodies, lines are passed to the generated AZM verbatim.

## program

```
program CounterToy
```

Names the program. Required, once per file.

## platform and display

```
platform tec1g-mon3
display matrix8x8
```

Optional, but declared together when used. They select the profile the
runtime is generated for.

Without them, the generic profile is used: placeholder API addresses,
suitable for tests and for reading the generated structure.

With `tec1g-mon3` + `matrix8x8`, the output targets the real TEC-1G under
MON-3: input is polled through the MON-3 `_scanKeys` API, key names are
MON-3 key codes (`KEY_0`..`KEY_F`, `KEY_PLUS`, `KEY_MINUS`, `KEY_GO`,
`KEY_AD`), and the generated loop is scan-driven — every frame the runtime
scans the whole 8x8 RGB matrix from a framebuffer with fixed row dwell,
then runs your effects while the matrix is blank. The generated file also
contains a small profile library your fragments can call: `FbClear`,
`FbPlot` (B = x, C = y, A = colour bits), and `MxMask`.

See `examples/dot.glim` for the complete minimal program: a white dot
moved with keys 2/4/6/8, stopping at every edge.

## state

```
state Count : byte = 0 dirty_on_start
state Score : word = 0
```

Declares a state cell managed by the runtime. Types are `byte` and `word`.
The initial value is optional and defaults to 0. `dirty_on_start` marks
the cell dirty on the first frame so dependent effects run once at
startup.

## pulse

```
pulse IncPressed
```

Declares a one-frame transient cell. Pulses are set by bindings or code,
consumed by effects, and cleared automatically at the end of every frame.

## bind

```
bind key KEY_1 rising -> IncPressed
```

Declares an input binding. In the current version the only form is a
rising-edge key binding onto a pulse: the pulse fires on the frame the key
is first pressed, not while it is held.

## effect

```
effect ApplyIncrement
    on IncPressed
    writes Count
begin
    ld hl,Count \ inc (hl)
    ld a,(hl) \ cp 10 \ jr c,.done
    xor a \ ld (hl),a
.done:
end
```

An effect is a named Z80 fragment. Its three header lines answer three
different questions:

- `phase` — **when** in the frame it runs. Every frame executes the
  phases in a fixed order: `derive`, then `logic`, then `render`. State
  changes settle before anything draws. **Logic is the default** — an
  effect with no `phase` line is ordinary game logic (like
  `ApplyIncrement` above); only `derive` and `render` need stating.
- `on` — **why** it runs. This is the trigger: the effect runs when any
  listed cell became dirty this frame. This is the one line that cannot
  be inferred — notice the body above never mentions `IncPressed` at
  all. The connection between the pulse and the code exists only here.
- `writes` — **what** it changes. After the effect runs, each listed
  state cell is marked dirty, which is what triggers downstream effects
  (here, a render effect `on Count`). It is the effect's outward
  contract: a reader can trace the program's dataflow from `on` and
  `writes` lines alone, without reading any Z80.

`on` and `writes` are always explicit — why an effect runs and what it
changes are never implied. The body between `begin` and `end` is real
AZM assembly, including backslash instruction stacking.

Labels starting with `.` are local to the fragment. Glimmer rewrites them
into globally unique labels in the generated output, so every fragment can
have its own `.done`.

Fragment bodies fall through — do not end them with `ret`. The generated
wrapper appends the dirty-bit bookkeeping and the `ret`.

## Current limits

This is an early alpha. The present version supports at most 8 state and
pulse cells per program (one dirty byte), one binding kind, and
placeholder system API addresses. See the
[roadmap](../roadmap.md) for what comes next.
