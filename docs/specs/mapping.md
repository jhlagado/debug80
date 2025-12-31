This specification defines a deterministic way to extract source mapping from an assembler `.LST` file and (optionally) refine it using `.asm` sources. It is conservative and explicit about uncertainty.

---

# Specification: LST-Based Source Map Extraction

## 1. Purpose

Extract address-to-source mapping from a `.LST` file and emit a structured mapping suitable for source-level debugging (stepping, breakpoints, highlighting).

Assumed listing features:

* emitted addresses and bytes
* echoed source text
* a symbol table with `DEFINED AT LINE ... IN file.asm`

The output does not need to be perfect; it must be deterministic and honest about confidence.

---

## 2. Inputs

### 2.1 Required

* A single `.LST` file.

### 2.2 Optional (Layer 2 only)

* `.asm` files referenced by the symbol table.
* optional `sourceRoots` (ordered list of directories) for resolving source files beyond the `.LST` directory.

---

## 3. Output

### 3.1 Address Map (Dense)

```
[
  {
    startAddr: number,
    endAddr: number,
    asmText: string,
    lstLineNumber: number,
    file: string | null,
    line: number | null,
    confidence: "HIGH" | "MEDIUM" | "LOW"
  },
  ...
]
```

### 3.2 Symbol Anchor Map (Sparse)

```
{
  address: {
    symbol: string,
    file: string,
    line: number
  },
  ...
}
```

---

## 4. LST Structure and Boundary Rule

Assume the `.LST` contains, in order:

1. Header/preamble (ignored)
2. Listing body
3. Symbol table
4. Optional footer

Boundary rule (deterministic): the first line containing `DEFINED AT LINE` begins symbol-table mode. Once symbol-table mode starts, parse only symbol entries and ignore any later listing-body lines. Symbol table entries remain the primary anchor input; the boundary rule only defines when to switch modes.

---

## 5. Pass 1: Listing Body Parsing

### 5.1 Identify Listing Lines

A listing body line begins with a hex address (typically 4 hex digits) followed by whitespace.

Example:

```
0AB0  CD 27 01   CALL PRINTLINE
```

### 5.2 Extract Fields (Deterministic Split)

For each listing line:

1. Read `startAddr` from the leading hex address.
2. Look at the remainder after the address.
3. If the remainder starts with a 2-hex-digit byte token (regex `^[0-9A-Fa-f]{2}$`), consume consecutive byte tokens separated by whitespace to form the byte list.
4. The rest of the line (after the byte tokens), trimmed of trailing whitespace, is `asmText`.
5. If the remainder does not start with a byte token, treat the remainder as pure `asmText` and set `byteCount = 0`.

Fields:

* `startAddr`: hex -> integer
* `byteCount`: number of byte tokens immediately after the address
* `endAddr`: `startAddr + byteCount`
* `asmText`: printed text (trim trailing whitespace)
* `lstLineNumber`: 1-based physical line number

Store entries in listing order.

### 5.3 Rules

* Listing order is authoritative for parsing and file inference; addresses may repeat or jump (ORG).
* Do not infer addresses from symbols.
* Multiple lines may share the same address (labels/comments/macro markers); keep them in order.
* Lines with zero emitted bytes are valid markers (`startAddr == endAddr`). Mnemonics like `DB` are not byte tokens and therefore yield `byteCount = 0`.

---

## 6. Pass 2: Symbol Table Parsing

### 6.1 Identify Entries

```
SYMBOL_NAME: 0AB0 DEFINED AT LINE 367 IN game.asm
```

### 6.2 Extract Fields

* `symbol`
* `address` (hex)
* `file` (as written in the LST)
* `line` (1-based)

If the address token is not a plain hex value (for example, `00-1`), skip that symbol for anchors.

### 6.3 Ignore Usage Records

Lines like:

```
> USED AT LINE 123 IN file.asm
```

are cross-reference metadata only and must not affect mapping.

### 6.4 File Resolution (Layer 2)

When opening `.asm` files for Layer 2, resolve `file` relative to the `.LST` directory unless it is already absolute. If `sourceRoots` is provided, resolve in order: `[lstDir, ...sourceRoots]`. Do not search include paths unless explicitly provided as an extra input.

If a referenced `.asm` file cannot be found, Layer 2 must skip that file and keep Layer 1 mappings intact. Missing source files are non-fatal and should be recorded or surfaced to the user, but must not abort parsing.

---

## 7. Anchor Construction

```
anchorByAddress[address] = { symbol, file, line }
```

If multiple anchors claim the same address, choose deterministically (first seen) and downgrade that address to MEDIUM confidence.

---

## 8. Attaching Source Info to Entries (Layer 1)

Iterate listing entries in `lstLineNumber` order. Maintain:

* `currentFile` (string | null)
* `currentLineHint` (number | null)

### 8.1 Anchor Hit (HIGH)

If `entry.startAddr` has an anchor:

* `file = anchor.file`, `line = anchor.line`, `confidence = HIGH`
* update `currentFile` and `currentLineHint`
* if multiple entries share the same address, only the first (lowest `lstLineNumber`) consumes the anchor

### 8.2 Between Anchors (MEDIUM)

If a prior anchor exists:

* `file = currentFile`, `line = null`, `confidence = MEDIUM`

### 8.3 Before Any Anchor (LOW)

* `file = null`, `line = null`, `confidence = LOW`

---

## 9. Address-to-Location and Breakpoints (Recommended Consumption)

To support stepping and breakpoints:

* Build `address -> location` by using only entries with `byteCount > 0`.
* For each entry with `byteCount > 0`, map every address in `[startAddr, endAddr)` to that entry's location.
* If multiple entries map to the same address, prefer the first byte-emitting entry at that address (lowest `lstLineNumber`). Ignore zero-byte markers for address ownership.
* For breakpoints on a `file:line`, choose the lowest `lstLineNumber` entry whose `(file,line)` matches; if none exist, fall back to the nearest anchor in that file.

---

## 10. Confidence Semantics

* HIGH: exact symbol-defined location
* MEDIUM: known file, unknown line
* LOW: no reliable provenance or non-code regions

---

## 11. Non-Goals

Do not:

* resolve macro expansions
* assume one instruction == one source line
* infer addresses from `USED AT`
* hide uncertainty
* normalize text beyond trimming whitespace (Layer 1)

---

## 12. Determinism

Same `.LST` in -> same entries, anchors, and confidence labels out. No external state.

---

## 13. Summary

1. Trust addresses.
2. Trust symbol definitions.
3. Attach provenance conservatively.
4. Mark uncertainty explicitly.

---

# Appendix A: Layer 2 (Optional) - Matching `.asm`

## A.1 Purpose

Upgrade MEDIUM entries to line-accurate mappings when possible using the `.asm` sources referenced by anchors.

## A.2 Inputs

Required:

* Layer 1 AddressMap entries: `startAddr`, `endAddr`, `asmText`, `file`, `line`, `confidence`, `lstLineNumber`
* `anchorByAddress`
* full text of `.asm` files referenced by anchors

Optional:

* a main include-order file for search bias

## A.3 Output

Same structures; `line` and `confidence` may be updated.

## A.4 Normalization (deterministic)

`normalizeAsm(s)`:

1. strip trailing `;` comments (ignore `;` inside quotes)
2. trim
3. collapse whitespace
4. uppercase
5. remove spaces around commas
6. tighten spaces around `+ - * / ( )`
7. empty -> empty

No label rewriting, macro expansion, or expression evaluation.

## A.5 Matching Algorithm

### A.5.1 Preprocess

* load each file; keep original + normalized lines (1-based physical lines, including blank/comment-only lines)

### A.5.2 Anchor Alignment

If an AddressMap entry starts at an anchor address, force that entry to `(file,line,HIGH)`.

### A.5.3 Within-Region Matching

For each entry in a file region:

* `t = normalizeAsm(asmText)`; skip if empty
* search window around `hintLine` if known, else whole file
  * `W_before = 40`, `W_after = 200`
* exact match only
* tie-break: smallest `i >= hintLine`, else smallest `i`
* if ambiguous -> MEDIUM; else HIGH
* update `hintLine`

If no match, keep prior line/confidence (except data/macro rules below).

### A.5.4 Progress Guarantee

If a match jumps backward more than 80 lines, reject or downgrade to LOW.

## A.6 Data/Macro Heuristics

If `normalizeAsm(asmText)` starts with `DB`, `DW`, `DS`, `DEFB`, `DEFW`, `DEFS`, `INCBIN`, default to LOW unless anchored.

If the LST indicates macro expansion, do not invent a line. In asm80 listings, macro expansions are marked by `;*Macro unroll: NAME` lines. Treat the marker line as non-matchable, and treat subsequent byte-emitting lines until the next label-only line (byteCount = 0 and `asmText` ends with `:`) or the next anchor as low-confidence candidates unless a direct match is proven.

## A.7 Non-Goals

* macro-to-callsite reconstruction
* perfect line-by-line stepping
* statement-level mapping inside a single `.asm` line

---

# Appendix B: JSON Output Format

## B.1 Example

```json
{
  "version": 1,
  "generatedAt": "2025-12-26T00:00:00Z",
  "addressRadix": 16,
  "segments": [
    {
      "start": 2736,
      "end": 2743,
      "loc": { "file": "game.asm", "line": 367 },
      "lst": { "line": 1234, "text": "CALL PRINTLINE" },
      "confidence": "HIGH"
    }
  ],
  "anchors": [
    { "address": 2736, "symbol": "PRINTLINE", "file": "game.asm", "line": 367 }
  ]
}
```

Notes:

* addresses are integers (not hex strings)
* `end` is exclusive
* `line` is 1-based

## B.2 Invariants

* `segments` sorted by `start` (tie-break by `lst.line`)
* no overlaps
* `end >= start`
* zero-length segments are permitted; you may omit them if only byte-emitting lines matter
* `anchors` may be unsorted
* `loc.line` may be null

---

# Appendix C: JSON Schema (Draft 2020-12)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://example.invalid/schemas/z80-lst-sourcemap.schema.json",
  "title": "Z80 LST Source Map",
  "type": "object",
  "required": ["version", "addressRadix", "segments", "anchors"],
  "properties": {
    "version": { "type": "integer", "const": 1 },
    "generatedAt": { "type": "string" },
    "addressRadix": { "type": "integer", "enum": [16] },
    "segments": {
      "type": "array",
      "items": { "$ref": "#/$defs/segment" }
    },
    "anchors": {
      "type": "array",
      "items": { "$ref": "#/$defs/anchor" }
    }
  },
  "$defs": {
    "confidence": {
      "type": "string",
      "enum": ["HIGH", "MEDIUM", "LOW"]
    },
    "location": {
      "type": "object",
      "required": ["file"],
      "properties": {
        "file": { "type": ["string", "null"] },
        "line": { "type": ["integer", "null"], "minimum": 1 }
      },
      "additionalProperties": false
    },
    "lstInfo": {
      "type": "object",
      "required": ["line", "text"],
      "properties": {
        "line": { "type": "integer", "minimum": 1 },
        "text": { "type": "string" }
      },
      "additionalProperties": false
    },
    "segment": {
      "type": "object",
      "required": ["start", "end", "loc", "lst", "confidence"],
      "properties": {
        "start": { "type": "integer", "minimum": 0 },
        "end": { "type": "integer", "minimum": 0 },
        "loc": { "$ref": "#/$defs/location" },
        "lst": { "$ref": "#/$defs/lstInfo" },
        "confidence": { "$ref": "#/$defs/confidence" }
      },
      "additionalProperties": false
    },
    "anchor": {
      "type": "object",
      "required": ["address", "symbol", "file", "line"],
      "properties": {
        "address": { "type": "integer", "minimum": 0 },
        "symbol": { "type": "string" },
        "file": { "type": "string" },
        "line": { "type": "integer", "minimum": 1 }
      },
      "additionalProperties": false
    }
  }
}
```
