# Debug80 Future Directions

This document is a working discussion of possible directions for Debug80. It is
not a commitment to build every item here. The purpose is to collect ideas,
explain why they might matter, and make the tradeoffs visible before any of them
turn into implementation work.

Debug80 has moved well beyond a minimal debug adapter. It now has a strong
platform emulator, source-level debugging through D8 maps, useful Z80-specific
state views, AZM integration, and enough hardware modelling to support real
program development. The next useful improvements are less about adding isolated
features and more about deciding which parts of VS Code should become smarter
for assembly language development.

## Guiding Principles

The central design choice should remain that Debug80 is a practical Z80
development environment, not a generic language workbench. Features should help
with source-level debugging, single-board computer workflows, and understanding
hardware behaviour.

Where possible, Debug80 should use information produced by AZM and the D8 map
rather than inventing its own parser. That keeps the extension aligned with the
assembler and avoids a second, partial understanding of the language. If a
feature cannot work because the project has not built, it is better to say
"build first" than to guess from stale or incomplete source text.

VS Code's built-in debugger panels should be used where they can add value, but
Debug80 should keep custom UI where the generic panels are a poor fit. Z80
registers, flags, memory, hardware displays, matrix scanning, and platform
state often need purpose-built presentation.

## Editor Navigation

### D8-Backed Symbol Navigation

Go to Definition is now backed by the active target's D8 map. That is the right
foundation because the D8 file represents the last successful build: it knows
which files participated in the program, which symbols survived assembly, and
where source lines map into generated code.

This feature can grow into a broader editor-navigation layer. The useful thing
is not to pretend that Debug80 has a complete live language model. The useful
thing is to make the last successful build immediately navigable.

Good follow-ups include:

- Find All References using D8 symbols plus source text from files in the built
  target graph.
- Workspace Symbols for labels, constants, routines, data symbols, ops, enums,
  and interface records.
- Peek Definition using the same symbol index as Go to Definition.
- Hover cards that explain symbol kind, value/address, source location, and
  nearest memory region.
- An outline view if AZM emits enough structure for routines, data blocks,
  enums, layouts, and interfaces.

The current D8 format is already enough for simple navigation. A few additions
would make the experience sharper later: symbol columns, richer symbol kind/type
metadata, optional documentation ranges, and possibly reference records if AZM
can emit them cheaply.

### Code Completion

Code completion could make Debug80 feel much more like an IDE without requiring
a full LSP on day one. The first version should be deliberately modest. A small
set of high-confidence completions is more valuable than a noisy list that
interrupts assembly programming.

The main completion sources are straightforward: D8 symbols from the last build,
register names, condition names, Z80 mnemonics, assembler directives, AZM ops
and enums where available, and platform-specific names such as monitor routines
or I/O ports.

The interesting question is how context-sensitive this should become. Completing
after `call` or `jp` should prefer addressable labels. Completing after `ld a,`
could suggest registers, constants, and memory forms. Completing after a dot can
suggest directives. Those cases are useful and contained.

More ambitious instruction-aware completion would need a small model of Z80
operand patterns. That is worth considering, but it should not block a first
version based on simple contexts and D8 symbol ranking.

### Hover Information

Hover support could be helpful if it stays restrained. Hovering a symbol might
show its address or value, source location, memory region, and AZMDoc contract.
For routines, that could include `in`, `out`, `clobbers`, and `preserves`.

The risk is noise. Assembly source is dense, and a hover that appears too often
or shows too much text will get in the way. A good rule would be to show hover
information only for meaningful symbols, keep it compact, and provide a way to
jump to the full definition.

The best long-term version would not parse AZMDoc comments directly in Debug80.
It would ask AZM, through D8 or tooling APIs, for routine documentation and
contract metadata.

## VS Code Debugger Panel Integration

Debug80 currently puts most of its useful state into its own panel. That was the
right choice while the emulator UI was evolving. The built-in VS Code panels are
generic, and Z80 work needs registers, flags, memory, displays, and hardware
state to be presented in ways that make sense for the machine.

Now that the custom Debug80 panel is stronger, the built-in panels can be used
more deliberately. The goal should not be to duplicate the custom panel. The
goal should be to make the standard debugger surfaces useful for assembly work.

### Variables Panel

The Variables panel is the most obvious candidate for rethinking. Debug80's own
register view is better for Z80 registers, so the generic Variables panel does
not need to keep pretending that registers are ordinary variables.

A better use would be a symbol and memory view. D8 address symbols could be
grouped by file, memory region, or platform area. Constants could be shown in a
separate section so they are visible but not mistaken for memory. Symbols near
the current PC or SP could be surfaced because those are often the values the
developer wants in the moment.

The important limitation is type information. Z80 assembly is not inherently
typed. Debug80 can show raw bytes, words, characters, and addresses, but it
should not pretend to know rich source-level types unless AZM emits that
metadata. Manual display modes may be necessary for ambiguous symbols.

### Memory Symbol Typing

There is still room for useful lightweight typing. `.db` implies bytes or text,
`.dw` implies little-endian words, and `.ds` implies reserved storage. AZM
layout declarations could eventually provide structured views if layout
metadata is emitted into D8.

This is a good example of a feature that should be assembler-led. Debug80 can
display structure very well, but AZM is the component that knows whether a
symbol is a byte, word, address, enum, layout, union, or array. If this area
becomes important, the best next step is probably a D8 extension rather than
Debug80 source scanning.

Useful future D8 fields might include storage kind, layout/type reference,
symbol size, and optional display hints.

### Watch Panel

The Watch panel is now a practical assembly inspection tool. Instead of
JavaScript-like expressions, it accepts a small Z80-focused expression language
for runtime state:

- registers such as `A`, `HL`, `IX`, `SP`, `PC`, `AF'`, and `BC'`
- AZM register-care flag names such as `zero`, `carry`, `sign`, `parity`, and
  `halfCarry`
- active source-map symbols such as `PACMO_LIVES` or `MainLoop`
- byte memory reads using square brackets, such as `[HL]`, `[PACMO_LIVES]`, and
  `[IX + 4]`
- grouping with parentheses, such as `(A + 1) eq $21`
- arithmetic `+ - * / %`
- bitwise `& | ^ ~`
- comparisons `eq ne lt le gt ge`
- logical `and`, `or`, and `not`

This would be valuable because watch expressions are often more convenient than
opening a full memory panel. A developer could pin a few important symbols,
pointers, flags, or buffers and watch them while stepping.

The language is intentionally limited and predictable. Failed watches should
explain whether the symbol is missing, the expression is unsupported, the target
has not built, or the memory address is unavailable. Truth follows the usual
debugger convention: zero is false, and any non-zero value is true.

The same expression language is now used for VS Code conditional breakpoints.
When execution reaches a source breakpoint with a condition, Debug80 evaluates
the condition against the current CPU, memory, and active source-map symbols. If
the expression is zero or false, execution continues. If it is non-zero or true,
Debug80 stops at the breakpoint. If the expression cannot be evaluated, Debug80
stops and writes the expression error to the Debug Console rather than silently
running past a breakpoint the user expected to catch.

Display modes would matter here: byte, signed byte, word, address, binary,
character, short byte array, and nearest-symbol pointer display. Some of this
can be inferred from D8, but manual suffixes such as `symbol:u8`, `symbol:u16`,
or `buffer[16]` may be useful later.

### Call Stack Panel

The Call Stack panel is harder because a Z80 program does not have a high-level
runtime call stack. The stack is just memory. It may contain return addresses,
temporary data, saved registers, interrupt state, or monitor values.

That does not make a call-stack view useless. It means the view should be honest
about confidence. Debug80 could combine two approaches:

- Runtime tracking: observe `CALL`, `RST`, and `RET` while the emulator runs and
  maintain a best-effort logical call history.
- Stack reconstruction: while paused, scan words from `SP` upward and identify
  values that look like return addresses into known D8 code.

Runtime tracking is more accurate during a continuous session, but manual PC/SP
edits or unusual monitor code can invalidate it. Stack reconstruction is always
available, but it can mistake pushed data for return addresses.

A good presentation would show `symbol+offset`, raw address, source file/line,
and a confidence marker such as tracked call, plausible return address, or
unknown stack word. User code, ROM/monitor code, and unknown code should be
visually distinct.

There are also powerful expert actions that could be considered later: jump to
frame source, set PC to a return address, or pop the stack back to a selected
frame. These are useful but potentially destructive, so they would need clear
confirmation and exact before/after `SP` and `PC` values.

### Breakpoints Panel

The Breakpoints panel could become more symbolic. Instead of only showing source
line breakpoints, it could show resolved addresses, confidence, and the source
mapping used. Future breakpoint types could include break on monitor call,
break on I/O port access, break on memory read/write, or symbolic breakpoints
by label name.

This would be especially useful when debugging ROM code, platform monitor
functions, and generated/lowered source where the mapping may not be obvious.

## Debugging Features

### Watchpoints

Watchpoints are one of the most valuable debugging features for assembly. Many
bugs are not "which line am I on?" bugs. They are "who changed this byte?" bugs.

A useful first version would support break on write to an address or range,
break on read, break when a byte or word changes, and symbolic address input
from D8. The main concern is runtime cost. The implementation should keep normal
execution fast and only pay the cost when watchpoints are active.

### Trace Recording

A trace recorder could capture recent execution history: PC, instruction bytes,
register snapshots, memory writes, I/O operations, and cycle counts. This would
be valuable for debugging games, monitor calls, display scanning, serial
protocols, and bank switching.

The design should be bounded from the start. A ring buffer is probably the right
shape. The user usually wants the last few hundred or few thousand events before
a problem, not an unlimited log that slows the emulator or fills memory.

### Run To Cursor

Run to Cursor is a small feature with high daily value. It can reuse the same
source-map machinery as breakpoints: resolve the cursor line to an executable
address, set a temporary breakpoint, continue, then remove it.

This is likely one of the more contained features in this document.

### Conditional Breakpoints

Conditional breakpoints would be useful, but the expression language should
stay small. Conditions over registers, flags, memory bytes/words, and D8 symbols
would cover most needs.

This overlaps with the Watch expression evaluator. It may be sensible to build
one small evaluator and use it for both watches and conditional breakpoints.

## Hardware And Platform Diagnostics

### Display Timing Diagnostics

Recent scan-duty rendering makes display timing visible in a way that is useful
for hardware development. Debug80 could expose that more directly: seven-segment
digit duty cycle, RGB matrix row duty cycle, scan frequency, brightness
distribution, and warnings for stalled or very uneven scans.

This kind of diagnostic is valuable because it helps distinguish emulator bugs
from program timing bugs. If a display looks wrong, the user should be able to
see whether the program is scanning rows evenly, starving one digit, or leaving
a latch active too long.

### I/O Port Trace

An I/O trace panel would show recent port reads and writes with values,
timestamps, decoded device meaning where known, and source location where D8 can
resolve it.

This is especially relevant for TEC-1G peripherals, serial, matrix keyboard,
GLCD, RGB display, RTC, SD/SPI work, and memory expansion. It would also make
platform emulation easier to verify.

### Peripheral Activity Indicators

Compact activity indicators could show when each subsystem is being touched:
keypad scan, matrix keyboard, seven-segment scan, RGB matrix scan, serial RX/TX,
RTC, SD/SPI, memory protection, and expansion bank selection.

These should not become another large dashboard. The value is quick intuition:
"is the program talking to this hardware at all?"

## Real Hardware Integration

Debug80 already has a direction for sending built HEX files to hardware through
external serial tooling. This should remain separate from emulated serial I/O:
the goal is not to emulate a serial port, but to transfer built artifacts to a
real board.

Future work could improve progress reporting, timeout handling, pacing, command
palette actions, retry flow, and transfer logs. If a monitor can send memory
back, memory dump comparison would also be useful.

The packaging risk remains important. Native serial dependencies inside the
main VSIX can create platform and installation problems. Provider-style
integration or companion tools may be safer unless the native dependency story
is very clean.

## Build And AZM Integration

### Register Care UI

AZM register-care analysis is one of the most promising quality features, but
it should be presented simply. A normal user should not need to understand every
AZM switch.

The visible mode could be:

- Enforce: compile with register-care errors enabled and block launch on real
  errors.
- Audit: generate findings and reports without blocking launch.
- Off: disable register-care checking.

Contract updates should be a separate action. Restart/build should normally be
read-only. If Debug80 offers to update AZMDoc contracts, it should preview or
ask before applying unless the user explicitly chose automatic updates.

This keeps strictness useful without making the debugger feel like it silently
rewrites source code.

### Artifact Browser

The Project panel could expose build artifacts: HEX, BIN, D8 map,
register-care report, lowered source, and any future AZM reports.

This should stay compact. The point is not to create a file manager inside the
debugger. The point is to make the important generated outputs discoverable and
easy to open.

### Staleness Hints

Several Debug80 features depend on D8 maps. That is acceptable, but the UI
should make stale or missing maps understandable.

Useful hints include: no D8 for active target, D8 older than source, D8 emitted
by an unexpected tool/version, source file mentioned in D8 no longer found, or
active target changed since last build.

These should usually be warnings, not hard blockers. The feature itself can
decline to operate when it has no D8 data, but the general debugging experience
should not be made brittle.

## Testing And Teaching

### Golden Run Tests

Project-level emulator tests could run until a symbol or condition and then
assert registers, flags, memory, I/O output, or display state. That would help
example programs, platform regressions, and teaching material.

This is attractive because Debug80 already has the emulator and platform state.
The question is how much test framework belongs inside Debug80 versus a separate
tooling layer.

### Scripted Demo Mode

A scripted demo mode could drive tutorials: build target, launch, step to a
symbol, highlight register and memory changes, and show panel transitions.

This is lower priority than core debugging features, but it could make Debug80
much easier to teach and document.

## Deferred Ideas

Some ideas are interesting but should probably wait:

- Full time-travel debugging: powerful, but likely large and memory-heavy.
- Full rename/refactor LSP: valuable long-term, but D8-backed navigation and
  symbol indexing should mature first.
- Rich type inference from unannotated assembly: risky unless AZM emits enough
  structure or users provide annotations.
- Native serial implementation in the core VSIX: useful, but platform packaging
  risk may outweigh the benefit compared with provider or companion approaches.

## Open Questions

These are the main design questions to answer before implementation work:

- Which built-in VS Code panels should Debug80 deliberately own first:
  Variables, Watch, Call Stack, or Breakpoints?
- Should D8 become the primary carrier for documentation, contracts, layout
  types, and display hints, or should Debug80 call AZM tooling APIs directly?
- How strict should stale-build warnings be for editor features?
- What is the smallest useful expression language that can serve watches,
  conditional breakpoints, and memory display without becoming fragile?
- Which features are most useful for everyday Z80 programming, and which are
  mainly useful for hardware/platform development?
