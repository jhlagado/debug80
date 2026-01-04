# D8 Debug Map (D8M) v1

This document defines a JSON mapping format for Z80 debugging. The intent is to
support deterministic address-to-source mapping across assemblers, while still
allowing best-effort maps derived from listings.

## Naming

Format name: D8 Debug Map (D8M)

Canonical file name:
`<artifactBase>.d8dbg.json`

Rationale: the name is explicit and namespaced to avoid collisions with other
formats.

## Goals

- Map instruction address ranges to source locations.
- Capture symbol definitions for labels, constants, and data.
- Represent data regions distinctly from executable code.
- Support macro expansions and include chains where available.
- Allow confidence flags when mappings are inferred.
- Remain assembler-agnostic and stable across projects.

## File structure

Top-level JSON object:

Required:
- `format`: string, must be `d8-debug-map`
- `version`: number, must be `1`
- `arch`: string (e.g. `z80`, `6502`, `6809`)
- `addressWidth`: number of address bits (e.g. `16`, `24`)
- `endianness`: `little` or `big`
- `files`: array of source file entries
- `segments`: array of mapping segments

Optional:
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

Example:
```json
{
  "path": "src/main.asm",
  "sha256": "b6d81b360a5672d80c27430f39153e2c",
  "lineCount": 120
}
```

### 2) `segments`

Each segment maps a byte range to a source location.

Required fields:
- `start`: number, start address (0..65535)
- `end`: number, end address (exclusive)
- `file`: string, must match a `files[].path`
- `line`: number, 1-based line number

Optional fields:
- `column`: number, 1-based column number
- `kind`: string enum: `code`, `data`, `directive`, `label`, `macro`, `unknown`
- `confidence`: string enum: `high`, `medium`, `low`
- `lst`: object with listing provenance:
  - `line`: number, listing line number
  - `text`: string, listing asm text
- `includeChain`: array of strings, include path stack
- `macro`: object with expansion details:
  - `name`: string
  - `callsite`: `{ file, line, column }`

Notes:
- `end` is exclusive. Length is `end - start`.
- `confidence` should be used when mapping is inferred from listings.

Example:
```json
{
  "start": 2304,
  "end": 2307,
  "file": "src/main.asm",
  "line": 12,
  "kind": "code",
  "confidence": "high",
  "lst": { "line": 87, "text": "JP      APPSTART" }
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

## Integration with Debug80 (current)

- Debug80 currently parses `.lst` directly into in-memory segments and anchors.
- No map file is emitted yet.
- The in-memory structures correspond to this format and can be serialized.

## Proposed workflow

1) Assemble with asm80 to produce `build/main.hex` and `build/main.lst`.
2) Generate a map file (future):
   - `build/main.d8dbg.json`
3) Debug80 loads the map file if provided; otherwise it parses `.lst`.

The map file can be treated as a build artifact in `build/` and is not
expected to be committed by default.
