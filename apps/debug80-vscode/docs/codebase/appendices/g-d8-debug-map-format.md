---
layout: default
title: 'Appendix G — D8 Debug Map Format'
parent: 'Appendices'
grand_parent: 'Debug80 Engineering Manual'
nav_order: 7
---

[Appendices](index.md)

# Appendix G — D8 Debug Map Format

D8 is a JSON debug-map format for Z80 assemblers, debuggers, and conversion tools. Debug80 consumes D8 maps for source-level debugging. AZM emits D8 maps as one of its normal output artifacts.

The format is intentionally small. It records the relationship between generated address ranges, source files, listing rows, and symbols. A debugger can use that information to bind breakpoints, show stack frames, and correlate the program counter with source lines without reverse-engineering an assembler listing.

D8 is not tied to AZM syntax. AZM is one producer. Debug80 is one consumer. Other assemblers can emit the same shape directly or use a converter that turns their own listing or symbol format into D8 JSON.

---

## File Name

A native D8 map should be written beside the primary build artifact with the same base name and the suffix `.d8.json`:

```text
build/main.hex
build/main.d8.json
```

Debug80 treats the native sidecar map as the authoritative source map for active AZM targets. Debug80 no longer writes generated maps to a project-local `.debug80/cache` path and does not fall back to parsing listing files during active launches.

---

## Version 1 Root Object

A D8 v1 file is a JSON object with these required root fields:

```typescript
interface D8DebugMap {
  format: 'd8-debug-map';
  version: 1;
  arch: string;
  addressWidth: number;
  endianness: 'little' | 'big';
  files: Record<string, D8FileEntry>;
  lstText?: string[];
  segmentDefaults?: D8SegmentDefaults;
  symbolDefaults?: D8SymbolDefaults;
  memory?: D8MemoryLayout;
  generator?: D8Generator;
  diagnostics?: D8Diagnostics;
}
```

| Field             | Required | Meaning                                                                                                  |
| ----------------- | -------: | -------------------------------------------------------------------------------------------------------- |
| `format`          |      Yes | Must be `"d8-debug-map"`.                                                                                |
| `version`         |      Yes | Must be `1` for this format version.                                                                     |
| `arch`            |      Yes | Target architecture label, such as `"z80"`, `"6502"`, or `"6809"`. Debug80 expects `"z80"` for Z80 maps. |
| `addressWidth`    |      Yes | Address size in bits, such as `16` or `24`. Z80 maps normally use `16`.                                  |
| `endianness`      |      Yes | Byte order for multi-byte values. Z80 maps normally use `"little"`.                                      |
| `files`           |      Yes | Source-file table. Keys are source paths; values hold segments and symbols.                              |
| `lstText`         |       No | Optional listing-text table used by `lstTextId` references.                                              |
| `segmentDefaults` |       No | Optional defaults for segment fields. Consumers may ignore unknown default fields.                       |
| `symbolDefaults`  |       No | Optional defaults for symbol fields. Consumers may ignore unknown default fields.                        |
| `memory`          |       No | Optional memory-layout metadata.                                                                         |
| `generator`       |       No | Optional producer metadata.                                                                              |
| `diagnostics`     |       No | Optional producer diagnostics or quality notes.                                                          |

Consumers should reject files with the wrong `format` or unsupported `version`. Consumers may ignore optional root objects and unknown root fields.

---

## File Entries

The `files` object groups mapping data by source file:

```typescript
interface D8FileEntry {
  meta?: {
    sha256?: string;
    lineCount?: number;
  };
  segments?: D8Segment[];
  symbols?: D8Symbol[];
}
```

Each key is a source path. Project-relative paths with `/` separators are the preferred portable form. Producers may write absolute paths or paths relative to a configured source root when that better matches their build environment. The empty string key represents unknown source.

Use portable relative paths when possible. AZM's `--source-root` option is one way to produce paths that can move between machines.

---

## Segments

A segment maps an address range back to a source or listing location:

```typescript
interface D8Segment {
  start: number;
  end: number;
  line?: number | null;
  column?: number;
  kind?: 'code' | 'data' | 'directive' | 'label' | 'macro' | 'unknown';
  confidence?: 'high' | 'medium' | 'low';
  lstLine: number;
  lstText?: string;
  lstTextId?: number;
  includeChain?: string[];
  macro?: {
    name: string;
    callsite: {
      file: string;
      line: number;
      column?: number;
    };
  };
}
```

| Field          | Required | Meaning                                                       |
| -------------- | -------: | ------------------------------------------------------------- |
| `start`        |      Yes | Inclusive address where the segment begins.                   |
| `end`          |      Yes | Exclusive address where the segment ends.                     |
| `lstLine`      |      Yes | 1-based listing line associated with the segment.             |
| `line`         |       No | 1-based source line. Use `null` when no source line is known. |
| `column`       |       No | 1-based source column when available.                         |
| `kind`         |       No | Producer's classification of the source item.                 |
| `confidence`   |       No | Producer's confidence in the source association.              |
| `lstText`      |       No | Listing text for this segment.                                |
| `lstTextId`    |       No | Index into the root `lstText` table.                          |
| `includeChain` |       No | Include stack, from outer source toward the included source.  |
| `macro`        |       No | Macro expansion metadata.                                     |

`start` is inclusive and `end` is exclusive. A one-byte instruction at `$0800` uses `start: 2048` and `end: 2049`. A zero-width segment, where `start === end`, can preserve source context for labels or directives but should not be treated as executable code.

`confidence` is a quality hint:

| Value    | Meaning                                                                 |
| -------- | ----------------------------------------------------------------------- |
| `high`   | Direct assembler knowledge, symbol anchor, or exact source attribution. |
| `medium` | Reasonable derived mapping.                                             |
| `low`    | Approximate mapping, often from weak listing information.               |

---

## Symbols

Symbols describe named addresses or constants associated with a source file:

```typescript
interface D8Symbol {
  name: string;
  identity?: string;
  address?: number;
  value?: number;
  line?: number;
  kind?: 'label' | 'constant' | 'data' | 'macro' | 'unknown';
  scope?: 'global' | 'local';
  visibility?: 'exported' | 'source' | 'local';
  sourceUnit?: string;
  size?: number;
}
```

| Field        |    Required | Meaning                                                                          |
| ------------ | ----------: | -------------------------------------------------------------------------------- |
| `name`       |         Yes | Symbol name as written or exported by the producer.                              |
| `identity`   |          No | Stable producer identity for the declaration, independent of display aliases.    |
| `address`    | Conditional | Address for labels and addressable data symbols.                                 |
| `value`      | Conditional | Compile-time value for constants that do not have a source address.              |
| `line`       |          No | 1-based source line where the symbol is defined.                                 |
| `kind`       |          No | Producer's symbol classification.                                                |
| `scope`      |          No | Broad symbol scope hint such as `global` or `local`.                             |
| `visibility` |          No | AZM source-model visibility: exported, source-private, or owner-local.           |
| `sourceUnit` |          No | Logical assembled source unit that owns the declaration across includes.          |
| `size`       |          No | Size in bytes when known.                                                        |

Each symbol must have either `address` or `value`. Constant symbols may use `value` without `address`. Debuggers should not treat value-only constants as source anchors or breakpoint locations.

Debug80 uses symbols with source lines and addresses as anchors during source-map import. It also preserves `identity`, `visibility`, and `sourceUnit` on editor-facing symbol records so definition lookup can disambiguate owner-local and source-private declarations that share short names.

---

## Defaults

`segmentDefaults` and `symbolDefaults` let a producer avoid repeating common fields:

```typescript
interface D8SegmentDefaults {
  kind?: 'code' | 'data' | 'directive' | 'label' | 'macro' | 'unknown';
  confidence?: 'high' | 'medium' | 'low';
}

interface D8SymbolDefaults {
  kind?: 'label' | 'constant' | 'data' | 'macro' | 'unknown';
  scope?: 'global' | 'local';
}
```

Defaults apply only when an individual segment or symbol omits that field.

---

## Memory Layout

`memory` can describe target memory regions:

```typescript
interface D8MemoryLayout {
  segments: Array<{
    name: string;
    start: number;
    end: number;
    kind?: 'rom' | 'ram' | 'io' | 'banked' | 'unknown';
    bank?: number;
  }>;
}
```

Memory segment `start` is inclusive and `end` is exclusive. Consumers may use this for display, validation, or bank-aware lookup. Debuggers that do not need memory layout can ignore it.

Debug80's runtime mapping model can also attach a narrower address-space identity to imported segments and anchors when the launch path already knows which physical bank an auxiliary map belongs to. The current example is TEC-1G multibank expansion ROM support: each generated bank map still uses visible `0x8000-0xBFFF` addresses, while launch metadata records the physical bank so breakpoint and stack lookups can choose the active bank first.

---

## Generator and Diagnostics

`generator` identifies the tool that produced the map:

```typescript
interface D8Generator {
  name?: string;
  tool?: string;
  version?: string;
  args?: string[];
  createdAt?: string;
  inputs?: Record<string, string>;
  entrySymbol?: string;
  entryAddress?: number;
}
```

`diagnostics` records warnings or errors encountered while creating the map:

```typescript
interface D8Diagnostics {
  warnings?: string[];
  errors?: string[];
}
```

Diagnostics are metadata about map generation. A consumer can display them, but should still validate the map structure itself.

---

## Minimum Viable Map

This is enough for a consumer to map address `$0800` through `$0801` back to line 5 of `src/main.asm`:

```json
{
  "format": "d8-debug-map",
  "version": 1,
  "arch": "z80",
  "addressWidth": 16,
  "endianness": "little",
  "generator": {
    "name": "example-assembler",
    "version": "1.0"
  },
  "files": {
    "src/main.asm": {
      "segments": [
        {
          "start": 2048,
          "end": 2050,
          "lstLine": 5,
          "line": 5,
          "confidence": "high",
          "kind": "code"
        }
      ],
      "symbols": [
        {
          "name": "start",
          "address": 2048,
          "line": 5,
          "kind": "label",
          "scope": "global"
        }
      ]
    }
  }
}
```

---

## Producer Guidance

Prefer one precise segment for each emitted instruction or data range. Use broader segments only when the producer cannot attribute bytes more exactly.

Write source paths consistently. Mixing absolute paths, relative paths, and generated temporary paths makes debugger lookup weaker.

Use `line: null` or omit `line` when a range cannot be tied to source. Do not invent source lines just to make the file look complete.

Set `confidence` honestly. A debugger can use this to prefer exact native mappings over approximate listing-derived mappings.

Keep unknown future data additive. Producers may include extra fields, but required v1 fields should remain stable so existing consumers can continue to read the map.

---

## Debug80 Consumer Behavior

Debug80 parses and validates D8 maps before importing them. Invalid JSON or schema-level failure disables source-map-backed features until the target is built again. Segment quality warnings do not necessarily abort launch.

If no usable D8 map exists, the expected fix is to build the target again with AZM so a fresh source map is emitted beside the HEX artifact.

For breakpoint binding, Debug80 uses executable segments. Labels, constants, and directive-only rows may still help stack display or symbol lookup, but zero-width or non-executable mappings should not become active breakpoint addresses.
