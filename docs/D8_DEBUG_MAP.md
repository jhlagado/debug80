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
- `files`: object keyed by source file paths

Optional:
- `lstText`: string table for listing text
- `segmentDefaults`: defaults applied to segments when fields are omitted
- `symbolDefaults`: defaults applied to symbols when fields are omitted
- `memory`: memory layout information
- `generator`: toolchain metadata
- `diagnostics`: warnings or errors recorded during map creation

### 1) `files`

`files` is an object keyed by source path (project-relative, `/` separators).
Each entry groups segments and symbols for that file, which removes repeated
`file` fields.

File entry fields:
- `segments`: array of mapping segments (optional)
- `symbols`: array of symbol entries (optional)
- `meta`: optional file metadata

Meta fields:
- `sha256`: string (hex), hash of file contents
- `lineCount`: number, total lines in the file

Example:
```json
{
  "files": {
    "src/main.asm": {
      "meta": {
        "sha256": "b6d81b360a5672d80c27430f39153e2c",
        "lineCount": 120
      },
      "segments": [
        { "start": 2304, "end": 2307, "line": 12, "lst": { "line": 87, "textId": 0 } }
      ],
      "symbols": [
        { "name": "START", "address": 2304, "line": 12 }
      ]
    }
  }
}
```

Notes:
- The empty string key `""` is reserved for segments/symbols with no known
  source file.

### 2) `segments`

Each segment maps a byte range to a source location.

Required fields:
- `start`: number, start address (0..65535)
- `end`: number, end address (exclusive)

Optional fields:
- `line`: number (or null when unknown), 1-based line number
- `column`: number, 1-based column number
- `kind`: string enum: `code`, `data`, `directive`, `label`, `macro`, `unknown`
- `confidence`: string enum: `high`, `medium`, `low`
- `lst`: object with listing provenance:
  - `line`: number, listing line number
  - `text`: string, listing asm text (optional)
  - `textId`: number, index into `lstText` (optional)
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
  "line": 12,
  "kind": "code",
  "confidence": "high",
  "lst": { "line": 87, "textId": 0 }
}
```

### 2a) `lstText` (optional)

`lstText` is a string table for listing text. When present, segments can
reference `lst.textId` instead of repeating `lst.text` inline.

Example:
```json
{
  "lstText": ["JP      APPSTART"]
}
```

### 2b) `segmentDefaults` (optional)

Defaults applied when a segment omits the field.

Fields:
- `file`: string (legacy row-wise maps only; ignored in file-grouped layout)
- `kind`: string enum (default segment kind)
- `confidence`: string enum (default confidence)

### 3) `symbols`

Symbols describe labels, constants, and data locations.

Fields:
- `name`: string
- `address`: number (0..65535)
- `line`: number (optional)
- `kind`: string enum: `label`, `constant`, `data`, `macro`, `unknown`
- `scope`: string enum: `global`, `local`
- `size`: number (optional, bytes)

### 3a) `symbolDefaults` (optional)

Defaults applied when a symbol omits the field.

Fields:
- `kind`: string enum: `label`, `constant`, `data`, `macro`, `unknown`
- `scope`: string enum: `global`, `local`

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

## Legacy v1 layout

Earlier v1 maps used a `files` array with top-level `segments` and `symbols`
entries that repeated `file` on each record. Debug80 still accepts that layout
for backward compatibility, but it now writes the file-grouped layout described
above.

## Integration with Debug80

- Debug80 writes `build/main.d8dbg.json` alongside the build artifacts.
- On launch, Debug80 loads the map if present; if missing or invalid, it
  regenerates the map from the `.lst`.

## Workflow

1) Assemble with asm80 to produce `build/main.hex` and `build/main.lst`.
2) Debug80 writes `build/main.d8dbg.json`.
3) Debug80 loads the map for debugging, with `.lst` as the fallback source.

The map file can be treated as a build artifact in `build/` and is not
expected to be committed by default.
