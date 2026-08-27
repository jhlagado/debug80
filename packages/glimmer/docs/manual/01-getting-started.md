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
readable Atom source file. Glimmer also checks its register contracts.
`--no-check` stops after generation.

When you want the whole toolchain in one step — HEX, binary, and a
Debug80 map — use `build`:

```sh
node dist/src/cli.js build examples/counter.glim
```

AZM remains available for programs that require its extended directives or
operations:

```sh
node dist/src/cli.js build --assembler azm examples/counter.glim
```

Both build forms write the generated assembly, Intel HEX, binary, and a D8
debug map. Lines inside your `begin`/`end`
block bodies are attributed to the `.glim` file itself: a breakpoint set
in Glimmer source resolves, and stepping through your own code stays in
the `.glim` file. Generated glue (dispatch, timers, the profile library)
stays attributed to the generated `.asm` — stepping into it drops you
into readable assembly, which is the transparency principle at work.

The default generated form is an ordinary Atom program and can be assembled
manually:

```sh
atom examples/counter.main.asm
```

Glimmer checks register contracts before assembling the Atom projection. The
contract-checking form declares each routine boundary and uses the MON-3
register profile for programs that call the monitor through `RST $10`. Contract
errors identify the offending call site even though this metadata does not
appear in the Atom source.

Hand-written imported modules remain separate Atom source parts, so diagnostics
and D8 mappings identify the module file. AZM layout-type directives and nested
module imports do not yet have Atom equivalents. Glimmer reports an error
instead of emitting partial Atom source for either form.

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
