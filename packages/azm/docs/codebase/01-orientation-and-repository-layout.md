---
layout: default
title: 'Chapter 1 - Orientation and Repository Layout'
parent: 'AZM Engineering Manual'
nav_order: 1
---

[Manual](index.md) | [Source Loading and Parsing ->](02-source-loading-and-parsing.md)

# Chapter 1 - Orientation and Repository Layout

AZM is a Z80 assembler and tooling package. It turns `.asm` and `.z80` source
files into bytes, Intel HEX, flat binary output, Debug80 maps, lowered ASM80
source and register contract metadata. The same implementation serves the command
line, package consumers, Debug80 integration and the test suite.

The codebase follows the same path as an assembly run. A source file is loaded,
`.include` lines are expanded, source is split into logical lines, logical lines
become typed source items, visible `op` invocations expand into ordinary
instructions, assembler-time facts are collected, instructions and data emit
bytes, symbolic fixups are resolved and output writers serialize the result.

AZM's extensions are assembler-time features. Layout types, enums, type
aliases and register-contract directives help the assembler
calculate addresses, check contracts and produce metadata. Runtime behaviour
still comes from the Z80 instructions and bytes that AZM emits.

## The Compiler Path

A small source file shows the main pipeline:

```asm
        .org $0100

LIMIT       .equ 8
SpriteArray .typealias Sprite[16]

Sprite .type
x      .field byte
y      .field byte
tile   .field byte
flags  .field byte
       .endtype

.routine
Start:
        ld      b,LIMIT
_loop:
        djnz    _loop

Sprites:
        .ds SpriteArray
```

The loader reads the entry file and expands includes. The logical-line scanner
records each line with source provenance. The parser emits source items for
`.org`, `.equ`, `.typealias`, the `Sprite` layout, labels, instructions and
`.ds`. Address planning assigns `$0100` to `Start`, assigns the following
addresses to `_loop` and `Sprites`, records `LIMIT = 8` and records the size of
`SpriteArray`. The encoder turns `ld b,LIMIT` and `djnz _loop` into fragments.
Fixup emission resolves `LIMIT` and the relative branch displacement. The
output writers produce the selected artifacts.

The CLI and package consumers use this same path. AZM has one compiler pipeline
with several entry points.

## Main Layers

The implementation has six main layers:

1. **Public entry points** in `src/index.ts`, `src/api-compile.ts`,
   `src/api-artifacts.ts`, `src/api-register-contracts.ts`, `src/api-tooling.ts`
   and `src/cli.ts`.
2. **Loading and parsing** in `src/node/`, `src/source/`, `src/syntax/` and
   `src/core/compile.ts`.
3. **Assembler-time analysis** in `src/assembly/` and `src/semantics/`.
4. **Z80 parsing and encoding** in `src/z80/`.
5. **Language services** in `src/expansion/`, `src/register-contracts/` and
   `src/tooling/`.
6. **Artifact writers** in `src/outputs/`.

Each layer passes structured data to the next. Diagnostics are accumulated as
data objects and formatted at the CLI edge. Editor tooling, tests and package
consumers share the same diagnostic model.

## Runtime Boundary

AZM computes everything it can at assembly time. `sizeof(Sprite)`,
`offset(Sprite, flags)` and `<SpriteArray>Sprites[3].tile` fold to numbers while
the assembler runs. The generated Z80 program receives those numbers in
instructions and data. At runtime the CPU executes normal Z80 operations:
loads, stores, branches, calls, returns and port I/O.

This boundary explains where major features live. Layout code belongs to the
assembler because it calculates byte offsets. Register contracts belong to the
assembler because it analyses visible calls and register effects. Output writers
belong at the edge because they serialize already-assembled facts.

## Repository Shape

The AZM repository has a compact top-level structure:

```text
AZM/
  src/                 TypeScript implementation
  test/                unit, integration, CLI, differential and acceptance tests
  docs/                active contributor references, specs and design notes
  examples/            small runnable source examples
  scripts/             CI, guardrail and developer utility scripts
  dist/                generated package output
  package.json         package exports, CLI bin, scripts and dependencies
```

The repository is a Node package. The source is TypeScript ESM. The published
package exposes the CLI binary `azm` and stable imports for compile and tooling
consumers.

## Source Directories

`src/` is organised by compiler responsibility:

| Directory             | Responsibility                                                                                                          |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `assembly/`           | Address planning, placement, byte emission and fixups.                                                                  |
| `cli/`                | Argument parsing, usage text, artifact path calculation and disk artifact writing.                                      |
| `core/`               | In-memory compile helpers, conditional assembly and source-item parsing orchestration.                                  |
| `diagnostics/`        | Diagnostic text formatting.                                                                                             |
| `expansion/`          | Visible `op` collection, operand modelling, overload selection and expansion.                                           |
| `model/`              | Shared data types used across layers.                                                                                   |
| `node/`               | File-backed source loading and include expansion.                                                                       |
| `outputs/`            | BIN, HEX, D8 map, lowered ASM80 and artifact helper writers.                                                            |
| `register-contracts/` | Register contract routine modelling, instruction shape helpers, liveness, summaries, reports, interfaces and fixes.     |
| `semantics/`          | Expression evaluation, constant operators, byte functions and layout evaluation.                                        |
| `source/`             | Source files, spans, logical line scanning, comment scanning and comment stripping.                                     |
| `syntax/`             | Line parsing, directive parsing, expression tokenizing, token expression parsing, layout parsing and directive aliases. |
| `tooling/`            | Editor/tooling APIs and source-style checks.                                                                            |
| `z80/`                | Z80 instruction model, operand splitting, parser families, encoder families and register effects.                       |

The root files expose public entry points. The subdirectories hold the compiler
pipeline. A change usually belongs to the directory that owns the data it
changes.

## Tests, Docs and Scripts

The test tree mirrors the implementation boundaries. Unit tests target narrow
modules. Integration tests cover cross-stage compiler behaviour. CLI tests
verify argument and artifact contracts. ASM80 and differential tests protect
compatibility and byte parity. Type tests protect the public TypeScript surface.

The repo-local docs are the active working set for implementation detail:

```text
docs/
  codebase/
```

`docs/codebase/` is the maintained engineering manual for the source tree,
compile flow, user-facing CLI, package-facing APIs, register-contract
metadata and verification lanes. Avoid reintroducing parallel reference,
planning or design trees unless there is a concrete active need.

`scripts/` contains verification and maintenance utilities. The package scripts
in `package.json` are the normal entry points. Invoke script files directly
while debugging the script itself.

## Package Exports

`package.json` exposes these public paths:

```text
@jhlagado/azm
@jhlagado/azm/compile
@jhlagado/azm/tooling
@jhlagado/azm/cli
@jhlagado/azm/package.json
```

Public consumers import from those paths. Internal files under `src/` and
compiled files under `dist/src/` are implementation details.

## Reading the Codebase

Start with the public entry point that matches your task. For a CLI bug, begin
in `src/cli/run.ts` and follow the option into `api-compile.ts`. For source
syntax, begin in `parseNextSourceItems()` and `parse-line.ts`. For an encoding
bug, begin in `parse-instruction.ts`, `instruction.ts` and `encode.ts`. For a
D8 map issue, begin in `program-emission.ts`, `outputs/types.ts` and
`write-d8.ts`.

The compiler is small enough that one feature can be followed from front to
back. `.typealias`, for example, appears in the parser, address planner,
expression evaluator, tests and manual examples. A feature is complete when
each boundary that observes it has the right structured fact.
