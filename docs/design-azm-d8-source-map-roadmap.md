# Design: AZM D8 Source Map Roadmap For Debug80

**Status:** Draft discussion  
**Audience:** Debug80 and AZM maintainers  
**Scope:** Future D8/source-map metadata that would make Debug80's editor and
debugger features more useful

## Purpose

Debug80 can already use the D8 map as the source of truth for breakpoints,
source navigation, and Go to Definition. The next useful editor/debugger
features are workspace symbols, compact symbol hovers, source-map freshness
warnings, Run to Cursor, and a more useful VS Code Variables panel.

Most of those features work best when Debug80 does not guess. AZM is the tool
that understands the assembled program, declarations, storage directives,
layout types, enums, routine contracts, and included source graph. This document
collects source-map metadata that would let Debug80 present that information
accurately without building a second partial assembler inside the extension.

This is not a request to change the D8 format immediately. It is a roadmap of
useful additions that can be considered as AZM and Debug80 evolve together.

## Current D8 Information

Debug80's current D8 support gives it enough information for basic source
debugging:

- source files in the built target graph;
- address-to-source segments;
- symbol definitions;
- symbol kind: `label`, `constant`, `data`, `macro`, or `unknown`;
- symbol address or value;
- symbol source line;
- optional symbol scope;
- optional data symbol size;
- memory regions;
- generator metadata.

This is already enough for:

- source breakpoints;
- stepping back to source;
- Go to Definition for labels, routines, constants, and data symbols;
- basic workspace symbol search;
- compact symbol hovers with address/value and source location;
- best-effort source-map freshness warnings.

The main gap is that Debug80 cannot reliably answer richer questions such as
"is this symbol a byte, a word, a reserved buffer, a string, a layout instance,
or a routine?" unless AZM emits that distinction.

## Near-Term Debug80 Features

### Run To Cursor

Run to Cursor does not need new AZM metadata. Debug80 can resolve the selected
source line through existing D8 segments, set a temporary breakpoint, continue,
and remove the temporary breakpoint when it is hit.

The user interface should be VS Code's normal editor/debug action rather than a
custom Debug80 button.

### Workspace Symbols

Workspace symbols can also start with current D8 data. Debug80 should expose
symbols from the active target only, because a Debug80 session works on one
selected target at a time.

The useful future improvement is richer symbol classification. If AZM can
distinguish routines, data declarations, constants, enums, enum members, layout
types, layout fields, ops, and imported interface symbols, Debug80 can make the
symbol list much clearer and easier to search.

### Compact Hovers

Debug80 can show small hovers today:

```text
PACMO_PAUSED
data $4380
src/pacmo/state.z80:42
```

For routines, the ideal hover includes one compact AZMDoc contract line:

```text
POLL_INPUT_AND_UPDATE
routine $412A
in: A, HL    out: carry    clobbers: BC
```

Debug80 should not parse long comment blocks to infer this. AZM should
eventually emit routine documentation and register-care contract metadata in a
structured form.

### Source Map Freshness

Debug80 should avoid exposing "D8" terminology in user-facing warnings. The UI
should say "source map" or "build map":

- `Source map missing. Build the target first.`
- `Source map may be stale. Build again if navigation looks wrong.`

Current D8 `generator.inputs`, file metadata, and source file paths are enough
for basic checks. A stronger version would include enough source-file hashes or
timestamps to determine whether the source map was produced from the current
source files.

### Symbolic Variables Panel

The Variables panel is where richer D8 metadata becomes most valuable.

Debug80 can already show a conservative view:

```text
Symbols
  PACMO_PAUSED    $4380  byte=$00
  PLAYER_X        $4381  byte=$12
  GAME_LOOP       $4060

Constants
  SCREEN_WIDTH    $20 / 32
```

Without declaration metadata, Debug80 has to be cautious. It can read memory at
an address and display bytes, but it cannot know whether those bytes represent a
single byte, a word, a string, an array, a pointer, a layout instance, or just
scratch storage.

The practical fallback is:

- constants: show value in hex and decimal;
- labels/routines: show address only;
- data symbols with `size = 1`: show one byte;
- data symbols with `size = 2`: show byte and little-endian word;
- data symbols with larger `size`: show first N bytes and optional printable
  ASCII preview;
- data symbols with no size: show address and first byte, with an expandable
  raw memory preview.

This is useful, but richer AZM metadata would make it much better.

## Recommended D8 Additions

### 1. Richer Symbol Kinds

Current symbol kinds are intentionally broad. Debug80 would benefit from more
specific kinds, either by expanding `kind` or by adding a separate `subkind`.

Useful categories:

- `routine`
- `code-label`
- `data`
- `constant`
- `enum`
- `enum-member`
- `layout-type`
- `layout-field`
- `op`
- `macro`
- `interface-routine`
- `imported-symbol`

This would improve workspace symbols, hovers, outline views, and Variables
panel grouping.

### 2. Declaration And Storage Metadata

For memory-backed symbols, Debug80 needs to know how the symbol was declared.
The most useful metadata would be a storage description:

```json
{
  "name": "PLAYER_X",
  "address": 17281,
  "kind": "data",
  "size": 1,
  "storage": {
    "directive": ".db",
    "unit": "byte",
    "count": 1
  }
}
```

Examples:

- `.db 1, 2, 3`: unit `byte`, count `3`;
- `.dw Start`: unit `word`, count `1`;
- `.ds 32`: unit `byte`, count `32`, reserved `true`;
- `.ds word[8]`: unit `word`, count `8`;
- `.field Sprite`: layout reference `Sprite`;
- `.field byte[16]`: unit `byte`, count `16`.

This would let Debug80 choose a sane default display without pretending to know
more than the assembler knows.

### 3. Display Hints

Some symbols should be shown as strings, pointers, buffers, bitfields, or typed
layout instances. Debug80 can offer manual display modes, but AZM-provided hints
would be better.

Possible fields:

```json
{
  "display": {
    "preferred": "ascii",
    "fallback": "bytes",
    "maxPreviewBytes": 32
  }
}
```

Useful display modes:

- `byte`
- `word`
- `address`
- `bytes`
- `ascii`
- `zstring`
- `bitfield`
- `layout`
- `enum`

These should be hints, not hard requirements. Debug80 should still let the user
inspect raw memory.

### 4. Layout Type Metadata

AZM layout types are especially useful for debugger presentation. If AZM emits
layout definitions, Debug80 can show structured memory without guessing.

Useful metadata:

- type name;
- total size;
- field names;
- field offsets;
- field sizes;
- field scalar type or layout type;
- array counts;
- union variants.

Example shape:

```json
{
  "types": {
    "Sprite": {
      "kind": "layout",
      "size": 8,
      "fields": [
        { "name": "x", "offset": 0, "type": "byte", "size": 1 },
        { "name": "y", "offset": 1, "type": "byte", "size": 1 },
        { "name": "tile", "offset": 2, "type": "byte", "size": 1 },
        { "name": "flags", "offset": 3, "type": "byte", "size": 1 }
      ]
    }
  }
}
```

Then a symbol could reference it:

```json
{
  "name": "PLAYER",
  "address": 17408,
  "kind": "data",
  "size": 8,
  "typeRef": "Sprite"
}
```

This would unlock expandable structured variables in the VS Code Variables
panel.

### 5. Enum Metadata

Enum metadata would improve hovers, completions, workspace symbols, and display
of enum-valued memory.

Useful metadata:

- enum name;
- member names;
- member values;
- source locations;
- optional width/display hint.

Example:

```json
{
  "enums": {
    "GameMode": {
      "members": [
        { "name": "Title", "value": 0, "line": 12 },
        { "name": "Playing", "value": 1, "line": 12 },
        { "name": "Paused", "value": 2, "line": 12 }
      ]
    }
  }
}
```

### 6. Routine Contract Metadata

AZMDoc and register-care contracts should eventually be emitted as structured
routine metadata.

Useful fields:

```json
{
  "name": "CheckTile",
  "address": 16640,
  "kind": "routine",
  "contract": {
    "in": ["A", "HL"],
    "out": ["carry"],
    "clobbers": ["B"],
    "preserves": ["DE", "IX"]
  },
  "documentation": {
    "summary": "Checks whether the current tile is blocked.",
    "sourceRange": {
      "file": "src/collision.z80",
      "startLine": 20,
      "endLine": 24
    }
  }
}
```

This would support compact hovers, routine outline summaries, call-site help,
and future diagnostics without Debug80 parsing comment blocks.

### 7. Reference Information

Go to Definition works with current symbol definitions. Find All References
would be better if AZM emitted references directly, because AZM understands
macros, aliases, layout casts, enum member paths, and included source.

Reference records could include:

- symbol name;
- source file;
- line and column;
- reference kind: read, write, call, jump, address-taken, constant-use,
  enum-use, type-use;
- resolved target symbol if known.

This is not required for the first version of workspace symbols or hovers, but
it would make reference search much more accurate.

### 8. Source Columns And Ranges

Current line-level navigation is useful, but column/range data would make editor
features feel more precise.

Useful additions:

- symbol definition column;
- symbol definition length;
- reference column/range;
- documentation block range;
- declaration range separate from name range.

This would improve Go to Definition, Peek Definition, hovers, rename safety,
and diagnostics.

### 9. Source Graph And Freshness Metadata

Debug80 should be able to tell the user whether the source map may be stale
without using assembler-specific assumptions.

Useful metadata:

- project root used by AZM;
- entry file;
- all source files included in the build;
- file hashes at build time;
- include edges;
- AZM version and command/options;
- register-care mode used for the build.

The current `generator` and file `meta.sha256` fields already point in this
direction. The goal is to make the data complete and consistent enough that
Debug80 can explain "source map stale" clearly.

## Suggested Priority

The most valuable additions for Debug80 are:

1. **Declaration/storage metadata for data symbols**  
   This directly improves the Variables panel and memory display.

2. **Routine contract metadata**  
   This enables compact, useful hovers and makes AZMDoc/register-care visible
   inside the editor.

3. **Richer symbol kinds**  
   This improves workspace symbols, grouping, hovers, and outline views.

4. **Source columns/ranges**  
   This makes navigation and hovers feel polished.

5. **Layout and enum metadata**  
   This unlocks structured memory views and better AZM language integration.

6. **Reference records**  
   This supports accurate Find All References and future refactoring.

7. **Complete source graph/freshness metadata**  
   This improves user-facing source-map stale/missing explanations.

## Debug80 Fallback Rules

Debug80 should remain useful even before AZM emits all of this metadata:

- If no source map exists, ask the user to build.
- If the source map may be stale, warn but still use it.
- If a symbol has no type/storage metadata, show raw bytes rather than guessing.
- If a symbol has an address but no size, show a small expandable memory preview.
- If a symbol is value-only, show it as a constant and do not treat it as a
  breakpoint or memory location.
- If routine contracts are unavailable, show only name/address/source location.
- If layout metadata is unavailable, do not invent a structure from source text.

These rules keep Debug80 honest while still allowing the editor experience to
improve as AZM emits richer data.
