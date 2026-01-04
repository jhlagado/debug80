# D8 Debug Map (D8M) v2

This document defines a JSON mapping format for Z80 debugging. The intent is to
support deterministic address-to-source mapping across assemblers, while still
allowing best-effort maps derived from listings.

Version 2 stores segment data in columnar arrays to reduce file size. Version 1
(row-wise segments) is considered legacy but is still accepted for backwards
compatibility.

## Naming

Format name: D8 Debug Map (D8M)

Canonical file name:
`<artifactBase>.d8dbg.json`

## Goals

- Map instruction address ranges to source locations.
- Capture symbol definitions for labels, constants, and data.
- Represent data regions distinctly from executable code.
- Allow confidence flags when mappings are inferred.
- Remain assembler-agnostic and stable across projects.

## File structure

Top-level JSON object:

Required:
- `format`: string, must be `d8-debug-map`
- `version`: number, must be `2`
- `arch`: string (e.g. `z80`, `6502`, `6809`)
- `addressWidth`: number of address bits (e.g. `16`, `24`)
- `endianness`: `little` or `big`
- `files`: array of source file entries
- `segments`: columnar segment data

Optional:
- `lstText`: array of listing text strings (string table)
- `symbols`: array of symbol entries
- `memory`: memory layout information
- `generator`: toolchain metadata
- `diagnostics`: warnings or errors recorded during map creation

### 1) `files`

Each entry describes a source file referenced by the map.

Required fields:
- `path`: string. Prefer a project-relative path with `/` separators.

Optional fields:
- `sha256`: string (hex), hash of file contents
- `lineCount`: number, total lines in the file

### 2) `segments` (columnar)

`segments` is an object of parallel arrays. All arrays must be the same length.
Each index maps one segment across all arrays.

Required arrays:
- `start`: number[] start address (0..65535)
- `end`: number[] end address (exclusive)
- `file`: (number|null)[] index into `files[]` or null
- `line`: (number|null)[] 1-based line number or null

Optional arrays:
- `column`: (number|null)[] 1-based column number
- `kind`: (string|null)[] enum: `code`, `data`, `directive`, `label`, `macro`, `unknown`
- `confidence`: (string|null)[] enum: `high`, `medium`, `low`
- `lstLine`: (number|null)[] listing line number
- `lstText`: (number|null)[] index into `lstText[]`

Notes:
- `end` is exclusive. Length is `end - start`.
- `confidence` should be used when mapping is inferred from listings.

Example:
```json
{
  "segments": {
    "start": [2304, 2307],
    "end": [2307, 2310],
    "file": [0, 0],
    "line": [12, 13],
    "kind": ["code", "code"],
    "confidence": ["high", "high"],
    "lstLine": [87, 88],
    "lstText": [0, 1]
  },
  "lstText": [
    "JP      APPSTART",
    "LD      A,0"
  ]
}
```

### 3) `symbols`

Symbols describe labels, constants, and data locations.

Fields:
- `name`: string
- `address`: number (0..65535)
- `file`: string (optional)
- `line`: number (optional)
- `kind`: string enum: `label`, `constant`, `data`, `macro`, `unknown`
- `scope`: string enum: `global`, `local`
- `size`: number (optional, bytes)

### 4) `memory`

Optional layout data for ROM/RAM segments or banked memory.

Fields:
- `segments`: array of:
  - `name`: string
  - `start`: number
  - `end`: number (exclusive)
  - `kind`: string enum: `rom`, `ram`, `io`, `banked`, `unknown`
  - `bank`: number (optional)

### 5) `generator`

Metadata describing the toolchain that produced the map.

Fields:
- `name`: string (e.g., `asm80`)
- `version`: string (optional)
- `args`: array of strings (optional)
- `createdAt`: string (ISO-8601, optional)
- `inputs`: object (optional), e.g. `{ "lst": "build/main.lst", "hex": "build/main.hex" }`

### 6) `diagnostics`

Optional warnings/errors encountered during map creation.

Fields:
- `warnings`: array of strings
- `errors`: array of strings

## Legacy v1 (row-wise)

Version 1 stores `segments` as an array of objects with repeated fields. Debug80
accepts v1 maps for compatibility, but writes v2 by default. When Debug80 finds
a v1 map on disk, it regenerates a v2 map from the listing on the next launch.
