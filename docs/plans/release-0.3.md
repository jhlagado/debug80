# Release 0.3 Work Plan — The Developer-Experience Line

Prepared 2026-07-10, planned while 0.2 awaits its playtest and publish
call. 0.2 made the language complete; 0.3 makes *writing and debugging*
`.glim` programs first-class. It is deliberately shaped to run alongside
the Debug80 integration phase: a stable language surface (no new core
constructs), with every improvement aimed at the person sitting in the
editor — diagnostics that point at their source, declarations that
replace their hand-written tables, and Tetro finished to corpus parity
as the proof.

The TMS9918 second platform is **explicitly deferred to 0.4** (see
"The 0.4 horizon" below): profile parameterization is the biggest
remaining architectural question, and answering it mid-integration
would churn the surface Debug80 is being built against.

## The line

0.3 is done when: a contract error in a block body is reported at the
`.glim` line that caused it; Tetro matches the corpus game
feature-for-feature (flash, preview, messages, key gate) with its
hand-written library reduced to genuinely irreducible engine code; and
nothing in the release changed the language in a way that breaks a 0.2
program.

## 1. Diagnostics land in `.glim`

The debug map rewrite proved the label-anchored mapping; now point it
the other way. `buildGlimmerProgram` re-attributes AZM diagnostics
(contract violations, assembly errors) whose location falls inside a
block or routine body back to the `.glim` file and line, exactly as the
d8 rewrite does for address segments. Generated-glue diagnostics stay on
the generated asm — same transparency split as stepping.

- Reuse `computeBlockMappings`; the reverse lookup is
  (asm line → glim file/line) over the same ranges.
- Both AZM passes (check and assemble) get the treatment.
- The CLI prints them at `.glim` positions; the API returns them that
  way, so Debug80 surfaces them in the right editor tab for free.

## 2. Contract seeds from source

Blocks and routines accept optional `;!` contract lines in their
headers (before `begin`), passed through adjacent to the generated `@`
label. AZM then *verifies the declared interface* instead of only
inferring one — the roadmap's register-contracts "next step", and the
difference between documentation and a checked promise. Routine
declarations are the headline case (a collision helper declares
`;! in DE; out carry`); effect blocks get it for symmetry.

## 3. Resource depth — the corpus tables become declarations

The P6 remainder, driven by exactly what tetro-lib.asm still hand-writes:

- **Multi-rotation shapes** (sketch syntax): `shape PieceT color magenta`
  with `rot0`..`rot3` rows generates the row bitmaps, the
  pointer/rotation table, the right-bound table, and the colour entry —
  the bulk of tetro-lib's data section becomes seven declarations.
  Single-bitmap shapes stay as they are.
- **Text resources**: `text MsgPaused "PAUSED"` emits the
  null-terminated `.db` string, and the tec1g profile grows the LCD
  service slice (MON-3 string-to-LCD calls) plus the first
  **Glimmer-emitted AZM `op`** (`lcd_row msg, row`) — the P6/P8 ground
  rule exercised for real: sugar exists only as visible AZM in the
  generated file.
- **`bind key any rising -> Pulse`**: the splash/game-over "press any
  key" pattern from the corpus, currently approximated with GO.

## 4. Tetro to corpus parity

The acceptance test grows back the first-cut simplifications, each
exercising a 0.3 feature or an existing construct properly:

- **Line-clear flash**: `ClearMask` state + `ClearHold` timer — the
  corpus flash-then-collapse sequence (existing constructs; the 0.2 cut
  was scope, not capability).
- **Game-over key gate**: an `enter` block rearms a `once` timer by
  writing its countdown cell; restart uses conditional navigation off
  the gate state. Expressible today — document it as the pattern.
- **Next-piece preview and LCD messages**: text resources + the LCD
  slice (item 3).
- Library shrink: piece tables move from tetro-lib.asm to shape
  declarations; what remains hand-written is the collision/lock/clear
  engine, which is the honest boundary.

## 5. Word change-flag semantics (P7) — decide, small

Word cells already store, flag, and compare correctly (Tetro's Score
proves it). The deferred question is only whether any *runtime widget*
needs word awareness (word timers exist; word ramps do not). 0.3
resolution: document what word cells do and don't do in the spec, keep
widgets byte-first, and close P7 as "defined, deliberately narrow"
unless Tetro-parity work surfaces a real need.

## 6. Coordination tracks (not in this package)

Listed so the release plan shows the whole board:

- **Debug80** (John's integration phase): AZM bump to ^0.2.17,
  GlimmerBackend over `buildGlimmerProgram`, `.glim` language
  contribution (grammar with embedded z80-asm, `breakpoints` list),
  native `.glim` targets. Glimmer 0.3's item 1 makes the error
  experience match the stepping experience when that lands.
- **AZM**: the post-injection map/line-offset fix (so a single
  `--contracts` run emits a map that matches the annotated file), and
  eventually the `.loc` source-origin directive (Option B) which would
  let AZM emit glim-attributed maps natively — adopt in Glimmer when it
  ships, keeping the rewrite as fallback.

## Explicitly out (the 0.4 horizon)

- **TMS9918 profile** + `sprite-chase.glim` — the second display
  answers the profile-parameterization open question and is the
  natural headline for 0.4, after Debug80 integration stabilizes.
- `.glim` libraries (namespace story), generated-output module
  splitting, per-block assemble/check — editor-era and architecture
  items that should follow, not precede, the integration experience.

## Order

Diagnostics-to-glim → contract seeds → multi-rotation shapes → tetro
library shrink + flash + gate → text resources + LCD slice + any-key →
tetro preview/messages → P7 documentation → polish. Items 1–2 first:
they pay off immediately during John's Tetro playtesting and Debug80
work, before the resource items land.
