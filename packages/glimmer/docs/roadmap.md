# Glimmer Roadmap

Current as of 2026-07-12. Detailed release history lives in
[CHANGELOG.md](../CHANGELOG.md); completed implementation plans remain in
[`docs/plans/`](plans/) as design records.

## Contract

Glimmer's essential contract is:

```text
.glim source -> readable generated AZM -> HEX / BIN / Debug80 map
```

Glimmer owns the structured source, reactive runtime generation, profile
selection, and `.glim` source attribution. AZM owns assembly, layout types,
operations, register contracts, and machine-code artifacts. Debug80 owns
emulation and the debugging experience.

The generated AZM file is a canonical, inspectable interface rather than a
hidden intermediate. `glimmer build` runs the complete chain for convenience,
and `buildGlimmerProgram` exposes the same workflow in process to Debug80.

## Current release line

Version 0.6.0 is the **scheduling-contract and behavioural-confidence** line:

- source order cannot change trigger delivery, while verbatim Z80 bodies still
  execute sequentially against live memory;
- declaration-visible same-frame writer overlap is a warning, and different
  unconditional navigation targets under the same trigger are an error;
- focused generator tests prove same-phase deferral and later-phase forwarding;
- Debug80's bounded headless Dot, scheduling, Tetro and Sprite Chase scenarios
  execute the generated programs without VS Code or a webview;
- generated files retain AZM 0.3 `.contracts` and `.routine` boundaries; and
- Debug80 builds, breaks and steps in original `.glim` source.

The completed release plan is [`docs/plans/release-0.6.md`](plans/release-0.6.md).
Physical Tetro and Sprite Chase playtests remain post-release hardware
maintenance. New language work is selected by pressure from real programs and
additional platforms, not by an attempt to hide Z80 behind an ever-larger
language.

## Shipped language

- scalar byte and word state, byte arrays, and AZM layout-typed state;
- pulses, oscillator and one-shot timers, ramps, and `FrameCount`;
- rising, held-autorepeat, and any-key bindings on TEC-1G/MON-3;
- `compute`, `effect`, and `render` blocks with explicit `on` and `updates`;
- callable `routine` blocks and byte-for-byte verbatim AZM bodies;
- cards as exclusive screens or modes, edge-triggered `enter` blocks, and
  frame-boundary `goto` navigation;
- multi-file programs through `part` and hand-written AZM modules through
  `.import`;
- sound cues, curves, matrix shapes and rotations, LCD text, TMS9918 sprites,
  tiles, and generated AZM `op` helpers;
- four change-flag banks with exactly-once same-frame or next-frame delivery.

## Shipped profiles

### TEC-1G matrix8x8

The CPU scans the display. `ScanFrame` services all eight rows, sound, and the
seven-segment HUD; reactive work runs in the inter-frame blanking window.
MON-3 supplies keypad polling, LCD calls, and random numbers.

### TEC-1G TMS9918

The VDP renders independently. The loop waits for vertical blank, commits dirty
name-table rows and sprite attributes from shadows, polls input, and runs the
reactive phases. Sprite and tile declarations generate their pattern upload and
Graphics I colour groups.

### Generic

The generic profile emits placeholder APIs and an audit contract policy. It is
useful for tests and for inspecting the platform-neutral runtime shape, not as a
finished hardware target.

## Acceptance programs

- `examples/dot.glim`: smallest matrix input-to-pixel program;
- `examples/slide.glim`: timers, ramps, curves, sound, shapes, and HUD;
- `examples/trail.glim`: array state and `part` composition;
- `examples/snake.glim`: first complete multi-file game;
- `examples/tetro.glim`: matrix headline game, cards, rotations, LCD, scoring,
  line-clear flash, pause, and game-over flow;
- `examples/sprite-chase.glim`: second-display acceptance game with declarative
  sprites, tiles, and generated VDP operations.

All examples are snapshot-covered and assemble under their applicable AZM
contract policy. Tetro and sprite-chase are native targets in `debug80.json`;
`tetro-glim` is the repository default.

## Release completion evidence

Two checks still require real hardware playtesting:

1. Play Tetro through its full splash, movement, rotation, lock, line-clear,
   pause, restart, LCD, HUD, and sound paths in Debug80 and on TEC-1G hardware.
2. Play sprite-chase through input, sprite movement, collision, score tiles,
   and sustained VDP commit timing in Debug80 and on a TEC-Deck.

Findings from those sessions are release maintenance, not new language scope.
Strict assembly and emulator startup remain necessary evidence, but they do not
prove that a complete game path behaves correctly. Headless Debug80 scenarios
can automate most emulator playtesting; they cannot replace final checks on
physical TEC-1G and TEC-Deck hardware.

## Ordered next priorities

Work should proceed in this order. A later item moves forward only when a real
program or platform makes it more urgent than the items above it.

1. **Complete - 0.6.0 effect-order safety.** Trigger scheduling is documented,
   declaration-visible writer overlap is diagnosed, ambiguous unconditional
   navigation is rejected and focused plus headless tests prove the contract.
2. **Complete - headless behavioural verification.** Built AZM and Glimmer
   programs run through Debug80's Z80 and TEC-1G models without VS Code or a
   webview. Bounded scenarios cover input, cards, reactive phases, memory,
   matrix output, LCD, sound and TMS9918 state.
3. **Source-level routine contracts.** Let `.glim` routine headers state the
   AZM register contract that Glimmer already emits and AZM already verifies.
4. **TEC-1G input expansion.** Add declarative joystick bindings and settle a
   profile-neutral input vocabulary before supporting more controllers.
5. **Profile service interfaces.** Define the small set of services a profile
   supplies to the generated runtime, so a third platform does not have to copy
   a TEC-1G profile and edit it internally.
6. **Namespaced `.glim` libraries.** Design reusable source units only after
   more than one program needs to share state, effects, bindings or resources
   beyond today's `part` merge semantics.

Examples are evidence for these capabilities, not a roadmap item themselves.
New showcase games are deferred unless they expose a missing contract or
platform requirement.

## Headless behavioural verification

### Foundation delivered

The Debug80 Toolchain workspace now contains the first working vertical slice:

- `@jhlagado/debug80-runtime` owns the Z80 core and TEC-1/TEC-1G device models
  without depending on AZM, Glimmer, VS Code or the Debug Adapter Protocol;
- Debug80 consumes that package rather than retaining a second emulator copy;
- the stable `@jhlagado/debug80-runtime/headless` API provides bounded
  execution, reset, cycle propagation, memory overlays, D8 symbol access,
  physical matrix and joystick input, semantic device snapshots and timeout
  traces;
- a dedicated AZM fixture assembles to HEX and D8, executes from `Start`, and
  verifies named state without involving Glimmer;
- a private workspace test builds `dot.glim`, loads MON-3, enters the generated
  `Start` symbol, completes matrix scans and moves the dot with an emulated key;
- Tetro covers splash-to-play navigation, movement, rotation, line clear,
  pause, game over, restart, matrix scans, LCD and sound edges;
- sprite-chase covers resource upload, sprite commits, movement, collision,
  score and sustained PAL VDP frames;
- the packed ESM runtime is installed and exercised through its public headless
  subpath so workspace linking cannot hide missing exports.

The software headless-verification phase is complete. Remaining Tetro and
sprite-chase work is physical hardware playtesting and maintenance prompted by
those findings, not runner architecture.

This remains primarily a **Debug80 runtime productisation task**, followed by a
Glimmer acceptance-test task. The first orchestration API now composes the Z80
and TEC-1G components without the debug adapter, VS Code extension host or
webview. Its public surface should grow only as acceptance scenarios require.

Glimmer must not implement a second emulator. It should build a `.glim` program
normally, then hand the resulting HEX, Debug80 map, platform configuration and
ROM selection to the Debug80-owned runner. The runner must not depend on
Glimmer, because Debug80 already uses Glimmer to build `.glim` launch targets.
That dependency direction keeps the emulator usable by AZM and hand-written Z80
programs as well.

### Public runner surface

The public package API provides:

- session creation from HEX, Debug80 map, platform configuration and a pinned
  monitor ROM;
- instruction stepping and bounded `runUntil` execution by cycle count,
  instruction count, address, symbol or state predicate;
- distinct matrix-scan and TMS9918-frame advancement, rather than one ambiguous
  `runFrame` operation;
- matrix-key press, release and tap operations aligned with MON-3 scan timing,
  plus joystick state injection;
- symbol-based byte, word and array memory reads and writes using the Debug80
  map, avoiding hard-coded addresses in tests;
- semantic snapshots of matrix rows, seven-segment digits, LCD text, speaker
  edges, TMS9918 registers, VRAM, sprites and framebuffer;
- deterministic reset, explicit video standard and platform clock behavior;
  MON-3 random sequences repeat from the same pinned ROM and reset image;
- failure reports containing the stop reason, PC, registers, cycle count and a
  short instruction trace.

Every run operation needs a mandatory budget. Games intentionally loop forever,
so waiting for HALT is not a useful default and an unmet condition must fail
quickly with diagnostic state rather than hang CI.

### Assertion levels

Tests should use the least fragile level that proves the behaviour:

1. **Game state:** inspect named Glimmer state through Debug80 symbols. This is
   the clearest way to prove navigation, scoring, timers and collision logic.
2. **Device state:** inspect matrix scan planes, LCD DDRAM, speaker transitions,
   VRAM, name tables and sprite attributes. This proves the program drove the
   emulated hardware correctly.
3. **Rendered output:** compare selected framebuffer regions or a small number
   of full-screen golden images. Pixel snapshots are valuable for rendering
   regressions but too broad and brittle to be the default assertion.

Tests may write named state directly to arrange a difficult condition such as a
nearly complete Tetro row. Each acceptance program should still retain one
shallow path from reset using only emulated input, so setup helpers cannot hide
boot or input-integration failures.

### Delivery slices

1. **Complete - Debug80 session core:** compose program loading, Z80 stepping, cycle
   accounting and TEC-1G device state behind an internal `HeadlessSession`.
   Prove it with a tiny AZM/HEX fixture before involving Glimmer.
2. **Complete - Input and symbols:** add bounded `runUntil`, D8 symbol access, scan-aware
   keypad operations and useful timeout traces. This is the minimum viable
   reusable runner.
3. **Complete - Glimmer smoke scenarios:** `dot.glim` proves direct application
   entry, MON-3 calls, key input, named state and matrix scanning;
   `sprite-chase.glim` proves TMS9918 resource upload and sprite commits.
4. **Complete - game-path scenarios:** Tetro covers navigation, movement,
   rotation, arranged line clear, pause, game over and restart. Sprite-chase
   covers movement, arranged collision, score and sustained VDP frames.
5. **Complete - CI and public boundary:** root checks run the private AZM and
   Glimmer integration workspaces. The ESM-only
   `@jhlagado/debug80-runtime/headless` package API is the stable boundary and
   has no AZM or Glimmer dependency; a second CLI would duplicate it without
   adding a current use case.

The scenarios are deterministic, bounded with actionable timeout traces, and
require no VS Code process, browser, canvas or wall-clock sleeps. Physical
hardware playtests remain a separate release check.

## Effect-order safety

The generated runtime already routes a change to `Next` when any consumer is in
the producer's phase or an earlier phase. Trigger propagation is therefore
independent of declaration order: a peer effect observes the trigger on the next
frame, while a later phase may observe it in the current frame. This is a
**trigger-scheduling** guarantee, not a snapshot of all state, because verbatim
Z80 bodies read and write live memory as they execute.

Several shipped programs legitimately have more than one writer for a state:
left and right movement both update X, for example. Multiple writers are not by
themselves an error. When two blocks are in the same phase, can be active under
the same card, share a trigger and declare the same `updates` target, Glimmer can
prove that both are scheduled together but cannot prove which conditional Z80
stores execute. That overlap is a warning. Different unconditional `goto`
targets under the same conditions are a definite conflict because both wrappers
store `CurrentCard`; that case is an error.

The 0.6 enforcement slice should:

- warn about shared-trigger/shared-update overlap, naming both blocks, the
  trigger, phase and state;
- fail different unconditional `goto` targets under the same scheduling
  conditions, including implicit `CurrentCard` updates in the analysis;
- preserve valid alternative writers with disjoint triggers, phases, or mutually
  exclusive card scopes;
- retain the missing-`updates` store warning and explain its limits for indirect
  Z80 writes;
- test same-phase deferral, later-phase forwarding, declaration reordering,
  definite conflicts, and accepted multi-writer examples; and
- recommend one effect or a called routine for state changes that must preserve
  one atomic gameplay invariant.

This item does not introduce transactional state, phase snapshots, automatic
effect sorting, arbitrary read inference, or fixed-point cascades. Those would
be larger runtime designs and need evidence from a real game before entering
the roadmap.

## Source-level routine contracts

AZM 0.3.3 verifies explicit `.routine` interfaces against _callers_ and
against each routine's own body-effect summary (`declaration_contract_mismatch`
when a body write is preserved or left unmentioned). Glimmer already emits
reliable boundaries (bare `.routine` for user blocks; curated clauses on
profile library routines, audited against that body check). What remains is
a readable `.glim` header syntax that passes explicit `in`, `out`,
`maybe-out`, `clobbers`, and `preserves` clauses through into the generated
`.routine` line — without putting non-Z80 semantics inside the body — plus
negative tests on the Glimmer side.

Profiles may later move monitor interfaces into AZM `.asmi` files when that is
more useful than the current register profile. This phase is complete when
contracts are accepted on callable routines, preserved in generated AZM, and
covered by positive and negative caller/body tests.

## Later, evidence-driven work

- **Generated module splitting:** move stable runtime/profile sections into
  `.import` units only if editor and debugging experience improves.
- **Per-block diagnostics:** editor-time isolated assembly and richer dataflow
  analysis, while preserving whole-program verification as the authority.
- **Additional profile capabilities:** TMS9918 Graphics II or NMI pacing, sound
  hardware, and other Z80 systems supported by Debug80.
- **Larger corpus adaptations:** Pacmo and future games should justify new
  constructs rather than merely demonstrate existing ones again.
- **Native source origins:** an AZM `.loc`-style directive could eventually
  replace Glimmer's map post-processing if the mechanism benefits other source
  generators too.

## Explicitly not goals

- replacing AZM with a second assembler or macro language;
- hiding generated assembly;
- conditional navigation syntax inside Z80 bodies;
- blocking music as the default matrix sound model;
- adding abstractions without a game, tool, or platform that needs them.
