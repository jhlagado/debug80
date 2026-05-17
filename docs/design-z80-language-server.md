# Design: Z80 Assembly Language Server

**Status:** Draft
**Type:** Additive editor tooling
**Scope:** `.asm`, `.z80`, `.a80`, `.s`, and later `.zax` where the dialect overlap is safe

---

## Motivation

Debug80 now owns the Z80 assembly language contribution and TextMate grammar for common
assembly source files. Syntax highlighting is useful, but it is still regex-based and has no
project understanding. A language server would let Debug80 provide structured editing support
for assembly source without coupling those features directly to the debug adapter or webview.

The goal is not to build a full replacement assembler inside the extension. The goal is to
provide a tolerant language service that understands enough source structure to make old and
new Z80 projects easier to navigate, edit, and debug.

---

## What An LSP Could Offer

### Diagnostics

Initial diagnostics should be lightweight and conservative:

- duplicate label definitions in the same resolved source set
- undefined label references where the reference is unambiguous
- unknown Z80 mnemonic
- unknown register or condition code in obvious instruction positions
- malformed numeric literals
- missing include files
- out-of-range `JR` / `DJNZ` targets once expressions can be resolved
- optional warning when a source file is outside the selected Debug80 project target graph

Diagnostics should avoid pretending to be the assembler. Any dialect-sensitive or macro-heavy
line that cannot be parsed confidently should be skipped rather than marked wrong.

### Navigation

High-value navigation features:

- **Go to Definition** for labels, constants, macro names, and include files.
- **Find References** for labels/constants/macros across the active project target.
- **Document Symbols** for labels, constants, macros, sections, and routine comment headers.
- **Workspace Symbols** for fast label search across Debug80 projects.

These features would be valuable even before deeper semantic diagnostics exist.

### Completion

Useful completions:

- Z80 mnemonics
- registers and condition codes
- known labels and constants
- include paths relative to the current source and project source roots
- assembler directives for the selected backend
- optional platform symbols, ports, or monitor routines where Debug80 has platform metadata

Completion should be project-aware. For example, the active `debug80.json` target should
determine which files and labels are visible by default.

### Hover

Hover can add value without being intrusive:

- opcode summary and legal operand forms
- register/flag descriptions
- label definition location
- resolved numeric values in decimal/hex/binary
- assembled address from the latest map/debug data where available
- include target path
- routine comment header summary, e.g. `Input`, `Output`, `Clobbers`

Address-aware hover should be best-effort and clearly dependent on the latest successful
build/map. It should not imply that stale maps are authoritative.

### Rename And Code Actions

Rename is valuable but should be delayed until symbol resolution is reliable. A wrong rename in
assembly is costly.

Possible later code actions:

- rename label
- create missing label
- convert numeric literal between decimal/hex/binary
- add missing include
- set current source as Debug80 target
- open or refresh project configuration

---

## Proposed Architecture

### Extension Host Client

Debug80 would register an LSP client from the extension host for the assembly language IDs it
owns:

- `z80-asm`
- possibly `zax` later, if the server has explicit ZAX dialect support

The client should pass workspace/project context to the server:

- workspace folders
- active Debug80 project folder, if selected
- active target name and source file
- `debug80.json` path
- assembler backend (`asm80`, `zax`, future backends)
- source roots and include roots
- latest known map/debug-map path, if available

This keeps the server editor-focused while still letting it use Debug80 project knowledge.

### Server Process

Use the standard `vscode-languageclient` / `vscode-languageserver` split:

- `src/lsp/client.ts` in the extension host
- `src/lsp/server.ts` for the language server entry point
- shared parser/index modules under `src/lsp/assembly/` or `src/language/`

The server should be a separate Node process, not run inside the debug adapter. That keeps
LSP latency, crashes, and parser state independent of active debug sessions.

### Parser And Index

The first parser should be tolerant and line-oriented:

- strip comments and strings safely
- recognize labels at line start
- recognize constants/directives
- recognize include directives
- recognize mnemonics and operands enough to find symbol-like tokens
- preserve source ranges for all extracted symbols/references

The index should track:

- documents currently open in VS Code
- parsed files discovered through include/source roots
- symbol definitions
- references
- include edges
- simple expression values where safely resolvable
- parse version per document

The parser should not expand complex macros in the first version. Macro definitions and macro
invocations can be indexed as symbols, but semantic expansion should wait.

---

## Dialect Strategy

Debug80 currently supports multiple assembler realities:

- asm80-style sources
- ZAX sources
- inherited TEC monitor sources and older Z80 style

The LSP should model dialects explicitly instead of assuming one universal grammar:

- **Core Z80 dialect:** mnemonics, registers, conditions, common number formats, labels.
- **asm80 profile:** asm80 directives and include rules.
- **ZAX profile:** ZAX directives and any stricter syntax rules.
- **Legacy/common profile:** permissive handling for old source files.

The selected Debug80 target should choose the active profile. Standalone files without a
project can use the common permissive profile.

---

## Relationship To TextMate Grammar

TextMate remains responsible for immediate lexical colouring. The LSP can add semantic tokens
later, but that should not be the first milestone.

Short-term relationship:

- TextMate handles syntax highlighting.
- LSP handles structure, navigation, diagnostics, completion, and hover.

Later, LSP semantic tokens could distinguish:

- definition vs reference labels
- constants vs labels
- macros vs routines
- unresolved symbols
- platform symbols
- addresses known from maps

Semantic tokens should be additive and must not make files look worse when the server is still
indexing.

---

## Debug80 Integration Opportunities

The language server becomes more useful when it can use Debug80’s existing project data:

- use `debug80.json` targets to define the source graph
- use source roots to resolve includes and sibling files
- use the latest `.d8.json` debug map to show addresses
- warn when a breakpoint is on a line with no mapped executable code
- expose code lenses for routine addresses or target entry points
- complete platform-specific constants from platform metadata
- add actions for “Select Active Target” or “Set Program File”

These should be layered on top of the core language service. The server should still work
without a configured Debug80 project.

---

## Milestone Plan

### Milestone 1: Project-Aware Symbol Index

Deliver:

- language server/client wiring
- parser for labels, constants, includes, routine headers, and simple references
- document symbols
- go to definition
- workspace symbols
- include-file resolution diagnostics

This milestone proves the architecture without committing to hard semantic validation.

### Milestone 2: References And Completion

Deliver:

- find references for labels/constants
- label/constant completion
- mnemonic/register/directive completion
- include path completion
- duplicate label diagnostics
- undefined symbol diagnostics for confident references

### Milestone 3: Assembler-Aware Diagnostics

Deliver:

- backend profiles for asm80 and ZAX
- better directive validation
- simple expression evaluator
- range checks for `JR` / `DJNZ`
- map-aware hover for labels and addresses

### Milestone 4: Refactoring And Semantic Tokens

Deliver:

- safe rename symbol
- semantic token support
- routine/header-aware outline polish
- optional code actions

---

## Risks And Constraints

- **False diagnostics are worse than missing diagnostics.** Assembly projects often use macros,
  generated includes, non-standard directives, and historical style. Be conservative.
- **`.asm` is not always Z80.** Debug80 currently claims `.asm`; the LSP should be tolerant and
  avoid noisy validation until a Debug80 project target confirms the file is Z80.
- **Macro expansion can become expensive.** Do not block initial LSP value on macro expansion.
- **Stale build artifacts can mislead.** Any map-derived address must be marked as coming from
  the latest known build/map.
- **Performance matters.** Large ROM sources should parse incrementally and index lazily.
- **Windows path handling must stay first-class.** Include and project resolution must use
  normalized URI/path handling, not string-only POSIX assumptions.

---

## Recommended Direction

Start with a tolerant project-aware symbol index, not a full assembler parser.

The first useful version should focus on:

1. document symbols and outline
2. go to definition for labels/includes
3. workspace symbol search
4. label completion
5. duplicate/undefined label diagnostics only where confident

That gives Debug80 a clear IDE improvement while keeping risk low. Once the parser/index is
trusted, add backend-specific diagnostics and map-aware debug integration.
