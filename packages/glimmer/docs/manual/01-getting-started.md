---
layout: default
title: 'Chapter 1 - Getting Started'
parent: 'Glimmer Manual'
nav_order: 1
---

[Manual](index.md) | [The Glimmer Format ->](02-glim-format.md)

# Chapter 1 - Getting Started

Glimmer requires Node.js 20 or newer.

From a checkout:

```sh
npm ci
npm run build
node dist/src/cli.js examples/counter.glim
```

This compiles the CounterToy example to `examples/counter.main.asm`, a single
readable assembly source file. The default AZM compatibility backend also
checks its register contracts. `--no-check` stops after generation.

When you want the whole toolchain in one step — HEX, binary, and a
Debug80 map — use `build`:

```sh
node dist/src/cli.js build examples/counter.glim
```

Atom can assemble CounterToy directly:

```sh
node dist/src/cli.js build --assembler atom examples/counter.glim
```

Both build forms write the generated assembly, Intel HEX, binary, and a D8
debug map. Lines inside your `begin`/`end`
block bodies are attributed to the `.glim` file itself: a breakpoint set
in Glimmer source resolves, and stepping through your own code stays in
the `.glim` file. Generated glue (dispatch, timers, the profile library)
stays attributed to the generated `.asm` — stepping into it drops you
into readable assembly, which is the transparency principle at work.

The default generated form is an ordinary AZM program and can be assembled
manually:

```sh
npx azm examples/counter.main.asm
```

The `.routine` directives above each routine are register contracts —
library routines declare their register effects explicitly, and bare
`.routine` boundaries have AZM infer them from the body. The generated
file opens with `.contracts strict`, so contract errors in your blocks
fail the build with the offending call site named. Checking uses AZM's
monitor profile, because the TEC-1G examples call MON-3 through
`RST $10`: `azm --reg-profile mon3 <file>`.

The Atom projection removes this metadata after the same contract check. It
currently supports single-part programs without AZM layout-type directives.
Glimmer reports an error instead of emitting partial Atom source when a program
uses a form that has no Atom equivalent.

## Your first program

CounterToy is the smallest complete Glimmer program: one state cell, two
key bindings, and three effects.

Press key 1 to increment a counter, key 2 to decrement it, and the counter
is redrawn whenever it changes — not because a handler was called, but
because the `Count` cell was marked _changed_ and the `DrawCount` effect
depends on it. That reactive chain — input sets a pulse, a logic effect
updates
state, a render effect redraws what changed — is the whole programming
model in miniature.

The generated `counter.main.asm` contains every equate, dispatch routine, and
wrapped block. It can be inspected and stepped through like hand-written
assembly.
