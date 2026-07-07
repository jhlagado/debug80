---
layout: default
title: 'Chapter 3 - Assembly and Z80 Emission'
parent: 'AZM Engineering Manual'
nav_order: 3
---

[<- Source Loading and Parsing](02-source-loading-and-parsing.md) | [Ops and Register Contracts ->](04-ops-and-register-contracts.md)

# Chapter 3 - Assembly and Z80 Emission

Assembly turns source items into facts, bytes, fixups and source segments. This
chapter combines the assembler-time fact model with the Z80 emission path
because those two stages are tightly coupled: planning decides addresses and
sizes, then emission writes bytes using those facts.

The central files are:

- `src/assembly/address-planning.ts`
- `src/assembly/address-symbols.ts`
- `src/assembly/private-label-qualification.ts`
- `src/assembly/placement.ts`
- `src/assembly/program-emission.ts`
- `src/assembly/fixup-emission.ts`
- `src/assembly/assemble-program.ts`
- `src/semantics/expression-evaluation.ts`
- `src/semantics/constant-operators.ts`
- `src/semantics/layout-evaluation.ts`
- `src/z80/parse-instruction.ts`
- `src/z80/instruction.ts`
- `src/z80/encode.ts`
- `src/z80/effects.ts`

## Assembly Orchestration

`src/assembly/assemble-program.ts` is the entry point:

```ts
export function assembleProgram(items: readonly SourceItem[]): AssembleProgramResult;
```

It builds the address state, emits the program image and returns diagnostics,
symbols, byte maps and source segments. The function is intentionally small.
Detailed decisions live in the modules below it.

Before address planning starts, the assembly path validates imported-private
references against source-unit visibility rules, then rewrites imported private
labels to source-unit-qualified internal names. Address planning, symbol
resolution and byte emission use those internal names so same-name private
labels from different imported units stay distinct. The returned symbol table
maps back to display names and drops ambiguous imported private names.

## Address Planning

`src/assembly/address-planning.ts` walks source items and builds the facts
needed to place and evaluate the program:

- labels and their addresses
- `.equ` constants and enum members
- record and union layouts
- type aliases
- `.org` placement state
- sizes for data, storage and instructions

The returned `AddressState` contains symbol facts, equate records, layout
records, enum names, diagnostics and placement information. This is where parsed
syntax becomes assembler knowledge. A label item becomes an address. A type
declaration becomes a layout record. A `.ds` directive becomes a byte count.

## Placement

`src/assembly/placement.ts` owns placement state. `.org` sets the active
address. Instructions advance by encoded size. `.db` advances by emitted byte
count. `.dw` advances by two bytes per expression. `.ds` advances by calculated
storage size. `.align` advances to the next aligned address.

Placement is separate from byte emission so the assembler can resolve symbols
before every byte has been written. A branch to a later label can be encoded
after address planning has seen the label definition.

## Symbols and Layouts

Labels define addresses. `.equ` declarations define assembler-time values.
Enums define qualified constants. `src/assembly/address-symbols.ts` contains
the symbol helpers that define labels, equates and enum members, enforce
duplicate rules and record spans for diagnostics and output metadata.

`src/assembly/private-label-qualification.ts` owns the imported-private label
rewrite. It qualifies private labels with a source-unit key before address
planning, rewrites same-unit references to those internal names and leaves
public labels, equates, enum members, types and type aliases on their display
names. This keeps entry-file symbols and public exports visible ahead of
same-name imported private labels while preserving internal references inside
each imported unit.

Record and union declarations become layout records. A record field advances the
offset by its byte size. A union field starts at offset zero and the union size
is the largest field size.

For a record:

```asm
Sprite .type
x      .field byte
y      .field byte
tile   .field byte
flags  .field byte
       .endtype
```

the layout record stores `x = 0`, `y = 1`, `tile = 2`, `flags = 3` and total
size `4`.

Type aliases bind a name to another type expression:

```asm
SpriteArray .typealias Sprite[16]
```

`sizeof(SpriteArray)` resolves through the alias to the size of `Sprite[16]`,
with the same field paths as the underlying array expression.

## Expression Evaluation

`src/semantics/expression-evaluation.ts` evaluates expression trees against the
assembler-time environment. It coordinates literal arithmetic, symbol lookup,
constant operators, byte functions, layout functions and layout casts that fold
to constant addresses.

The operator and layout rules live in focused modules:

| File                    | Role                                                                |
| ----------------------- | ------------------------------------------------------------------- |
| `constant-operators.ts` | Binary and unary constant-operator dispatch.                        |
| `binary-operators.ts`   | Binary arithmetic, bitwise, comparison and logical operators.       |
| `unary-operators.ts`    | Unary numeric operators.                                            |
| `byte-functions.ts`     | `LSB(...)`, `MSB(...)` and related byte extraction helpers.         |
| `layout-evaluation.ts`  | `sizeof(...)`, `offset(...)` and layout type expression evaluation. |
| `layout-path.ts`        | Field and array path resolution for layout casts.                   |
| `layout-format.ts`      | Human-readable layout names for diagnostics.                        |
| `diagnostics.ts`        | Shared semantic diagnostic construction.                            |

Expression evaluation is context-sensitive. A symbol in an instruction operand
may be a label or constant. A type expression in `.ds Sprite[4]` resolves to a
byte count. A layout cast such as `<SpriteArray>Sprites[3].flags` resolves to an
address when the base address, type alias, index and field path are all known at
assembly time.

## Data and Storage Size

Address planning needs the byte length of each directive. It contains size
helpers for `.db`, `.dw`, `.ds`, strings and alignment. The same string
directive byte rules are reused during emission so planning and output stay
aligned.

Initialized data writes bytes through `.db`, `.dw`, `.cstr`, `.pstr` and
`.istr`. `.ds` reserves space calculated from numbers or layout type
expressions. Layout type expressions are byte-size expressions in storage and
field-size positions.

## Program Emission

`src/assembly/program-emission.ts` owns byte writing. It walks source items in
order and writes emitted bytes to a map keyed by absolute address. It also
records source segments for the D8 map writer.

The emitted program shape is:

```ts
export interface EmittedProgram {
  readonly image: ReadonlyMap<number, number>;
  readonly sourceSegments: readonly EmittedSourceSegment[];
  readonly initializedAddresses: readonly number[];
}
```

The byte map stores final addresses. If source emits one byte at `$0100` and
another at `$8000`, the map has two entries. A sparse map fits Z80 programs that
place code, data and ROM vectors at separate origins.

## Emission Walkthrough

For this source:

```asm
        .org $0100
Start:
        ld      a,42
        jp      Start
```

address planning records `Start = $0100`. The instruction parser represents
`ld a,42` as an immediate load and `jp Start` as an absolute branch. The encoder
returns literal opcode bytes plus a 16-bit expression fragment for `Start`.
Fixup emission evaluates `Start` to `$0100` and writes the little-endian operand
bytes.

The final byte map contains:

```text
$0100: 3E
$0101: 2A
$0102: C3
$0103: 00
$0104: 01
```

The D8 source segment records that those bytes came from the source lines that
emitted them.

## Z80 Instruction Model

`src/z80/instruction.ts` defines the instruction and operand types.
`src/z80/parse-instruction.ts` dispatches instruction text into parser families.
`src/z80/encode.ts` dispatches typed instructions into encoder families.
`src/z80/effects.ts` describes register and flag effects for register contracts.

The parser and encoder work as a pair:

| File                                                                                           | Question                                                                                     |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `parse-instruction.ts`                                                                         | Which parser family should handle this instruction head?                                     |
| `parse-basic.ts`, `parse-branch.ts`, `parse-exchange.ts`, `parse-io-control.ts`, `parse-ld.ts` | Parse specific instruction families.                                                         |
| `parse-operands.ts`, `parse-conditions.ts`, `operand-split.ts`                                 | Split operands and classify conditions, registers, indexed operands and expression operands. |
| `instruction.ts`                                                                               | How is that form represented as TypeScript data?                                             |
| `encode.ts`, `encode-core.ts`, `encode-ld.ts`, `encode-ld-helpers.ts`                          | Which bytes and fixup fragments represent that form?                                         |
| `effects.ts`                                                                                   | Which registers and flags does that form read or write?                                      |

The instruction model keeps overloaded Z80 mnemonics manageable. `ld` has many
forms, but the parser classifies operands before encoding. The encoder then
selects a specific opcode family from typed operands.

## Fixups and Relative Branches

The Z80 encoder returns fragments: literal bytes, 8-bit immediates, 16-bit
immediates, relative branch targets and deferred CB bit-opcode fragments for
`BIT`, `RES` and `SET` forms whose bit index stays as an expression.
`src/assembly/fixup-emission.ts` evaluates the expression attached to each
fragment and writes the final byte or word.

Relative branches such as `jr` and `djnz` emit an 8-bit displacement from the
next instruction. The parser recognises `jr nz,Loop`. The encoder knows the
opcode and that the operand is relative. Fixup emission knows the current
address and final target address.

The same principle applies to absolute branches, immediate operands and CB bit
indexes. The encoder chooses the fragment width or opcode family. Fixup
emission evaluates the expression and checks that the value fits that width or,
for bit operations, resolves to an integer in the `0..7` range before the
opcode byte is written.

## Source Segments

Every emitted byte range can carry source provenance. `program-emission.ts`
adds `EmittedSourceSegment` records with start address, end address, source
file, line and segment kind. `writeD8m()` later groups these segments by file
for Debug80.

Source segments classify emitted ranges as code, data, directive output, label
context or unknown output. Debug80 uses this metadata to connect source lines to
addresses. A byte-perfect assembler can still give a poor debugging experience
when source segments are too broad, absent or attached to a different file.

## Changing Assembly or Encoding

Instruction changes usually touch `parse-instruction.ts`, `instruction.ts`,
`encode.ts` and `effects.ts`. Assembly changes usually touch
`address-planning.ts`, `program-emission.ts`, `fixup-emission.ts` or
`placement.ts`, depending on whether the change affects facts, emitted bytes,
symbolic references or address movement.
