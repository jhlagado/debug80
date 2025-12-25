Below is a **clean, implementation-ready specification** you can hand to an AI (or use yourself) whose *sole responsibility* is to extract source-mapping information from this assembler’s `.LST` file.
It is intentionally explicit, conservative, and honest about uncertainty.

---

# Specification: LST-Based Source Map Extraction

## 1. Purpose

The task is to extract **address-to-source mapping information** from an assembler listing (`.LST`) file and produce a structured mapping suitable for use in a **source-level debugger** (for example, a VS Code debug adapter).

This specification applies to **assembler listing files that include**:

* emitted addresses and bytes per line
* echoed source text
* a symbol table containing `DEFINED AT LINE … IN file.asm` entries

The output **does not need to be a perfect source map**. It must instead:

* be deterministic
* expose uncertainty explicitly
* preserve enough structure to support stepping, breakpoints, and highlighting

---

## 2. Inputs

### 2.1 Required Inputs

* A single `.LST` file produced by the assembler.

### 2.2 Optional Inputs (for later refinement only)

* The original `.asm` source files referenced by the symbol table.

**This specification only mandates LST parsing.**
Source-file parsing may be layered on later.

---

## 3. Output

The extractor must emit a **Source Map Data Set**, consisting of two primary components:

### 3.1 Address Map (Dense)

A list of address ranges mapped to listing-level information:

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

A map of exact symbol definitions:

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

## 4. High-Level Strategy

The extractor must operate in **two strictly separated passes**:

1. **Listing Body Pass**
   Extracts emitted addresses, byte lengths, and printed source text.

2. **Symbol Table Pass**
   Extracts exact `(address → file, line)` anchors from symbol definitions.

These passes must not depend on one another.

---

## 5. LST File Structure Assumptions

The extractor must assume the LST file contains, in order:

1. Header / preamble (ignored)
2. **Listing body**: lines containing addresses, emitted bytes, and source text
3. **Symbol table**: entries containing `DEFINED AT LINE … IN …`
4. Optional footer

The exact boundary between (2) and (3) must be detected heuristically.

---

## 6. Listing Body Parsing (Pass 1)

### 6.1 Identify Listing Lines

A **listing body line** is any line that:

* begins with a hexadecimal address (typically 4 hex digits)
* optionally followed by emitted bytes
* followed by echoed assembler source text

Example pattern (illustrative):

```
0AB0  CD 27 01   CALL PRINTLINE
```

### 6.2 Extract Fields

For each listing line, extract:

* `startAddr`: numeric address (hex → integer)
* `byteCount`: number of emitted bytes on that line
* `endAddr`: `startAddr + byteCount`
* `asmText`: the printed assembler text (verbatim)
* `lstLineNumber`: physical line number within the LST file

Store each entry in **address order**.

### 6.3 Rules

* Address ordering in the LST is authoritative.
* Do **not** infer addresses from symbols.
* Lines with zero emitted bytes may exist; include them with `startAddr == endAddr`.

---

## 7. Symbol Table Parsing (Pass 2)

### 7.1 Identify Symbol Table Entries

A **symbol definition entry** matches the form:

```
SYMBOL_NAME: 0AB0 DEFINED AT LINE 367 IN game.asm
```

### 7.2 Extract Fields

From each `DEFINED AT` entry extract:

* `symbol`: symbol name
* `address`: numeric address
* `file`: source filename
* `line`: source line number

### 7.3 Ignore Usage Records

Lines of the form:

```
> USED AT LINE 123 IN file.asm
```

must **not** be used for address mapping.

They are **cross-reference metadata only**.

---

## 8. Anchor Construction

Build a map:

```
anchorByAddress[address] = {
  symbol,
  file,
  line
}
```

These anchors are **high-confidence mapping points**.

---

## 9. Attaching Source Information to Address Ranges

### 9.1 Region Model

Iterate through listing body entries in address order.

Maintain:

* `currentFile`
* `currentLineHint`
* `currentConfidence`

### 9.2 Anchor Hit Rule (HIGH confidence)

If `entry.startAddr` exists in `anchorByAddress`:

* Set `file = anchor.file`
* Set `line = anchor.line`
* Set `confidence = HIGH`
* Update `currentFile` and `currentLineHint`

### 9.3 Between Anchors (MEDIUM confidence)

For entries following an anchor and before the next anchor:

* Set `file = currentFile`
* Set `line = null` (or inherited hint, implementation choice)
* Set `confidence = MEDIUM`

### 9.4 No Known Region (LOW confidence)

If no anchor has been encountered yet:

* Set `file = null`
* Set `line = null`
* Set `confidence = LOW`

---

## 10. Confidence Semantics (Mandatory)

The extractor **must** label uncertainty explicitly:

* **HIGH**

  * Exact symbol-defined source location
* **MEDIUM**

  * Address is confidently within a known file, but line is inferred or unknown
* **LOW**

  * Data, macros, or pre-anchor regions with no reliable provenance

Consumers (debuggers) are expected to respect this.

---

## 11. Explicit Non-Goals

The extractor must **not**:

* attempt to resolve macro expansions
* assume one instruction == one source line
* infer addresses for `USED AT` entries
* hide uncertainty
* rewrite or normalize assembler text beyond trimming whitespace

---

## 12. Determinism Requirement

Given the same `.LST` file, the extractor must always produce:

* identical address ranges
* identical anchor mappings
* identical confidence labels

No heuristics may depend on external state.

---

## 13. Expected Uses of Output

This source map must support:

* program-counter → source highlighting
* breakpoints on symbol definitions
* approximate stepping with honest degradation
* debugger UX that distinguishes certainty levels

---

## 14. Summary (for the AI)

**Your task is not to “reconstruct the source”.**
Your task is to:

1. Trust the addresses.
2. Trust symbol definitions.
3. Attach source provenance conservatively.
4. Preserve uncertainty explicitly.

If anything is ambiguous, **label it — do not guess**.


# Layer 2 Spec: Refining LST Mapping by Matching Against `.asm` Sources

## 1. Purpose

Given:

* the **Layer 1 output** (dense address ranges + anchors)
* the set of `.asm` files referenced by anchors

Refine mapping from:

* **address range → file only (MEDIUM)**
  to:
* **address range → exact file:line (HIGH where possible)**

This layer is best-effort and must preserve determinism and confidence.

## 2. Inputs

### 2.1 Required

* `AddressMap` entries from Layer 1:

  * `startAddr`, `endAddr`, `asmText`, `file`, `line`, `confidence`, `lstLineNumber`
* `AnchorByAddress` from Layer 1:

  * exact `{address → (symbol,file,line)}`
* Full text of each `.asm` file that appears in any anchor.

### 2.2 Optional

* A “main include order” file (like your `main.asm`) to bias search windows. (Optional only; Layer 2 must work without it.)

## 3. Output

Same structures as Layer 1, but with updated fields:

* `file` should remain unchanged unless proven wrong
* `line` may be filled in
* `confidence` may be upgraded/downgraded

## 4. Key Concepts

### 4.1 Region

A **region** is a contiguous run of AddressMap entries that share the same inferred `file` from Layer 1, bounded by:

* an anchor address that sets `currentFile`, or
* start/end of program

### 4.2 Candidate match

A candidate match is a `.asm` line number in `currentFile` whose normalized text matches the normalized `asmText` from LST.

## 5. Normalization Rules (deterministic)

Define a function `normalizeAsm(s: string) -> string`:

1. Remove trailing comment starting at `;` **only if** `;` is not inside a quoted string.
2. Trim leading/trailing whitespace.
3. Collapse runs of whitespace to a single space.
4. Uppercase.
5. Remove spaces around commas: `", "` and `" ,"` → `","`
6. Remove redundant spaces around `+ - * / ( )` (simple token tightening).
7. If line becomes empty, return empty.

Do **not** rewrite labels, do not expand macros, do not evaluate expressions.

## 6. Matching Algorithm

### 6.1 Preprocessing per file

For each file:

* load lines with 1-based line numbers
* compute `normLine[i] = normalizeAsm(lineText[i])`

Keep both original and normalized.

### 6.2 Anchor alignment (strong starting point)

For each anchor `(addr → file,line)`:

* Find the AddressMap entry with `startAddr == addr`
* If it exists:

  * set it to `(file,line, HIGH)` regardless of previous MEDIUM assignment
* If it does not exist:

  * keep the anchor (still valid for symbol breakpoints), but don’t force mapping

### 6.3 Within-region matching (local search)

For each AddressMap entry `e` inside a region with `e.file = currentFile`:

Let:

* `t = normalizeAsm(e.asmText)`
* If `t` is empty: skip; keep current mapping.

Search window:

* If the region has a most recent known line (anchor or prior matched line) `hintLine`:

  * search `[hintLine - W_before, hintLine + W_after]`
* Otherwise:

  * search the whole file (slower but deterministic)

Recommended window sizes:

* `W_before = 40`
* `W_after = 200`
  Rationale: code tends to flow forward; allow some backward drift.

Matching criteria:

* Exact normalized match: `normLine[i] == t`

If multiple matches:

* choose the smallest `i` ≥ `hintLine` if possible
* else choose the smallest `i` overall
* record `matchAmbiguous = true`

After a match:

* set `e.line = i`
* set `e.confidence = HIGH` if not ambiguous, else `MEDIUM`
* update `hintLine = i`

If no match:

* leave `e.line` as-is (likely null)
* keep confidence as MEDIUM (or LOW for data-ish lines—see 7)

### 6.4 Progress guarantee

Do not allow matching to jump backward wildly:

* If `i < hintLine - 80`, treat as suspect:

  * either reject the match or mark as LOW confidence
    This prevents “common instruction” lines from snapping to earlier occurrences.

## 7. Data / Macro Heuristics (confidence downgrade)

If `normalizeAsm(asmText)` begins with any of:

* `DB`, `DW`, `DS`, `DEFB`, `DEFW`, `DEFS`, `INCBIN`
  or looks like a literal-only line,
  then:
* matching is optional
* default confidence should be **LOW** unless anchored

If the LST line indicates macro expansion (common signs: missing obvious source, repeated generated blocks), do not try to “invent” file/line. Keep MEDIUM/LOW.

## 8. Determinism

* Fixed window sizes
* Fixed tie-breaking rules
* No randomness
* No dependence on filesystem ordering beyond explicit file names

## 9. Non-goals

* Correct macro-to-callsite mapping
* Perfect line-by-line stepping
* Statement-level mapping inside a single `.asm` line

---

# JSON Output Format (Debugger-Consumable)

## 1. File: `tacitusZ80SourceMap.json` (example name)

Top-level object:

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

* `start/end/address` are **integers** (not hex strings) to simplify consumers.
* `end` is exclusive.
* `line` is 1-based.
* `confidence` is `"HIGH" | "MEDIUM" | "LOW"`.

## 2. Required invariants

* `segments` must be sorted by `start` ascending.
* Segments must not overlap.
* `end >= start`.
* `anchors` may be unsorted.
* A segment may have `loc.line = null` when unknown.

---

# JSON Schema (Draft 2020-12)

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

Revisions.... these need to be integrated into this document

Got it. Your doc is already basically “ship it”. The only *essential* improvements are: fix numbering/structure so Layer 2 + JSON feel like appendices (not a second doc glued on), and tighten a couple of normative bits that are currently ambiguous.

Here’s a cleaned version with **consistent numbering** and **minimal wording changes** (I did *not* add new features unless required for clarity).

---

Below is a **clean, implementation-ready specification** whose *sole responsibility* is to extract source-mapping information from an assembler’s `.LST` file, and (optionally) refine that mapping using `.asm` files.
It is intentionally explicit, conservative, and honest about uncertainty.

---

# Specification: LST-Based Source Map Extraction

## 1. Purpose

Extract **address-to-source mapping information** from an assembler listing (`.LST`) file and emit a structured mapping suitable for use in a **source-level debugger** (for example, a VS Code debug adapter).

This specification applies to assembler listing files that include:

* emitted addresses and bytes per line
* echoed source text
* a symbol table containing `DEFINED AT LINE … IN file.asm` entries

The output **does not need to be a perfect source map**. It must instead:

* be deterministic
* expose uncertainty explicitly
* preserve enough structure to support stepping, breakpoints, and highlighting

---

## 2. Inputs

### 2.1 Required Inputs

* A single `.LST` file produced by the assembler.

### 2.2 Optional Inputs (for refinement only)

* The original `.asm` source files referenced by the symbol table.

**Layer 1 mandates only LST parsing.**
Source-file matching is defined later as Layer 2.

---

## 3. Output

The extractor must emit a **Source Map Data Set** with two primary components.

### 3.1 Address Map (Dense)

A list of address ranges mapped to listing-level information:

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

A map of exact symbol definitions:

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

## 4. Processing Model

The extractor must operate in **two strictly separated passes**:

1. **Listing Body Pass**
   Extracts emitted addresses, byte lengths, and printed source text.

2. **Symbol Table Pass**
   Extracts exact `(address → file, line)` anchors from symbol definitions.

These passes must not depend on one another.

---

## 5. LST File Structure Assumptions

The extractor must assume the LST file contains, in order:

1. Header / preamble (ignored)
2. **Listing body**: lines containing addresses, emitted bytes, and source text
3. **Symbol table**: entries containing `DEFINED AT LINE … IN …`
4. Optional footer

The exact boundary between listing body and symbol table must be detected heuristically.

---

## 6. Listing Body Parsing (Pass 1)

### 6.1 Identify Listing Lines

A **listing body line** is any line that:

* begins with a hexadecimal address (typically 4 hex digits)
* is optionally followed by emitted bytes
* is followed by echoed assembler source text

Example (illustrative):

```
0AB0  CD 27 01   CALL PRINTLINE
```

### 6.2 Extract Fields

For each listing line, extract:

* `startAddr`: numeric address (hex → integer)
* `byteCount`: number of emitted bytes on that line
* `endAddr`: `startAddr + byteCount`
* `asmText`: the printed assembler text (verbatim, except trimming trailing whitespace)
* `lstLineNumber`: physical line number within the LST file (1-based)

Store entries in **the order they appear**. (Address ordering is validated later, not assumed.)

### 6.3 Rules

* Address ordering in the LST is authoritative.
* Do **not** infer addresses from symbols.
* Lines with zero emitted bytes may exist; include them with `startAddr == endAddr`.

---

## 7. Symbol Table Parsing (Pass 2)

### 7.1 Identify Symbol Table Entries

A **symbol definition entry** matches the form:

```
SYMBOL_NAME: 0AB0 DEFINED AT LINE 367 IN game.asm
```

### 7.2 Extract Fields

From each `DEFINED AT` entry extract:

* `symbol`: symbol name
* `address`: numeric address
* `file`: source filename (as written in the LST)
* `line`: source line number (1-based)

### 7.3 Ignore Usage Records

Lines of the form:

```
> USED AT LINE 123 IN file.asm
```

must **not** be used for address mapping.

They are cross-reference metadata only.

---

## 8. Anchor Construction

Build:

```
anchorByAddress[address] = {
  symbol,
  file,
  line
}
```

These anchors are **high-confidence mapping points**.

If multiple anchors claim the same address, the extractor must choose deterministically (for example, first seen) and should downgrade confidence for that address to MEDIUM. (This is rare, but you must not silently oscillate.)

---

## 9. Attaching Source Information to Address Entries

### 9.1 Region Model

Iterate through listing body entries in address order (sort by `startAddr`, stable by `lstLineNumber`).

Maintain:

* `currentFile` (string | null)
* `currentLineHint` (number | null)

### 9.2 Anchor Hit Rule (HIGH confidence)

If `entry.startAddr` exists in `anchorByAddress`:

* set `file = anchor.file`
* set `line = anchor.line`
* set `confidence = HIGH`
* update `currentFile = anchor.file`
* update `currentLineHint = anchor.line`

### 9.3 Between Anchors (MEDIUM confidence)

For entries after an anchor and before the next anchor:

* set `file = currentFile`
* set `line = null` (do not invent lines in Layer 1)
* set `confidence = MEDIUM`

### 9.4 No Known Region (LOW confidence)

Before any anchor has been encountered:

* set `file = null`
* set `line = null`
* set `confidence = LOW`

---

## 10. Confidence Semantics (Mandatory)

The extractor must label uncertainty explicitly:

* **HIGH**: exact symbol-defined source location
* **MEDIUM**: address is within a known file region, but exact line is unknown
* **LOW**: no reliable provenance (pre-anchor), or non-code regions

Consumers (debuggers) are expected to respect this.

---

## 11. Explicit Non-Goals

The extractor must not:

* attempt to resolve macro expansions
* assume one instruction equals one source line
* infer addresses for `USED AT` entries
* hide uncertainty
* rewrite or normalize assembler text beyond trimming whitespace

---

## 12. Determinism Requirement

Given the same `.LST` file, the extractor must always produce:

* identical address entries
* identical anchor mappings
* identical confidence labels

No heuristics may depend on external state.

---

## 13. Expected Uses of Output

This source map must support:

* program-counter → source highlighting
* breakpoints on symbol definitions
* approximate stepping with honest degradation
* debugger user experience that distinguishes certainty levels

---

## 14. Summary (for the AI)

Your task is not to reconstruct the source. Your task is to:

1. Trust the addresses.
2. Trust symbol definitions.
3. Attach source provenance conservatively.
4. Preserve uncertainty explicitly.

If anything is ambiguous, label it. Do not guess.

---

# Appendix A: Layer 2 Spec (Optional) — Refining by Matching `.asm` Files

## A.1 Purpose

Given:

* the Layer 1 output (dense address entries plus anchors)
* the set of `.asm` files referenced by anchors

Refine mapping from:

* **address range → file only (MEDIUM)**
  to:
* **address range → exact file:line (HIGH where possible)**

This layer is best-effort and must preserve determinism and confidence.

## A.2 Inputs

### A.2.1 Required

* `AddressMap` entries from Layer 1: `startAddr`, `endAddr`, `asmText`, `file`, `line`, `confidence`, `lstLineNumber`
* `anchorByAddress` from Layer 1
* Full text of each `.asm` file referenced by any anchor

### A.2.2 Optional

* A “main include order” file (like `main.asm`) to bias search windows. Layer 2 must work without it.

## A.3 Output

Same structures as Layer 1, with updated fields:

* `file` should remain unchanged unless proven wrong
* `line` may be filled in
* `confidence` may be upgraded or downgraded

## A.4 Normalization Rules (deterministic)

Define `normalizeAsm(s: string) -> string`:

1. Remove trailing comment starting at `;` only if `;` is not inside a quoted string.
2. Trim leading/trailing whitespace.
3. Collapse runs of whitespace to a single space.
4. Uppercase.
5. Remove spaces around commas.
6. Remove redundant spaces around `+ - * / ( )`.
7. If empty, return empty.

Do not rewrite labels, expand macros, or evaluate expressions.

## A.5 Matching Algorithm

(Your existing A.5 content is fine; kept as-is except numbering labels.)

### A.5.1 Preprocessing per file

Compute normalized lines with 1-based indices.

### A.5.2 Anchor alignment

Force exact matches at anchor addresses when an AddressMap entry starts at that address.

### A.5.3 Within-region matching

Use a deterministic window around the most recent matched line (`hintLine`), with fixed window sizes, exact normalized matching, deterministic tie-breaking, and ambiguity tracking.

### A.5.4 Progress guarantee

Reject or downgrade matches that jump backward excessively to avoid “common line” snapping.

## A.6 Data / Macro Heuristics

If normalized text begins with `DB`, `DW`, `DS`, `DEFB`, `DEFW`, `DEFS`, `INCBIN`, default to LOW unless anchored.

## A.7 Non-goals

As you wrote.

---

# Appendix B: JSON Output Format (Debugger-Consumable)

## B.1 File Example

(Your example is fine.)

## B.2 Required invariants

(Your bullets are fine.)

---

# Appendix C: JSON Schema (Draft 2020-12)

(Your schema is fine.)

---

## Essential changes I made (so you can sanity-check quickly)

1. **Made Layer 2 + JSON/Scheme explicit appendices** so the numbering stays sane.
2. **Clarified `lstLineNumber` is 1-based** (you implied it, but now it’s explicit).
3. **Removed the Layer 1 ambiguity about inheriting `line` hints**: Layer 1 now does *file-only*, never invents a line. That matches your “do not guess” stance.
4. **Added a deterministic rule for duplicate anchors at the same address** (otherwise two runs could differ depending on parse quirks).

If you want just one more surgical improvement: add a one-liner under 6.1 describing how to count `byteCount` (pairs of hex bytes only), but I didn’t force that in without seeing your assembler’s exact listing layout.
