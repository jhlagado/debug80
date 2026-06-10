# Debug80 Code Quality Audit

This document records the current code-health state of Debug80 and proposes a
staged cleanup programme. It is intentionally engineering-facing; user-facing
manual content belongs at [debug80.com](https://debug80.com/).

Audit date: 2026-06-02 (last reviewed 2026-06-10)

## Summary

Debug80 is in a healthy state for a fast-moving pre-release extension (v0.1.22,
~66k LOC, 214 `src/` files, ~150 test files): there are no circular
dependencies, no unused package dependencies reported by Fallow, strict
TypeScript in `src/`, strong multi-OS CI, and an in-repo engineering manual.
Phases 1–4 of the cleanup programme are complete. The main maintainability risks
are not architectural collapse; they are accumulated branch complexity in
recent hot zones, large composition files, webview/backend type-safety
divergence, dead exported surface area, and remaining historical source-map/cache
vocabulary that can obscure the current AZM-only model.

The highest-value cleanup is now to harden the areas that have already regressed
multiple times — especially TEC-1G matrix keyboard state and webview boundary
typing — while continuing the Phase 5–7 programme:

1. Continue extracting pure matrix state helpers only where direct tests already
   characterize the behavior.
2. Improve webview DOM/message boundary typing now that webview TypeScript runs
   with `strict: true`.
3. Finish launch/project policy documentation and avoid further target-selection
   churn unless new behavior appears.
4. Remove dead exports and stale artifacts that no longer serve public behavior.
5. Reduce test harness duplication in oversized integration test files.

## Recent Updates

### 2026-06-11: Source-State Build Options Test Fixture Cleanup

`tests/debug/source-state-build-options.test.ts` now uses local helpers for the
one file-system-backed source-map fixture. The helper owns temporary project
creation, recursive cleanup, text-file writes, and minimal D8 map writing, while
the test itself keeps the source-root mutation and executable-location assertion
visible.

This is intentionally test-only cleanup. It reduces repeated file setup around
the source-state helper coverage without changing launch, rebuild, or source-map
production behavior.

Verification:

```sh
npx vitest run tests/debug/source-state-build-options.test.ts
npm exec --yes fallow -- audit --changed-since HEAD --format compact
```

### 2026-06-11: D8 Source-Path Test Fixture Cleanup

`tests/debug/d8-source-paths.test.ts` now uses small local helpers for temporary
workspace roots and source-file creation. The path-specific assertions remain
explicit in each test, but the repeated `mkdtemp` / directory creation /
cleanup blocks are centralized with `try` / `finally` cleanup.

`tests/debug/d8-symbols.test.ts` was inspected as part of the same cleanup goal
and left unchanged because it is already a minimal single-case helper test with
no repeated setup worth extracting.

Verification:

```sh
npx vitest run tests/debug/d8-source-paths.test.ts tests/debug/d8-symbols.test.ts
npm exec --yes fallow -- audit --changed-since HEAD --format compact
```

Fallow exits cleanly for the changed source-path helper test.

### 2026-06-11: D8 Definition Provider Helper Cleanup

`src/extension/d8-definition-provider.ts` now shares the D8 editor-symbol
conversion path used by F12 definitions, hover lookup, and workspace symbols.
The extraction keeps symbol navigation policy in one place:

- blank D8 file keys are ignored;
- symbols without a positive source line are ignored for editor navigation;
- D8 symbol metadata is converted through the shared source-map symbol helper
  before the editor-specific `line` field is attached.

The provider also has smaller private helpers for target D8 path resolution and
AZMDoc contract parsing. These helpers preserve the existing behavior while
reducing the complexity of the public entry points that tests exercise for
definition lookup, hover formatting, workspace-symbol indexing, and stale
source-map detection.

Focused tests in `tests/extension/d8-definition-provider.test.ts` now cover the
pure editor-symbol conversion and collection behavior directly, alongside the
existing F12, hover, target path, and staleness helper coverage.

Verification:

```sh
npx vitest run tests/extension/d8-definition-provider.test.ts
npm run typecheck
npm run lint
npm exec --yes fallow -- audit --changed-since HEAD --format compact
npm run package:check --if-present
```

Fallow exits cleanly for the changed definition-provider files.

### 2026-06-11: Launch Source-State Test Fixture Cleanup

`tests/debug/launch-source-state.test.ts` now uses small local fixtures for the
repeated source-map launch setup. The cleanup keeps the behavior assertions and
D8 map contents visible in each test while sharing the boilerplate for:

- creating throwaway project roots, source files, hex artifacts, and build-map
  paths;
- writing minimal D8 maps with the standard header fields;
- invoking `buildLaunchSourceState` with fresh source/session state.

The focused tests still cover project-relative user sources, bundled MON-3 ROM
sources, build-artifact symbols, local project ROM maps, malformed build maps,
and unreadable auxiliary maps. This is intentionally test-only cleanup; it does
not touch production launch behavior.

Verification:

```sh
npx vitest run tests/debug/launch-source-state.test.ts
npm run typecheck
npm exec --yes fallow -- audit --changed-since HEAD --format compact
```

Fallow now exits cleanly for the changed launch-source-state test file.

### 2026-06-11: Shared Auxiliary D8 Map Collection

`src/debug/launch/launch-source-state.ts` now shares the best-effort auxiliary
D8 map read/parse loop used by ROM source collection. The two public outcomes
remain separate:

- `romSourcePaths` collects every non-empty file key from auxiliary maps;
- `autoOpenRomSourcePaths` selects the map-named primary source, falling back to
  the first source key.

The shared helper preserves the existing policy that malformed or missing
auxiliary maps are ignored for source opening; source-map symbol loading still
has its separate warning path. The focused launch-source-state test now asserts
that unreadable auxiliary maps leave both ROM source lists empty while keeping
valid build-artifact symbols.

Verification:

```sh
npx vitest run tests/debug/launch-source-state.test.ts
npm run typecheck
npm run lint
npm exec --yes fallow -- audit --changed-since HEAD --format compact
```

Fallow no longer reports production duplication in launch source-state for this
area. The remaining changed-file clone groups are repeated test-fixture setup
blocks, which are lower-risk and can be handled separately.

### 2026-06-11: Shared D8 Symbol Conversion

Launch source-state symbol loading and editor D8 navigation now share common D8
symbol metadata conversion through `src/debug/mapping/d8-symbols.ts`. The helper
copies the stable source-map symbol fields (`name`, `file`, optional `line`,
`address`, `value`, `size`, `kind`, and `scope`) without inventing absent
fields. Editor-specific concerns such as "line is required for navigation" stay
in `src/extension/d8-definition-provider.ts`.

This removes the Fallow-reported repeated optional-property object construction
from:

- `src/debug/launch/launch-source-state.ts`;
- `src/extension/d8-definition-provider.ts` symbol index construction;
- `src/extension/d8-definition-provider.ts` workspace-symbol flattening.

Focused tests in `tests/debug/d8-symbols.test.ts` characterize the shared field
copying behavior, including omission of undefined fields.

Verification:

```sh
npx vitest run tests/debug/d8-symbols.test.ts tests/debug/launch-source-state.test.ts tests/extension/d8-definition-provider.test.ts
npm run typecheck
npm run lint
npm exec --yes fallow -- audit --changed-since HEAD --format compact
```

Fallow exits cleanly for the changed-file gate. At the time of this change the
remaining changed-file clone group was the separate pair of auxiliary-map
collection loops inside `src/debug/launch/launch-source-state.ts`; that was left
as a distinct cleanup candidate.

### 2026-06-11: Shared D8 Source Path Resolution

Launch source-state loading and editor D8 navigation now share native source-map
file-key resolution through `src/debug/mapping/d8-source-paths.ts`. The helper
centralizes the behavior that both areas rely on:

- absolute D8 file keys remain absolute, with existing files canonicalized;
- relative file keys prefer existing files below supplied source roots;
- launch-side auxiliary maps still fall back beside the map file;
- editor navigation still falls back to the project root, preserving the old
  "project-relative missing file" behavior for F12/hover/workspace symbols.

`src/debug/launch/launch-source-state.ts` no longer owns a private
`resolveDebugMapFilePath` / `findPrimaryDebugMapSource` pair, and
`src/extension/d8-definition-provider.ts` now uses the same resolver when
opening definitions, workspace symbols, hover contract files, and staleness
checks. Focused tests in `tests/debug/d8-source-paths.test.ts` characterize the
shared path rules directly.

Verification:

```sh
npx vitest run tests/debug/d8-source-paths.test.ts tests/debug/launch-source-state.test.ts tests/extension/d8-definition-provider.test.ts
npm run typecheck
npm run lint
npm exec --yes fallow -- audit --changed-since HEAD --format compact
```

Fallow exits cleanly for the changed-file gate. At the time of this change it
still reported inherited duplication in D8 symbol-object construction and launch
auxiliary-map collection loops; those were left as separate cleanup candidates
to keep this path-resolution change behavior-preserving.

### 2026-06-11: Launch/Rebuild Source-State Setup Extraction

Launch and warm rebuild now share source-state setup helpers in
`src/debug/launch/source-state-build-options.ts`. The helper centralizes:

- launch session source-root construction and de-duplication;
- optional `asmPath` / `sourceFile` shaping;
- optional `artifactBase` / `outputDir` map-argument shaping;
- cached `SourceManager` creation for source-map path resolution.

This removes the Fallow-reported duplication between
`src/debug/launch/launch-source-state.ts` and
`src/debug/requests/rebuild-request.ts` without changing each path's source-root
policy: launch still seeds the session roots from configured roots, the entry
source directory, and project base; warm rebuild still rebuilds from the active
launch arguments and existing session mapping state.

`handleWarmRebuildRequest` also had its assembly-failure formatting moved into
small helpers so touching rebuild setup does not leave the changed file over the
complexity gate. New focused tests cover the shared option-shaping rules.

Verification:

```sh
npx vitest run tests/debug/source-state-build-options.test.ts tests/debug/launch-source-state.test.ts
npm run typecheck
npm run lint
npm exec --yes fallow -- audit --changed-since HEAD --format compact
```

Fallow now exits cleanly for this cleanup. Remaining clone groups are inherited
path-resolution helper similarities in launch source-state and the D8 definition
provider, plus small repeated test-fixture setup blocks in the focused
source-state tests.

### 2026-06-11: Launch Source Symbol Reader Extraction

`src/debug/launch/launch-source-state.ts` now splits source-map symbol loading
into focused private helpers for map-path collection, D8 parse/read warning
handling, per-file symbol conversion, individual D8 symbol conversion, and final
sorting. This keeps `buildLaunchSourceState` behavior unchanged while making the
symbol-reader branch easier to test and review.

Focused launch-source tests now cover two important failure boundaries:

- a malformed preferred build source map logs a source-map-symbol warning and
  does not invent synthetic symbols without a usable map;
- an unreadable auxiliary map logs a warning without discarding symbols from the
  valid build artifact.

Verification:

```sh
npx vitest run tests/debug/launch-source-state.test.ts
npm run typecheck
npm run lint
npm run package:check --if-present
npm exec --yes fallow -- audit --changed-since HEAD --format compact
```

Fallow still reports the inherited `buildLaunchSourceState` cyclomatic
complexity plus several small clone groups in launch source-state, definition
provider, and repeated launch-source test setup. The recommended next cleanup
target is the duplicated launch/rebuild source-root and map-argument setup,
because it appears in both changed-file Fallow output and the current
source-state orchestration.

### 2026-06-10: Full Code Quality Review (v0.1.22)

A full codebase review was performed with emphasis on the last ~30 commits
(releases 0.1.17–0.1.22). Findings are integrated throughout this document.

**Recent change concentration.** Almost all recent work clusters around TEC-1G
matrix keyboard behavior and reset/MON-3 RAM policy:

| Theme | Signal | Key files |
| ----- | ------ | --------- |
| Matrix modifier chords (Ctrl/Shift/Fn/Alt) | 10+ fix commits | `matrix-request.ts`, `matrix-ui.ts`, `launch-sequence.ts` |
| Keyboard capture vs. attachment | 3 commits | `matrix-ui.ts`, `matrix-routing-cue.ts`, `index.ts` |
| Reset preserves MON-3 monitor RAM | revert/re-apply cycle | `platform-requests.ts`, `provider.ts` |
| SD SPI / DS1302 DIAG protocol tests | 1 commit | `ds1302.ts`, `sd-spi.test.ts` |

Repeated fix commits on the same matrix/reset surface indicate policy-heavy,
multi-authority state that is hard to reason about and easy to regress. Tests
were added alongside fixes (good), but production complexity is mirroring into
931-line webview test files.

**Critical gaps identified.**

1. **TEC-1G matrix keyboard: fragmented state authority.** Matrix behavior
   spans `matrix-request.ts`, `launch-sequence.ts`, `provider.ts`, and
   `matrix-ui.ts` (695 lines) with overlapping mutable state (accordion
   attachment, keyboard capture, held keys, modifier maps, click-hold timers).
   The audit's documented invariants are correct, but implementation still
   spreads rules across closures and side-effect paths rather than a single pure
   state model.

2. **Webview boundary typing is now compiler-strict but still cast-heavy.**
   `webview/tsconfig.json` now enables `strict: true`. The remaining type-safety
   gap is not compiler flags; it is repeated DOM casts and untyped message
   boundary patterns in composition roots.

3. **Large dispatch/orchestration files remain expensive to change.** Direct
   safety tests now cover `launch-sequence.ts` and `io-handlers.ts`, but those
   modules are still broad composition surfaces. Future changes should keep
   their direct contract tests current instead of relying only on adapter/e2e
   coverage.

**Maintainability scorecard (2026-06-10).**

| Dimension | Rating | Notes |
| --------- | ------ | ----- |
| Architecture | Strong | Clear layers, plugin platforms, no circular deps |
| Type safety (`src/`) | Strong | Among strictest extension TS configs |
| Type safety (webview) | Moderate | `strict: true`; DOM/message boundaries remain cast-heavy |
| Test culture | Strong | Layered gates, DIAG-derived protocol tests |
| Documentation | Strong | Engineering manual + living audit |
| Complexity management | Moderate | Large files, UI state coupling |
| Change velocity risk | Moderate–High | Matrix/reset hot zones |

**Recommended immediate next step:** continue with small, test-first cleanup in
Phase 6/7 webview boundaries, or remove confirmed dead exports. Do not continue
splitting target selection unless new product behavior creates a clearer policy
boundary.

### 2026-06-07: TEC-1G Protocol Regression Depth

The TEC-1G SD SPI and DS1302 RTC tests now use the hardware DIAG routines as a
behaviour reference rather than treating the DIAG ROM as an opaque pass/fail
artifact. The SD test suite includes a DIAG-style card-info sequence covering
idle clocks, CMD0, CMD8, CMD55/ACMD41, CID, and CSD fields. The RTC suite now
checks DIAG setup behaviour and correct DS1302 clock burst ordering from the
seconds register. This corrected a protocol detail where clock burst reads had
started at minutes instead of seconds.

The broader regression strategy now documents this policy: import DIAG-derived
behaviour where it strengthens emulator confidence, but prefer focused
assertions against emulator state over wholesale interactive ROM tests.

## Audit Inputs

Commands used:

```sh
find src webview tests scripts -type f \( -name '*.ts' -o -name '*.js' -o -name '*.css' -o -name '*.html' -o -name '*.cjs' \) -print0 | xargs -0 wc -l | sort -nr | head -80
npm exec --yes fallow -- --only health --format markdown --summary
npm exec --yes fallow -- --only dead-code --format compact
npm exec --yes fallow -- --only dupes --format compact --dupes-mode mild
rg -n "Debug80-generated|listing-derived|lstLine|lstText|\\.debug80|cache|Ignoring legacy|legacy Debug80|asm80|ASM80|\\.lst|listing" src tests docs schemas resources package.json
```

Fallow reported:

- 65,853 total analyzed LOC.
- Average cyclomatic complexity: 2.1.
- P90 cyclomatic complexity: 4.
- Dead files: 0.2%.
- Dead exports: 4.7%.
- Average maintainability: 90.7.
- Circular dependencies: 0.
- Unused dependencies: 0.
- 141 functions above Fallow's complexity threshold.
- 66 dead-code/export findings.

These numbers should be treated as triage signals, not automatic verdicts.
Emulator and decoder code can be dense for legitimate reasons; product
orchestration code should be held to a stricter readability standard.

## Code Shape

Authored code is concentrated in these areas:

- `src/extension`: VS Code activation, commands, project config, webview wiring,
  target/source selection, CoolTerm integration, and UI reveal behavior.
- `src/debug`: debug adapter, launch pipeline, DAP requests, mapping services,
  runtime control, variables/watch/call-stack behavior.
- `src/platforms`: TEC-1, TEC-1G, simple platform runtime and panel integration.
- `src/z80`: CPU, decoder, runtime, instruction helpers.
- `webview`: platform panel front-end code and shared webview controls.
- `tests`: broad unit, webview, mapping, debug, platform, and adapter coverage.

Largest authored source files (2026-06-10):

| File                                               | Lines | Notes                                                                |
| -------------------------------------------------- | ----: | -------------------------------------------------------------------- |
| `webview/common/styles.css`                        |  1019 | Shared UI styling; high visual coupling across platform panels.      |
| `src/z80/decode-primary.ts`                        |   913 | Decoder table/logic; large but domain-driven.                        |
| `src/debug/session/runtime-control.ts`             |   736 | Run/step loops; partially refactored (Phase 4 complete).             |
| `webview/tec1g/matrix-ui.ts`                       |   695 | Matrix UI + input + protocol + rendering; recent regression hotspot. |
| `src/debug/requests/adapter-request-controller.ts` |   669 | DAP request orchestration; many responsibilities.                    |
| `src/debug/launch-args.ts`                         |   653 | Config discovery and merge behavior; cross-cutting and hard to scan. |
| `src/extension/platform-view-provider.ts`          |   543 | Webview provider state and messaging; high fan-out/fan-in.           |
| `src/debug/launch/config-validation.ts`            |   521 | Repetitive validators; good candidate for helper extraction.         |
| `src/platforms/tec1g/io-handlers.ts`               |   447 | TEC-1G port dispatcher; now has direct contract tests.               |
| `webview/common/memory-panel.ts`                   |   446 | Memory panel UI; register strip extracted (Phase 7 progress).        |
| `src/debug/launch/launch-sequence.ts`              |   369 | Launch orchestration; now has direct safety tests.                   |

## Findings

### P0: No Current Critical Architecture Failure

Fallow found no circular dependencies and no unused package dependencies. That
is important: the codebase is not trapped in an untestable dependency knot. The
cleanup programme can therefore be incremental and PR-driven.

### P1: Listing/Cache Retirement Policy Must Stay Explicit

Runtime behavior no longer depends on listing-derived source maps, and docs say
native AZM D8 maps are the source of truth. The old project-local cache
directory is ignored by `.gitignore` and should not be committed. Some
schema/runtime vocabulary still carries historical listing names because the
current native AZM D8 format still uses those field names for source context:

- `lstLine`, `lstText`, and `lstTextId` remain part of the D8 schema and D8
  mapping types.
- `mapping-service` now uses user-facing "source map" wording and avoids the
  older noisy file-list console dump.
- Tests assert non-native map rejection, cache-path rejection, compact summary
  output, and `lstLine` fallback behavior.

The policy needs to stay explicit:

- Allowed: native AZM D8 fields named `lstLine`/`lstText`, while AZM continues to
  emit them.
- Not allowed: project-local `.debug80/cache` discovery, generated map fallback,
  listing-derived map creation, or committed cache artifacts.

Required guardrails:

- Keep tests proving Debug80 does not create project caches.
- Keep user-facing messages compact and refer to "source maps" rather than D8
  internals unless the file format itself is being discussed.
- Keep source-map policy guardrails in tests and in `docs/codebase` aligned with
  runtime behavior.

### P1: TEC-1G Matrix Keyboard State Is Fragmented (Hot Zone)

The matrix keyboard subsystem is the highest regression-risk area as of
2026-06-10. State authority is split across four layers with overlapping
mutable state:

- `src/debug/requests/matrix-request.ts` — combo selection, held keys
- `src/debug/launch/launch-sequence.ts` — matrix trace hooks, session-held keys
- `src/platforms/tec1g/provider.ts` — hardware attachment, SYS_INPUT
- `webview/tec1g/matrix-ui.ts` — capture vs. attachment, modifier maps,
  click-hold timers, LED rendering

The documented invariants (accordion = attachment authority; capture = separate
focus state; reset reasserts matrix mode) are correct, but implementation still
spreads these rules across closures and side-effect paths. Recent releases
0.1.17–0.1.22 required 10+ fix commits on this surface.

Recommended approach:

- Extract a pure `MatrixKeyboardState` module with shared normalization helpers
  between backend and webview where semantics must align.
- Test state transitions in isolation before touching DOM or DAP.
- Keep attachment (hardware state) and capture (host-input focus state) as
  explicit, separately testable fields — do not re-couple them.
- Mirror backend modifier/caps semantics from `matrix-request.ts` in webview
  pure helpers rather than duplicating branch logic in event handlers.

### P1: Launch Orchestration Is Broad But Now Directly Tested

`src/debug/launch/launch-sequence.ts` (~370 lines) orchestrates assembly,
platform resolution, runtime creation, matrix trace setup, and artifact loading.
It was modified in recent matrix tracing work. Direct tests now cover the
highest-risk launch-session construction contracts, so the current risk is file
size and breadth rather than absence of coverage.

Recommended approach:

- Keep `tests/debug/launch-sequence.test.ts` current when launch-session
  construction changes.
- Add new cases only for new behavior; avoid duplicating adapter e2e coverage.

### P1: TEC-1G IO Handler Is Broad But Now Directly Tested

`src/platforms/tec1g/io-handlers.ts` (447 lines) centralizes port reads/writes
for LCD, GLCD, matrix, SD, RTC, 7-seg, and related peripherals. It now has
direct dispatcher contract tests in addition to peripheral-specific tests. The
remaining risk is that adding or changing one peripheral can still touch a broad
dispatcher surface.

Recommended approach:

- Keep `tests/platforms/tec1g/io-handlers.test.ts` aligned with any new port
  family or routing rule.
- Keep the port handler as a dispatch surface; move device-specific behavior
  into device adapters only when a real behavior change creates the need.

### P1: Webview Boundary Typing Remains Cast-Heavy

`webview/tsconfig.json` now enables `strict: true`, matching the main extension
compiler posture. The old compiler-flag gap has been closed. The remaining
webview type-safety work is at the DOM and message boundaries: composition roots
still have many ad hoc `as HTMLElement` casts and loosely grouped element
handles. These are safer than `any`, but they still make UI refactors easier to
break.

The safest first cleanup is the shared project-panel boundary, not the matrix
keyboard. `webview/simple/index.ts`, `webview/tec1/index.ts`, and
`webview/tec1g/index.ts` all repeat the same project controls:

- root selector and add-folder buttons;
- setup card, setup text, setup primary action, and initialize button;
- target and platform selects plus their surrounding project-control elements;
- stop-on-entry, source-map/hardware status lines, and platform display text.

Those handles are passed into both `createProjectStatusUi` and
`applyInitializedProjectControls`, so the current duplication is a real boundary
risk rather than just cosmetic repetition. A small helper can collect these
handles once, keep nullable optional elements explicit, and return typed bundles
for each consumer. That would reduce composition-root casts without changing
runtime behavior or touching the matrix keyboard state machine.

Recommended approach:

- Keep `strict: true` enabled for webview.
- Start with shared project-panel DOM handle bundles for `simple`, `tec1`, and
  `tec1g`.
- Cover the helper with focused DOM fixture tests before rewiring entrypoints.
- Keep matrix keyboard production code out of the first DOM-boundary cleanup.
- Continue using webview contract tests for panel order, matrix lifecycle, and
  platform update payloads.

Strict-null cleanup status:

```sh
npx tsc -p webview/tsconfig.json --noEmit --strictNullChecks true --pretty false
```

The first full webview `strictNullChecks` survey reported five errors:

- `webview/common/project-panel-state.ts`: `setupPrimaryAction` returns the
  optional result of `createProjectAction` on a branch where TypeScript cannot
  prove `selectedRoot` exists.
- `webview/simple/index.ts`, `webview/tec1/index.ts`, and
  `webview/tec1g/index.ts`: the add-folder button handlers dereference
  `platformSelectEl.value` even though the element is typed nullable.
- `webview/tec1g/tec1g-platform-update.ts`: `applyMatrixBrightness` accepts a
  required red-channel array, but the update path deliberately calls it when
  only green or blue brightness data is present.

That cleanup has now been applied. `webview/tsconfig.json` enables
`strictNullChecks`, and the boundary fixes are intentionally narrow:

- add-folder button handlers use platform-specific fallbacks if their select
  element is missing;
- project setup actions fall back to selecting a project if a create-project
  action cannot be formed;
- matrix brightness accepts partial channel updates at the type boundary.

The next strictness step was to survey `noImplicitAny` separately and continue
with small, behavior-preserving boundary passes.

No-implicit-any cleanup status:

```sh
npx tsc -p webview/tsconfig.json --noEmit --noImplicitAny true --pretty false
```

The first `noImplicitAny` survey reported only `webview/tec1g/matrix-ui.ts`
callback/helper parameters:

- `applyKeyboardCapture(enabled)` and `applyCapsLock(enabled)`;
- `shouldIgnoreKeyEvent(event)`;
- `setMatrixKeyPressed(key, pressed)`;
- `sendMatrixKey(key, pressed, mods, source)`;
- `setMatrixMod(mod, active)` and `armMatrixMod(mod)`.

That cleanup has now been applied. `webview/tsconfig.json` enables
`noImplicitAny`, and the matrix UI pass was limited to explicit parameter and
return types. Key-routing, modifier, capture, and timer behavior should remain
unchanged.

Full strict-mode status:

```sh
npx tsc -p webview/tsconfig.json --noEmit --strict true --pretty false
```

After the strict-null and no-implicit-any passes, full webview strict mode
reported no remaining compiler blockers. `webview/tsconfig.json` now enables
`strict: true`; the redundant individual strictness flags are no longer needed.

The next webview type-safety work should move from compiler flags to typed
message/DOM boundary cleanup: reduce `as HTMLElement` casts at composition
roots, group panel DOM handles into typed bundles, and keep behavior covered by
webview contract tests.

Project-panel boundary cleanup status:

`webview/common/project-panel-elements.ts` now collects the shared project
header/setup/status DOM handles for the `simple`, `tec1`, and `tec1g`
composition roots. It returns two typed bundles: one for
`createProjectStatusUi`, and one for `applyInitializedProjectControls`, plus
top-level handles for add-folder, platform selection, stop-on-entry, restart,
and toolbar controls.

This removes the most repetitive project-panel casts from the three webview
entrypoints without changing behavior. The helper is covered by
`tests/webview/common/project-panel-elements.test.ts`, and the existing project
status/control tests remain the main behavior guard.

Fallow now passes this changeset in new-only mode, but it still reports
warnings for inherited entrypoint debt because the entrypoint files are touched:
memory-view lookup duplication between `simple`, `tec1`, and
`tec1g-memory-views`, repeated update/message switch branches, and old
high-complexity message handlers. Treat those as separate goals; do not fold
them into project-panel cleanup.

The next DOM-boundary cleanup should be similarly scoped. Candidate areas:

- a typed `getRequiredElement` helper for platform-only elements that are
  currently asserted with non-null casts;
- message payload parsing at the `window.addEventListener('message', ...)`
  boundary.

Memory-view boundary cleanup status:

`webview/common/memory-view-elements.ts` now owns the fixed `view-a` through
`view-d` DOM lookup policy used by the Simple, TEC-1, and TEC-1G memory panels.
The Simple and TEC-1 entrypoints call it directly, while the TEC-1G platform
wrapper delegates to the same helper so the platform-facing API remains stable.
The helper is covered by `tests/webview/common/memory-view-elements.test.ts`.

This removes the repeated memory-view element arrays from the changed
entrypoints. Fallow still reports inherited warnings when those files are
touched, but the memory-view clone is gone. The remaining warnings now point at
older import similarity, repeated serial/message branches, and high-complexity
message/update handlers. Those should be handled as separate goals.

Do not use the next DOM-boundary pass to refactor matrix keyboard production
state. Matrix work should continue only through isolated characterization tests
or explicitly matrix-scoped goals.

Remaining webview-entrypoint survey (2026-06-11):

The current broad Fallow health pass reports no dead exports and keeps the main
webview entrypoint signals in the same places:

- `webview/simple/index.ts` still has a high-complexity message listener because
  it handles project/session/tab/serial/snapshot messages directly.
- `webview/tec1/index.ts` and `webview/tec1g/index.ts` still have inherited
  high-complexity message/update handlers, but the TEC-1/TEC-1G serial path is
  already delegated to `webview/common/serial-ui.ts`.
- Fallow duplication now points at import/message-handler similarity rather than
  the removed project-panel or memory-view element arrays.
- Renderer complexity in `glcd-renderer.ts` and `lcd-renderer.ts` is real but
  graphics-domain-specific, higher risk, and not the next cleanup target.
- Matrix keyboard complexity is still a known hot zone, but should not be folded
  into general webview cleanup.

The smallest safe next cleanup boundary is therefore the Simple webview's serial
terminal path. It should use the shared `wireSerialUi` helper where possible, or
the helper should be generalized just enough to support Simple's terminal-only
markup. This would remove duplicated serial message handling from
`webview/simple/index.ts` and lower its message-listener complexity without
changing platform behavior or touching matrix keyboard production code.

Simple serial boundary cleanup status:

`webview/common/serial-ui.ts` now accepts optional element IDs, so the Simple
platform's terminal-only serial surface can use the same serial message handler
as the TEC-1 and TEC-1G panels. `webview/simple/index.ts` no longer owns
terminal append/init/clear branches directly; it wires the shared helper with
`terminalOut` and `terminalClear`.

The Simple webview message listener was also split into tiny typed branch
handlers for project status, session status, tab selection, and memory snapshot
messages. The memory snapshot tail now uses
`webview/common/memory-panel-messages.ts`, keeping this cleanup at the message
boundary without touching matrix keyboard production code.

Serial UI coverage has been consolidated into `tests/webview/serial-ui.test.ts`.
The test covers Simple's terminal-only output/clear contract and the full
TEC-1/TEC-1G send/send-file/save/clear contract through the same helper.
Changed-file Fallow now passes for this cleanup.

Required DOM element lookup cleanup status:

`webview/common/dom-elements.ts` now provides small typed DOM lookup helpers for
required and optional element IDs/selectors. The helper gives composition roots
a single policy for missing required handles and wrong element classes instead
of repeating raw `as HTMLElement` assertions inline.

The first use is deliberately narrow and non-matrix: `webview/simple/index.ts`
and `webview/tec1/index.ts` now use the helper for platform entrypoint handles
such as display/keypad/status, panel roots, toolbar, and memory elements.
`webview/tec1g/index.ts` was left untouched in this pass to avoid folding matrix
keyboard production state into a generic DOM-boundary cleanup.

Focused coverage lives in `tests/webview/common/dom-elements.test.ts` and checks
optional lookup, required missing-element errors, mismatched element errors, and
selector lookup. Changed-file Fallow passes in new-only mode; it still reports
inherited TEC-1/TEC-1G message/update branch similarity when the TEC-1
entrypoint is touched. Treat that as a separate message-boundary cleanup goal.

TEC-1 message boundary cleanup status:

`webview/tec1/message-handler.ts` now owns the TEC-1 webview message dispatcher
that was previously inline in `webview/tec1/index.ts`. The composition root now
wires dependencies into a small handler factory, while the handler module owns
message routing for project status, session status/register refresh, selected
tab, update revision filtering, memory snapshots, and snapshot errors.

Focused coverage in `tests/webview/tec1-message-handler.test.ts` preserves the
old permissive boundary behavior: non-object messages are ignored, session
messages toggle register refresh only for running/paused, stale `uiRevision`
updates are ignored, equal revisions are still accepted, and unversioned updates
still apply. This reduces TEC-1 entrypoint message-listener complexity without
touching TEC-1G matrix keyboard production code.

Changed-file Fallow now passes. Remaining warnings are inherited and intentionally
separate: TEC-1 `applyUpdate` complexity and TEC-1/TEC-1G update-branch
similarity.

TEC-1 platform update cleanup status:

`webview/tec1/platform-update.ts` now owns the TEC-1 update application logic
that was previously embedded in the composition root. The entrypoint still
supplies the same display, speaker, audio, speed, LCD, and matrix dependencies,
but seven-segment updates, speaker/frequency updates, audio refresh, speed
changes, and renderer forwarding are now split into smaller tested operations.

Focused coverage in `tests/webview/tec1-platform-update.test.ts` preserves the
existing behavior: segment intensities win over digit masks, missing digits
fall back to an empty display, speaker CSS/frequency text/audio state update
together, invalid speed strings are ignored, and LCD/matrix renderers receive
the original payload. Changed-file Fallow now passes without the previous TEC-1
`applyUpdate` complexity finding. The remaining clone warnings are inherited
TEC-1/TEC-1G message/update branch similarity and should be treated separately.

### P1: Complex Dispatchers Need Smaller Units

Several high-complexity functions are dispatchers with many unrelated branches:

- `src/extension/platform-view-messages.ts:62` `handlePlatformViewMessage`
- `src/platforms/panel-messages.ts:70` `handleCommonPanelMessage`
- `src/debug/requests/adapter-request-controller.ts`
- `src/extension/debug-session-events.ts`
- `webview/common/project-status-ui.ts`

These are readable enough in isolation, but they are vulnerable to regression
because each new feature adds another branch into the same function. This is the
pattern behind several recent recurring issues: stale project state, source-map
diagnostics, matrix keyboard mode, and launch/open-file behavior.

Recommended approach:

- Convert message dispatchers to typed handler tables where practical.
- Move message payload parsing into tiny pure functions with tests.
- Keep orchestration files as composition roots, not logic sinks.
- Prefer one message family per module: project, serial, platform, target, AZM
  options, debug lifecycle.

Panel runtime message cleanup status:

`src/platforms/panel-runtime-messages.ts` now uses an explicit runtime message
type guard and a small handler table for active Z80 sessions instead of a
boolean `||` dispatch chain. The inactive-session behavior is intentionally
preserved: recognized runtime message types are absorbed when no Z80 session is
active, even if the payload would be invalid for an active target. That keeps
stale webview runtime events from surfacing as user-facing errors while still
requiring valid payloads and configured commands before forwarding to a live
debug session.

Focused coverage in `tests/platforms/panel-runtime-messages.test.ts` now locks
down inactive-session absorption, non-runtime rejection, valid active-session
dispatch, active-session payload/command validation, and the existing policy
that failed `customRequest` dispatches are treated as handled runtime messages.
This is a small common-panel parser cleanup and deliberately avoids the TEC-1G
matrix keyboard production path.

### P1: Runtime Control Loop Duplication Has Been Reduced

`src/debug/session/runtime-control.ts` previously duplicated substantial
structure between `runUntilStopAsync` and `runUntilReturnAsync`. Both had to
manage:

- runtime lookup,
- pause handling,
- breakpoint skip-once,
- stepping,
- halt detection,
- instruction limits,
- TEC timing throttling,
- host fairness yielding.

The first cleanup pass extracted the shared chunk loop, pause handling,
skip-breakpoint stepping, halt handling, instruction-limit checks, and throttle
selection into named helpers. `runUntilStopAsync` and `runUntilReturnAsync`
remain separate public flows, but now supply per-instruction iteration behavior
to one loop runner.

Remaining guidance:

- Keep this area behavior-first: changes must preserve pause, halt, breakpoint,
  skip-once, run-to-cursor, run-to-stack-return, and step-out semantics.
- Avoid a larger state-machine rewrite unless tests expand around every debug
  adapter control path.
- The e2e adapter step test now verifies stepping, source mapping, current DAP
  scopes, and PC evaluation without depending on the retired register scope.

### P1: Launch And Project Config Are Too Broad

`src/debug/launch-args.ts`, `src/debug/launch/config-validation.ts`,
`src/extension/project-config.ts`, `src/extension/project-target-selection.ts`,
and `src/extension/target-commands.ts` now encode a lot of product policy:

- workspace/project root discovery,
- default target resolution,
- target discovery conventions,
- bundled ROM asset resolution,
- platform profile merging,
- launch argument normalization,
- AZM option handling,
- launch-time source opening policy.

This is the area most likely to regress because it blends user workflow,
configuration schema, filesystem behavior, and debug launch behavior.

Recommended approach:

- Split target discovery from target selection/persistence.
- Move launch config merge rules into smaller named phases.
- Use a single source of truth for "target entry source" conventions.
- Replace repeated validators with a small validation helper API.
- Add cross-module contract tests for project initialization -> target discovery
  -> launch config -> AZM compile options.

### P2: Dead Export Surface Should Be Reduced

Fallow reported 66 dead-code/export findings. Some are likely false positives or
public extension seams, but several look like genuine cleanup candidates:

- `src/platforms/simple/ui-panel-state.ts`: all exports reported unused.
- `src/platforms/tec1/runtime.ts`: `TEC1_SLOW_HZ`, `TEC1_FAST_HZ`.
- `src/platforms/tec1g/constants.ts`: deprecated/unused aliases.
- `src/platforms/tec1g/glcd.ts`: `resetGlcdState`.
- `src/platforms/tec1g/matrix-keymap.ts`: `getMatrixCombosForChar`.
- `src/platforms/tec1g/runtime-matrix.ts`: `collectMatrixDutyBrightness`.
- `src/platforms/tec1g/tec1g-cartridge.ts`: `isTec1gCartridgeBootable`.
- `src/z80/decode.ts`: `createDecoder`.
- `src/z80/decode-cb.ts`: `executeCbPrefix`.

Recommended approach:

- Treat dead exports as a quick-win cleanup stream.
- For each finding, first `rg` the symbol and check whether it is used by tests,
  public API, dynamic imports, or intended extension contracts.
- Remove only confirmed dead exports, then run typecheck and targeted tests.

### P2: Duplication Is Manageable But Useful To Reduce

Fallow's duplication scan found many clones. Several are normal in tests or
opcode decoding. The ones worth addressing are product-level duplication:

- AZM artifact writing paths in `src/debug/launch/azm-backend.ts`.
- Config validation blocks in `src/debug/launch/config-validation.ts`.
- Source-map path caching duplicated between launch and rebuild paths.
- Memory read/render logic shared by variables, watches, and memory snapshots.
- Performance monitor shape duplicated between debug session and extension UI.
- Platform panel boilerplate duplicated across TEC-1 and TEC-1G.
- Webview platform entry files repeating bootstrap and message wiring.

Recommended approach:

- Avoid abstracting opcode decoder duplication unless a bug or performance
  reason appears.
- Extract shared product utilities where duplication directly affects recent
  feature work.
- Start with validators, AZM artifact handling, memory symbol reads, and panel
  bootstrap code.

### P2: Webview CSS And Composition Need Boundaries

`webview/common/styles.css` is over 1000 lines and carries shared styling for
many UI concepts. `webview/tec1g/index.ts` is a large composition root with many
DOM handles and controller wires. This has been workable, but every layout
iteration increases the chance of accidental cross-panel styling changes.

Recommended approach:

- Split CSS into stable groups: accordion/layout, project controls, memory panel,
  serial UI, keypad/display primitives.
- Keep platform-specific CSS in platform-specific files.
- In webview composition roots, group DOM handles by panel and pass typed
  element bundles into feature setup functions.
- Add visual/DOM contract tests for accordion order, panel open behavior, matrix
  mode activation, and serial/matrix panel sizing.

### P2: TEC-1G Peripheral Code Is Improving But Needs Protocol Boundaries

Recent work improved SD SPI, RTC, matrix keyboard, display scanning, and
CoolTerm behavior. The code now has good low-level tests (including DIAG-derived
SD SPI and DS1302 RTC protocol coverage), but `io-handlers.ts` still
centralizes many unrelated port behaviors. Direct dispatcher contract tests now
cover this surface, so the remaining risk is broad routing responsibility rather
than absent direct coverage.

Recommended approach:

- Keep the port handler as a dispatch surface, but move device-specific read and
  write behavior into device adapters.
- Give each peripheral a small contract test suite: port writes, reads, reset
  state, UI payload emission, and timing/duty-cycle behavior where applicable.
- For future Storage/RTC/Joystick UI accordions, add runtime state queries before
  building UI so panels can be tested independently from DOM rendering.

### P2: Coverage Gate Excludes Substantial Core Paths

`vitest.config.ts` excludes from the 80% threshold: entire Z80 core
(`cpu.ts`, `runtime.ts`, `decode.ts`), platform runtimes (`tec1/runtime.ts`,
`tec1g/runtime.ts`), extension entrypoints (`extension.ts`, `commands.ts`,
`platform-view-provider.ts`), and the DAP session (`adapter.ts`). This is honest
and documented, but `npm run coverage` can pass while core execution paths are
integration-tested only.

Recommended approach:

- Re-evaluate whether `z80/runtime.ts` can accept partial unit coverage.
- Keep exclusions documented; do not treat the 80% gate as full-core coverage.

### P3: Tests Are Strong But Heavy And Duplicated

The test suite is broad, which is a strength (~150 test files, layered gates:
unit, webview contracts, adapter E2E, VS Code smoke, package verify). Recent
hot zones have excellent targeted coverage (`matrix-request.test.ts`,
`tec1g-matrix-ui.test.ts`, `platform-requests.test.ts`). The downside is
duplicated fixture setup and test files that mirror production complexity:

| Test file | Lines | Concern |
| --------- | ----: | ------- |
| `tests/extension/commands.test.ts` | 1703 | Repeated VS Code mock setup |
| `tests/extension/platform-view-provider.test.ts` | 1021 | Large integration harness |
| `tests/webview/tec1g-matrix-ui.test.ts` | 931 | Mirrors matrix-ui complexity |

**Coverage gaps (2026-06-10):**

| Area | Status |
| ---- | ------ |
| `launch-sequence.ts` | Direct safety tests added |
| `io-handlers.ts` | Direct dispatcher tests added |
| `auto-rebuild.ts` | Only referenced in cross-layer contract test |
| Z80 `cpu.ts` / core execution | Excluded from coverage; adapter/runtime tests only |
| Webview `tec1g/index.ts` composition root | Partially covered via integration-style tests |

Recommended approach:

- Add shared builders for VS Code command mocks, debug sessions, platform view
  fixtures, and D8 maps.
- Keep low-level unit tests local and explicit.
- Refactor only repeated fixture setup, not the assertions themselves.

Completed fixture cleanup:

- Added shared e2e adapter helpers for workspace harness creation, harness
  disposal, launch/configuration, and top stack-frame reads.
- Moved repeated setup out of the step, terminate, adapter, and source-map e2e
  tests while keeping each test's assertions local.
- Consolidated `tests/debug/adapter-integration.test.ts` onto the same DAP
  stream harness helpers where practical. The integration test keeps local
  helpers only for temp project creation and mocked extension-root policy.
- Fallow reports zero duplication in the changed adapter integration file. Its
  remaining warning is the large TEC-1G/MON-3 golden contract scenario, which is
  test-specific behavior coverage rather than repeated harness setup.

## Proposed Cleanup Programme

Phases 1–4 are complete. Phases 5–7 remain. Phase A (hot-zone stabilization)
is the recommended immediate next step based on the 2026-06-10 review.

### Phase A: Stabilize Hot Zones (Highest ROI)

Goal: reduce matrix/reset/launch regression risk without UX changes.

Candidate work:

- Extract pure `MatrixKeyboardState` helpers from `webview/tec1g/matrix-ui.ts`
  — modifier normalization, click-hold timing, capture vs. attachment routing.
  Mirror backend semantics from `matrix-request.ts` where they must align.
- Add `tests/debug/launch-sequence.test.ts` — mock filesystem, assembler,
  platform registry; cover missing inputs, artifact resolution, matrix trace
  flag, platform kind selection.
- Add `tests/platforms/tec1g/io-handlers.test.ts` — one describe block per port
  family (keyboard, matrix, SYS_CTRL, SD, RTC).
- Centralize `TEC1G_MON3_MONITOR_RAM_START/END` as a single source of truth and
  name reset policy explicitly in tests: reload program bytes, preserve monitor
  RAM `0x0800..0x0fff`, reset devices, reassert matrix attachment.

Verification:

```sh
npm run typecheck && npm run typecheck:webview
npm test -- tests/debug/launch-sequence.test.ts tests/platforms/tec1g/io-handlers.test.ts
npm run test:webview -- tests/webview/tec1g-matrix-ui.test.ts
npm test -- tests/debug/platform-requests.test.ts tests/platforms/provider.test.ts
```

### Phase 1: Remove Confirmed Dead Surface

Goal: reduce noise without changing behavior.

Candidate work:

- Keep `.debug80/cache` artifacts out of the repository.
- Remove dead simple platform UI state exports if confirmed unused.
- Remove unused TEC-1 and TEC-1G constants/helpers.
- Remove stale integration test extension id `jhlagado.z80-debugger` if no
  longer relevant.
- Re-run Fallow dead-code and record remaining intentional false positives.

Verification:

```sh
npm run typecheck
npx vitest run tests/debug/path-resolver.test.ts tests/debug/mapping-service.test.ts
npm exec --yes fallow -- --only dead-code --format compact
```

### Phase 2: Document And Enforce Source-Map Fallback Policy

Goal: make native AZM D8 behavior explicit and prevent old listing fallback from
returning.

Completed guardrails:

- Moved source-map policy into tests and the Debug80 Engineering Manual.
- Renamed user-facing mapping messages away from "legacy" and toward compact
  "source map" wording.
- Keep compatibility with current AZM field names, but document that
  `.debug80/cache` discovery is not allowed.
- Added tests that fail if `.debug80/cache` is selected as a source-map
  location, if non-native maps are accepted, or if the old noisy file-list dump
  returns.

Verification:

```sh
npm run typecheck
npm run test -- tests/debug/path-resolver.test.ts tests/debug/mapping-service.test.ts tests/mapping/d8-map.test.ts
```

### Phase 3: Split Product Dispatchers

Goal: make new UI/debug features less likely to regress unrelated behavior.

Completed work:

- Split `handlePlatformViewMessage` into project/session, serial, and
  platform-specific message-family handlers.
- Split common panel message handling into layout/refresh, register/memory edit,
  and runtime control handlers.
- Added focused tests around payload parsing, command dispatch, malformed known
  messages, and inactive-session behavior.
- Added reusable test fixtures for platform-view dependency mocks, panel message
  contexts, and refresh controllers so future routing tests do not repeat setup
  blocks.
- Fallow changed-file audit reports zero dead-code and zero complexity findings
  for the dispatcher/fixture cleanup.

Verification:

```sh
npm run typecheck
npm run test -- tests/extension/platform-view-messages.test.ts tests/platforms/panel-messages.test.ts tests/extension/platform-view-memory-refresh.test.ts
npm exec --yes fallow -- audit --changed-since HEAD --format compact
```

### Phase 4: De-duplicate Runtime Control

Goal: keep stepping/running behavior stable while reducing duplicate loop logic.

Completed work:

- Extracted a shared `runRuntimeLoop` chunk runner used by normal run and
  step-out flows.
- Extracted shared pause, skip-breakpoint, halt, breakpoint stop,
  instruction-limit, loop-state, monitor, and throttle/yield helpers.
- Kept `runUntilStopAsync` and `runUntilReturnAsync` as the public behavior
  boundaries so their different stop semantics stay visible.
- Reused capability construction for TEC-1 and TEC-1G runtime timing hooks.
- Fallow changed-file audit reports zero dead-code findings, zero complexity
  findings, and zero gated duplication issues for this pass.

Verification:

```sh
npm run typecheck
npx vitest run tests/debug/runtime-control.test.ts tests/debug/adapter-request-controller.test.ts
npm exec --yes fallow -- audit --changed-since HEAD --format compact
```

Additional note:

```sh
npx vitest run -c vitest.e2e.config.ts tests/e2e/adapter/adapter.e2e.test.ts tests/e2e/adapter/step.test.ts tests/e2e/adapter/terminate.test.ts tests/e2e/adapter/source-maps.e2e.test.ts
```

This e2e adapter step test has been repaired as a runtime-control gate. It no
longer expects the retired DAP register scope; instead, it verifies that stepping
lands on the expected mapped source line, DAP scopes expose the current Symbols
scope, and the `PC` register is available through the watch/evaluate path. The
e2e Vitest config now uses `cacheDir`, removing the previous cache deprecation
warning from this gate. The surrounding e2e adapter tests now share harness
setup and stopped-frame helpers, reducing repeated launch/stop boilerplate.

### Phase 5: Split Launch/Project Policy

Goal: isolate target discovery, project persistence, launch config merging, and
source opening policy.

Candidate work:

- Create a dedicated target discovery module with one exported convention list.
- Create a launch config merge helper with named stages.
- Reduce duplication between target commands and target selection.
- Keep user-facing workflow unchanged.

Verification:

```sh
npm run typecheck
npm run test -- tests/extension/project-target-selection.test.ts tests/extension/target-commands.test.ts tests/debug/launch-args.test.ts tests/debug/config-validation.test.ts
```

### Phase 6: Webview Boundary Cleanup

Goal: make panel UI changes safer.

Candidate work:

- Split `webview/common/styles.css` by concern.
- Group TEC-1G DOM handles into typed element bundles.
- Add DOM tests for panel order, matrix-mode lifecycle, and display/machine
  layout invariants.

Verification:

```sh
npm run typecheck:webview
npm run test:webview
```

### Phase 7: Main Panel UI State Harmonization

Goal: study and simplify the Debug80 main panel accordion implementation now
that the product shape is clearer. This is primarily a UI design and
state-management audit, not a dead-code cleanup pass. The current UI works, but
several panels grew on different timelines and use different local state styles,
fallbacks, and message paths. The main question for each panel is: "what is the
single authority for this state, and can the UI reach the same state through
more than one path?"

Future work should make each panel follow the same pattern:

1. normalize incoming extension/platform payloads into a small panel state,
2. derive pure UI actions from that state,
3. keep DOM mutation/rendering in small named helpers,
4. keep VS Code message posting at the panel boundary.

This mirrors the completed Project panel cleanup and should reduce recurring
race-condition risks without changing user-visible behavior.

Design risks to look for before changing code:

- multiple authorities for the same state, for example extension session state,
  webview local fields, DOM `hidden` flags, and VS Code persisted webview state
  all independently implying whether a panel is active;
- compatibility fallbacks that were useful while requirements were unclear but
  now allow ambiguous behavior;
- event handlers that read stale local state when a live DOM value is the real
  user selection, or the inverse;
- panel lifecycle rules hidden inside unrelated code, such as matrix-mode
  activation being coupled to accordion state;
- state transitions that are only implied by DOM mutation instead of being
  represented by a named state model;
- rendering code that also decides business policy, such as whether a key event
  belongs to matrix keyboard or keypad.

Findings from the latest UI audit:

- `webview/common/memory-panel.ts` (446 lines after register-strip extraction)
  still combines anchor resolution, symbol lookup, memory dump rendering, edit
  validation, readonly-memory policy, and refresh messaging. Register rendering
  now lives in `register-panel.ts`, but memory and register panels still share
  refresh coordination through `MemoryPanel`. Further split of memory-only
  subcontroller state is lower priority than matrix keyboard work.
- `webview/tec1g/matrix-ui.ts` (695 lines) remains the highest-priority UI
  hotspot. It combines RGB matrix rendering, keyboard layout construction,
  modifier state, caps-lock behavior, mouse events, physical keyboard routing,
  and message posting. Attachment (accordion/MON-3 Matrix CONFIG) and capture
  (host-input focus) are now separate concepts (see Latest Goal Note below),
  but state is still spread across closures rather than a pure
  `MatrixKeyboardState` / `MatrixKeyEvent` model. The next cleanup should
  extract pure helpers so modifier/caps behavior and routing decisions can be
  tested without DOM focus accidents.
- `webview/common/accordion-layout.ts` owns persisted open state, panel order,
  provider tab compatibility, memory row sizing, register auto-refresh, and
  matrix-mode lifecycle notification. The design issue is that one controller
  decides visual layout, VS Code compatibility tab state, and runtime refresh
  policy. It is readable, but it has become a central coordinator for unrelated
  policies.
- `webview/tec1g/index.ts` is a composition root and therefore expected to be
  broad. It currently also handles message dispatch, initial UI rehydration,
  keypad/matrix focus routing, and project-status propagation. The design
  issue is that startup state replay and live message updates are not clearly
  distinguished, even though regressions often happen at that boundary.
- `webview/tec1g/glcd-renderer.ts` and `webview/tec1g/lcd-renderer.ts` contain
  dense drawing logic. Fallow flags both renderers, especially GLCD `draw`.
  This is mostly legitimate graphics complexity, but helper extraction would
  make the rendering rules easier to verify: background fill, graphics plane,
  text overlay, reverse rows, and cursor pass should be named stages.
- `src/platforms/tec1g/ui-panel-state.ts` and
  `webview/tec1g/tec1g-platform-update.ts` both apply partial TEC-1G update
  payloads in long field-by-field functions. These should share small
  normalizers for fixed-length byte arrays and optional state patches so the
  backend rehydration model and webview update model stay aligned.
- Memory view DOM descriptors are duplicated between Simple, TEC-1, and TEC-1G
  webviews. A shared `createMemoryViews(ids)` helper would remove repeated A-D
  DOM lookup blocks and make future memory panel changes safer.

Suggested goal order:

1. **Memory/register panel split**: extract register item construction and
   register edit handling from `MemoryPanel`, leaving memory dump state and
   register strip state as separate subcontrollers. Add focused tests for
   register rendering/edit messages and memory edit messages.
2. **Shared memory view descriptors**: replace repeated A-D DOM lookup blocks
   in Simple, TEC-1, and TEC-1G with a common helper. This is low-risk and
   removes known duplication before deeper memory work.
3. **Matrix keyboard state model**: introduce pure helpers for modifier/caps
   state, key normalization, and click/keyboard event payload derivation. Keep
   DOM rendering separate. This directly protects the recent matrix keyboard
   behavior.
4. **Accordion controller split**: extract persisted accordion state/order
   helpers and isolate runtime side effects such as register auto-refresh,
   memory resize, and matrix-mode notification.
5. **TEC-1G update normalizers**: add shared fixed-length array and state patch
   helpers for `ui-panel-state` and `tec1g-platform-update`, preserving payload
   compatibility.
6. **Renderer pass extraction**: split LCD/GLCD drawing into named render
   passes. This is readability work, not a behavior change; verify with
   renderer tests or screenshot/pixel tests if available.
7. **Composition-root message dispatcher**: move `message.type` dispatch and
   startup replay in `webview/tec1g/index.ts` into small functions after the
   panel-specific cleanups have reduced coupling.

Verification:

```sh
npm run typecheck:webview
npx vitest run -c vitest.webview.config.ts tests/webview/common tests/webview/tec1g
npm run typecheck
npx vitest run tests/extension/platform-view-provider.test.ts tests/platforms/tec1g
npm exec --yes fallow -- health --format compact --top 40
```

Notes:

- Treat Fallow as a locator only. The main purpose of this phase is to remove
  redundant state paths and inherited fallbacks, not to chase metric scores.
  Renderer complexity and Z80 decode complexity are sometimes legitimate;
  refactor only when named helper boundaries make the hardware behavior easier
  to understand or test.
- Avoid changing accordion defaults, MON-3 matrix-mode behavior, focus routing, or
  display brightness during structural cleanup. Those are product behavior
  changes and should be separate goals.
- Prefer small, behavior-preserving goals. The main risk in this UI is not a
  single large file; it is several independent state models drifting apart.

### Latest Goal Note: Engineering Manual Moved Into Repo

The Debug80 Engineering Manual has moved from `debug80-docs/codebase` into this
repository at `docs/codebase`. User-facing guides and AZM books remain published
through `debug80.com`, but the codebase reference now lives beside the source it
describes.

Repo-local docs should avoid reviving old duplicate planning notes. The intended
shape is now `docs/codebase` for the engineering manual plus the checkout
release process, regression strategy, and active code-quality audit notes.

## Quality Criteria For Future PRs

### Latest Goal Note: Matrix Keyboard Routing Cue

The TEC-1G webview now shows a passive Machine-panel cue when the Matrix
Keyboard accordion is open. The cue marks the keypad as disabled and marks the
Matrix Keyboard accordion header as active, but it does not introduce a second
host-keyboard routing setting. The accordion open state remains the single
authority for physical keyboard routing and MON-3 Matrix CONFIG attachment.

This is a deliberate state-management constraint: future matrix-keyboard UI
work should keep routing indicators derived from the accordion/controller
state instead of adding independent flags that can drift after webview reloads.

### Latest Goal Note: Matrix Keyboard Attachment

The TEC-1G matrix keyboard accordion now represents the keyboard being attached.
On hardware, magnets on the keyboard trip a reed switch that sets the MON-3
Matrix CONFIG input. In Debug80, opening the accordion enables host keyboard
capture and sets `SYS_INPUT` / port `0x03` bit `0`; closing it releases held
matrix keys, disables host keyboard capture and clears that bit.

RESET is intentionally excluded from the disabled scanned-key group. It remains
available while the matrix keyboard is attached because it models a board reset
button rather than a scanned monitor key.

Mouse-clicked matrix keys now use a short webview-side hold window. This avoids
a race where browser `mousedown`/`mouseup` can press and release a matrix key
between MON-3 polling samples, while preserving direct keydown/keyup behavior
for the physical PC keyboard.

RESET now carries the webview's matrix-accordion state through the TEC-1G panel
message path. If the Matrix Keyboard accordion is open, Debug80 performs the
board reset first and then reasserts MON-3 Matrix CONFIG, keeping the runtime in
sync with the visible attached-keyboard state.

The same sync is now applied when a debug session starts with the Matrix
Keyboard accordion already open from persisted UI state. The webview reasserts
matrix mode when the session becomes running/paused, and when a platform update
reports matrix mode off while the accordion is visibly attached.

This matches the practical hardware model while keeping the raw matrix keyboard
port `0xFE` readable by programs that poll it directly.

### Latest Goal Note: TEC-1G SYS_CTRL Bit Contract

The TEC-1G `SYS_CTRL` decoder now follows MON-3 for caps lock: bit `0x80`
is CAPSLOCK. Bits `0x08`, `0x10`, `0x20`, and `0x40` are treated as the
four Memory Expansion bank lamps in the webview, with bit `0x08` still serving
as the current two-bank `E_A14` selector for the 0x8000-0xBFFF window.

This removes a stale emulator assumption where bit `0x20` was shown as CAPS.
Future expansion-deck work should keep MON-3 source as the source of truth for
port contracts and avoid assigning user-visible meanings to SYS_CTRL bits
without a regression test in both the decoder and webview status layer.

### Latest Goal Note: Project Panel State Simplification

The project panel webview now uses a canonical `ProjectPanelState` model and
pure action helpers for setup, initialization, target selection, and CoolTerm
send actions. This replaces the previous split between `project-state`,
`setup-card-state`, `create-project`, local `currentRootPath` fields, and
setup-card action flags.

The remaining compatibility fallback for compact project payloads lives in one
normalizer, `createProjectPanelState`, instead of being duplicated across DOM
controllers. Future project-panel changes should add state/action tests first
and avoid introducing new root-selection fallback in button handlers.

### Latest Goal Note: Register Strip Extraction

The register strip has been split out of `MemoryPanel` into
`webview/common/register-panel.ts`. `MemoryPanel` still coordinates memory
anchors, memory dumps, readonly-memory policy, and snapshot requests, but
register item construction, register DOM rendering, focused-register refresh
preservation, and register edit messages now live behind a focused
`RegisterPanel` controller.

This removes one mixed responsibility from the memory controller and gives
register behavior direct tests. Fallow still reports inherited complexity in
memory anchor/edit paths, but the previous register-rendering complexity is no
longer part of `MemoryPanel`.

### Latest Goal Note: TEC-1G Matrix Keyboard Capture State

The TEC-1G webview now separates matrix keyboard attachment from physical PC
keyboard capture. Opening the Matrix Keyboard accordion still represents the
hardware being attached and keeps MON-3 matrix mode active, but physical host
keystrokes are only routed to the matrix keyboard after the user clicks an
emulator surface. Plain `Escape` is delivered to MON-3 as the matrix ESC key;
clicking outside those surfaces releases capture, `Cmd/Ctrl+Escape` is a
host-only release chord, and webview blur releases held matrix keys.

This removes an implicit coupling where "accordion open" meant both hardware
attached and physical keyboard captured. Future keyboard work should preserve
that distinction: attachment is hardware state, capture is host-input focus
state. Any new path that disables capture must release held keys and refresh the
visible routing cue.

Matrix keyboard invariants to preserve before any future refactor:

- Accordion open state is the hardware attachment authority. When the Matrix
  Keyboard panel is open, MON-3 matrix mode should be asserted; when it is
  closed, the hex keypad path owns normal keyboard input again.
- Capture is not attachment. Capture decides whether physical host keyboard
  events and clicked matrix keys are routed into the matrix keyboard. Matrix
  attachment can be active while capture is released.
- Modifier keys are emulator state, not DOM decoration. Shift and right Shift
  are one-shot modifiers unless Caps Lock is active. Ctrl, Fn, and Alt are
  one-shot modifier chords. Caps Lock is a toggle and should not clear itself
  after one key.
- Held-key state must be released on blur, capture release, reset, and matrix
  attachment changes. Any new release path must refresh the visible routing cue
  and key highlights.
- Mac `Meta`/Command is a host workaround for control-style matrix input, not a
  TEC-1G hardware modifier. It must not leak into persisted matrix state as a
  separate hardware key.
- Plain `Escape` is a matrix key while capture is active. Host-only capture
  release uses the explicit release chord/path, not by stealing MON-3 ESC.

The direct safety tests added in this pass intentionally avoid refactoring
`matrix-ui.ts`. The next matrix cleanup should first add pure state tests for
these invariants, then extract helpers in very small moves with no user-visible
behavior changes.

### Latest Goal Note: Matrix Keyboard Characterization Tests

The current matrix keyboard pass adds characterization coverage before any
state-helper extraction. `tests/webview/tec1g-matrix-ui.test.ts` now explicitly
locks down that clicked Ctrl, Fn, and Alt modifiers are one-shot chords; Caps
Lock is a persistent toggle that can be turned off without leaving Shift
latched; clicked matrix keys are ignored until keyboard capture is active; and
host `Meta`/Command is delivered as matrix Ctrl without lighting or latching the
on-screen Control key.

`tests/webview/common/accordion-layout.test.ts` now covers the restored-open
Matrix Keyboard lifecycle. If the webview starts with the Matrix Keyboard panel
already open from persisted VS Code state, the accordion controller exposes the
open state without synchronously firing callbacks during construction; the
TEC-1G composition root explicitly calls `notifyInitialOpenPanels()` after
`panelLayout` exists. This keeps MON-3 matrix mode aligned with the visible
accordion state without requiring the user to close and reopen the panel.

The only production change in this pass is that initial attachment notification
hook in `accordion-layout.ts` and the TEC-1G composition root call site.
`webview/tec1g/matrix-ui.ts` remains unrefactored. Future matrix cleanup should
preserve these characterization tests and use them as the safety net for
extracting pure state helpers.

### Latest Goal Note: First Matrix State Helper Extraction

The first behavior-preserving matrix extraction is now isolated in
`webview/tec1g/matrix-state.ts`. It contains only pure decisions that were
already covered by characterization tests: matrix modifier names, one-shot
modifier clearing, Caps-driven click modifiers, matrix key id construction,
physical host-key normalization through `event.code`, `Meta`/Command-as-Ctrl,
and the modified-Escape host release chord.

`webview/tec1g/matrix-ui.ts` still owns DOM rendering, key highlights, timers,
held-key maps, message posting, and click/keyboard event wiring. This keeps the
first extraction deliberately small while removing duplicated policy from the
UI controller. Future extractions should continue this pattern: add direct
helper coverage first, move one pure decision at a time, and leave visible
keyboard behavior protected by `tests/webview/tec1g-matrix-ui.test.ts`.

### Latest Goal Note: Matrix Held-Key Transition Extraction

The second behavior-preserving matrix extraction moves held-key transition
bookkeeping into `webview/tec1g/matrix-state.ts`. The helper now owns the pure
rules for held key ids, first press vs. duplicate press, release of a currently
held key, modifier snapshotting, and draining all held keys for blur/reset/capture
release paths.

`webview/tec1g/matrix-ui.ts` still owns the side effects around those
transitions: cancelling click-release timers, posting messages, updating DOM
pressed classes, and clearing physical/click modifier maps. This keeps the
fragile matrix keyboard behavior stable while making the transition policy
directly testable in `tests/webview/tec1g-matrix-state.test.ts`.

### Latest Goal Note: Phase 1 Dead-Surface Cleanup

The Phase 1 dead-surface pass re-ran Fallow dead-code after the matrix cleanup
work. The old 66-finding report is no longer current: Fallow now reports no
actionable TypeScript/JavaScript dead-code findings after confirmed dynamic
entrypoints are documented in `.fallowrc.json`.

The only JavaScript candidate was `tests/integration-vscode/suite/index.js`.
That file is not dead: `tests/integration-vscode/runTest.js` passes it to
`@vscode/test-electron` as the VS Code extension-host smoke-test entrypoint.
The pass made that entrypoint explicit and removed the retired
`jhlagado.z80-debugger` fallback id from the smoke assertion.

The remaining possible Fallow false positives are webview CSS runtime assets:
`webview/common/styles.css`, `webview/simple/styles.css`,
`webview/tec1/styles.css`, and `webview/tec1g/styles.css`. These are loaded
through the webview HTML/build pipeline rather than TypeScript imports, and
the existing `.fallowrc.json` `dynamicallyLoaded` patterns keep them marked as
intentional runtime assets. The dead-code command is therefore useful again as a
clean gate:

```sh
npm exec --yes fallow -- --only dead-code --format compact
```

### Latest Goal Note: Phase 5 Target Discovery Split

Phase 5 has started with a behavior-preserving target-discovery extraction.
Runnable target entry conventions now live in `src/extension/target-discovery.ts`
instead of being mixed into AZM source-extension helpers or project config
helpers. The new module owns the convention list:

- exact file name: `main.asm`
- suffix: `.main.asm`
- excluded discovery directories such as `build`, `out`, `.vscode`, and
  `node_modules`

This keeps runnable target discovery separate from broader AZM language/source
support. `.z80`, `.asm`, and `.asmi` remain supported for language association
and AZM rebuild/source handling, but `.z80` is not an automatically discovered
runnable target unless explicitly configured by the user.

Production callers that perform target discovery now use
`listTargetEntrySourceFiles()` directly. `project-config.ts` no longer owns
filesystem target discovery, and the old `isAzmEntrySourcePath()` helper was
removed so there is only one target-entry convention source.

### Latest Goal Note: Phase 5 Launch Config Merge Staging

Launch config merge policy has been split out of `src/debug/launch-args.ts`
into `src/debug/launch/launch-config-merge.ts`. The public
`populateFromConfig()` entry point remains unchanged, but `launch-args.ts` now
owns only config discovery/loading and target selection before delegating to the
staged merge helper.

The extracted helper keeps the existing merge order explicit:

- root project config
- selected target config
- explicit launch request arguments
- nested platform block merges
- source, artifact, execution, AZM, bundled ROM, and debug-map resolution

Focused tests in `tests/debug/launch-config-merge.test.ts` now pin the staging
behavior directly, including explicit argument precedence, TEC-1G `romHex`
preservation, and bundled MON-3 debug-map inference. This makes future launch
policy cleanup possible without using the full adapter launch path as the only
safety net.

### Latest Goal Note: TEC-1G Reset Preserves MON-3 Monitor RAM

The TEC-1G reset request reloads the launch image, resets platform devices, and
then restores MON-3's monitor RAM page (`0x0800..0x0fff`). This keeps app/code
memory deterministic after a Debug80 reset while preserving the MON-3 warm-boot
state that lives in monitor RAM, including `ROMSIG`, `MCB`, and `SYS_MODE`.

Future reset/rebuild work should keep this split explicit: Build/rebuild and
panel Reset may reload program bytes, but the TEC-1G provider must preserve the
MON-3 monitor RAM range so MON-3 can distinguish hard initialization from soft
boot without carrying stale user RAM into the next run.

### Latest Goal Note: Direct Launch And IO Safety Coverage

`tests/debug/launch-sequence.test.ts` now exercises `buildLaunchSession`
directly with a temporary native D8 map and HEX artifact. This covers workspace
base resolution, platform selection, target source-map loading, symbol
publication, runtime creation, and missing-HEX failure before runtime mutation.

`tests/platforms/tec1g/io-handlers.test.ts` now exercises the TEC-1G port
dispatcher directly. It covers keyboard/matrix/status reads,
enabled-vs-disabled RTC and SD routing, LCD/GLCD command/data dispatch,
SYS_CTRL decoding, and RGB matrix latch updates.

These tests are safety rails only. They are deliberately contract-focused and
should not be expanded into brittle assertions for every internal call order.

Use these criteria when deciding whether cleanup is worthwhile:

- Does it remove obsolete behavior, not just move code around?
- Does it make a recurring regression harder to reintroduce?
- Does it reduce a public or cross-module surface area?
- Does it make product policy explicit in names, tests, or docs?
- Does it preserve emulator timing and debug behavior?
- Can it be verified with focused tests rather than manual inspection only?

Avoid cleanup that:

- Refactors opcode tables purely for aesthetics.
- Creates abstractions before two or three real call sites need them.
- Mixes product behavior changes with structural cleanup.
- Changes marketplace/user-facing text without checking the manual/docs story.

## Suggested First Goal

Phases 1–4 are complete. Phase A direct safety coverage has started:

> Direct unit tests now cover `launch-sequence.ts` and `io-handlers.ts`, and the
> matrix keyboard invariants are documented without changing production matrix
> code.

The matrix-only characterization pass and first two helper extractions are now
started: modifier/capture contracts, restored-open attachment, pure
modifier/key-normalization helpers, and held-key transition helpers are covered.
The next matrix step should be smaller again: extract click-release timer
decision bookkeeping only if it can be isolated behind direct tests without
moving DOM or postMessage behavior. If matrix behavior needs a cooling-off
period, the Phase 1 dead-export cleanup has now been refreshed and the current
dead-code gate is clean. Phase 5 has now started with target discovery split
out and launch config merge staging extracted; continue with target
selection/persistence cleanup as a separate, behavior-preserving step.

### Latest Goal Note: Target Selection Policy Boundary

`src/extension/project-target-policy.ts` now owns the pure target selection
decision: remembered target, configured default target, sole-target fallback,
forced prompt behavior, and the workspace memento key format. The VS Code
controller still owns filesystem discovery, target mutation, and QuickPick UI,
but it no longer duplicates the precedence rules in each caller.

This gives future project workflow cleanup a smaller safety surface. If target
selection changes again, add characterization in
`tests/extension/project-target-policy.test.ts` first, then rewire the UI
controller. Remaining complexity in `project-target-selection.ts` is mostly
discovery and QuickPick row construction; that should be split only after adding
similarly direct tests for source-file discovery and entry-source binding.

### Latest Goal Note: Target Source And QuickPick Policy Split

`src/extension/project-target-source-policy.ts` now owns source-path
normalization, covered-source detection, discovered target naming, and grouping
configured targets by entry source path. `src/extension/project-target-quickpick-policy.ts`
now owns the pure row shaping for target choices and AZM source rows. The VS
Code-facing controller still reads files, calls QuickPick, updates project
configuration, and persists the selected target, but the source-discovery and
row-construction policy is now covered directly.

This removed the changed-file complexity finding for
`ProjectTargetSelectionController.resolveTarget`; Fallow now reports only the
older `loadTargetChoices` mapping complexity in this module. A future cleanup
pass can split target config parsing and display summary construction out of
`loadTargetChoices`, but it should be tested separately because it affects
target visibility and platform/source descriptions.

### Latest Goal Note: Target Config Display Policy Split

`src/extension/project-target-config-policy.ts` now owns the conversion from
raw `debug80.json` target entries to visible target choices. It filters malformed
targets, asks the caller whether each target program still exists, preserves the
`target`/`defaultTarget` fallback, and builds the source/platform description
strings used in the project UI and target QuickPick.

`project-target-selection.ts` is now mostly orchestration: read config, resolve
project root, call pure policy helpers, show QuickPick, update config, and
remember selection. The remaining cleanup opportunities in this area are smaller
and should be weighed against churn: `projectRootFromProjectConfigPath`,
`targetProgramFileExists`, and source-file caching are still local because they
are filesystem/VS Code-adjacent rather than product policy.

### Latest Goal Note: Target Filesystem And Path Utilities Split

`src/extension/project-target-filesystem.ts` now owns project-root resolution,
target program source existence checks, and the short-lived source-file
discovery cache used by target selection. `project-target-selection.ts` keeps
the VS Code/project orchestration and delegates filesystem/path behavior to the
new helper.

The helper has focused coverage for root and `.vscode/debug80.json` project
config paths, relative and absolute source-file existence checks, filesystem
error handling, and TTL-based source discovery caching.

### Latest Goal Note: Target Selection Cleanup Boundary

After the policy, QuickPick row, config-display, and filesystem/path splits,
`src/extension/project-target-selection.ts` no longer has an obvious next
low-risk extraction. Its remaining responsibilities are intentionally
VS Code-facing: read the current project config, resolve remembered/default
target choices through the pure policy helpers, build the QuickPick, persist the
selection, and apply an entry-source binding when the user chooses a discovered
source file.

Further splitting inside this file would mostly move orchestration into another
orchestration module. Leave this area stable unless a future product change adds
new behavior. If that happens, add focused tests around the new behavior first
and extract only the new policy boundary, not the VS Code interaction glue.

### Latest Goal Note: Remaining Webview-Entrypoint Survey

After the memory-view and project-panel handle splits, `webview/common` is in a
better shape: repeated DOM lookup and message-shape assumptions now live behind
small helper modules. Fallow still flags the platform entrypoints as broad
orchestrators, especially `webview/tec1g/index.ts` and `webview/tec1/index.ts`,
but those files sit close to matrix keyboard lifecycle, platform attachment, and
runtime update routing.

The next webview cleanup should therefore stay away from TEC-1G matrix behavior
unless it has a narrow characterization test first. Safer candidates are:

- shared platform-message routing helpers for non-keyboard messages;
- explicit element-handle modules for Simple/TEC-1-only panels;
- additional tests around panel bootstrap order before moving any logic.

Do not start with `webview/tec1g/matrix-ui.ts` or the matrix parts of
`webview/tec1g/index.ts`. That code is intentionally treated as a hot zone after
the keyboard regressions.

### Latest Goal Note: Simple Serial Boundary Cleanup Status

`webview/common/serial-ui.ts` now supports the Simple terminal IDs through a
small options object, so Simple/TEC-1/TEC-1G serial panels share the same UI
wiring without copy-pasted clear/send/status handling. The Simple webview now
also routes memory snapshot messages through `memory-panel-messages.ts`, leaving
`webview/simple/index.ts` as a smaller bootstrap file: project status, memory
panel, serial terminal, and platform update dispatch.

The old split TEC-1/TEC-1G serial tests were consolidated into
`tests/webview/serial-ui.test.ts`, with Simple coverage added in the same place.
That file is now the contract for serial UI message behavior across platforms.

This closes the most obvious low-risk webview boundary cleanup that did not
touch matrix keyboard production behavior. Remaining webview work should be more
selective: the TEC-1G entrypoint and renderers still score high, but they have a
higher regression cost than the Simple serial boundary had.

### Latest Goal Note: Post-Serial Fallow Target Survey

The post-serial survey found no actionable dead-code signal. Duplication is now
mostly in older launch/config validation, mapping, Z80 decode, and test-helper
areas rather than the Simple serial boundary. Broad Fallow health still points
at several high-complexity files, but the risk profile matters more than the raw
score:

- `webview/tec1g/glcd-renderer.ts` and `webview/tec1g/lcd-renderer.ts` are
  rendering-heavy and visually sensitive. They are not good next refactor
  targets unless the goal is specifically rendering verification.
- `webview/tec1g/matrix-ui.ts`, `src/debug/requests/matrix-request.ts`, and the
  matrix portions of `webview/tec1g/index.ts` remain deliberately out of scope
  for general cleanup.
- `src/platforms/tec1g/io-handlers.ts`, `src/platforms/tec1g/sd-spi.ts`, and
  RTC/GLCD platform internals are hardware-behavior hot zones. Prefer direct
  behavioral tests before further extraction.
- `src/extension/debug-session-events.ts` is the best next small target. It has
  critical Fallow complexity, but its risk is bounded by existing focused tests
  for session status, platform events, terminal routing, ROM/main source opening
  order, stop-on-entry focus, and assembly failure diagnostics.

Recommended next goal: decompose `src/extension/debug-session-events.ts` into
named event handlers and small pure-ish helpers for diagnostic path/range
construction, platform/session-status dispatch, terminal-output routing, and
main/ROM source-opening decisions. Keep the public `registerDebugSessionHandlers`
entrypoint intact, add any missing characterization tests first, and avoid
touching matrix keyboard production behavior.

### Latest Goal Note: Debug Session Event Decomposition

`src/extension/debug-session-events.ts` no longer routes every custom event
through one large inline callback. The public registration function now wires
VS Code events to named handlers for session start, termination, platform
selection, session status, terminal output, assembly failure, main-source
opening, and TEC-1/TEC-1G update/serial events. The custom-event dispatcher is
table-driven, so adding a future event should be a single explicit entry instead
of another branch inside the registration callback.

The assembly diagnostic path/range construction is now exposed as
`buildLaunchAssemblyDiagnostic`, with focused coverage for workspace-relative
paths. The existing session event tests still cover the user-visible behavior
that has regressed before: session status forwarding, ROM/main source opening
order, stop-on-entry focus preservation, and build-failure diagnostics. The test
file now uses a shared local registration fixture instead of repeating the full
mock dependency block in every case.

Changed-file Fallow is clean after this split. Full verification also passed:
`npm run typecheck`, `npm run lint`, `npm test`, and `npm run package:check
--if-present`.

Next safe cleanup candidate: inspect `src/debug/launch/config-validation.ts` and
`src/debug/launch/azm-backend.ts` duplication reports. Both are outside the
matrix keyboard path, but they affect build/launch behavior, so start with
characterization tests for option/error formatting before extracting helpers.

### Latest Goal Note: Launch Config Validation Helper Extraction

`src/debug/launch/config-validation.ts` now shares the repeated optional
integer and optional object validation scaffolding across port, address,
instruction-limit, terminal, Simple, TEC-1, and TEC-1G validators. The exported
validator API and error strings stay unchanged; the new helpers only remove the
duplicated type/null/integer/object checks.

`tests/debug/config-validation.test.ts` now includes a characterization test for
nested launch-argument error collection. It locks down field names and ordering
for terminal, Simple, TEC-1, and TEC-1G validation errors before the helper
extraction.

Changed-file Fallow is clean after this split. Full verification passed with
`npm run typecheck`, `npm run lint`, `npm exec --yes fallow -- audit
--changed-since HEAD --format compact`, and `npm run package:check
--if-present`.

Next safe cleanup candidate: `src/debug/launch/azm-backend.ts` still has small
duplication around artifact writing and assemble/assembleBin result handling.
Treat it as build-critical: add characterization tests around emitted artifacts
and failure diagnostics before extracting anything.

### Latest Goal Note: AZM Backend Artifact Helper Extraction

`src/debug/launch/azm-backend.ts` now centralizes the repeated AZM module-load,
compile-result conversion, required-artifact lookup, and optional text-artifact
writing logic used by HEX and BIN assembly paths. The refactor keeps the same
AZM compile options, output artifact paths, and failure message prefixes
(`azm failed:` and `azm bin failed:`), but removes the duplicated inline
load/catch/diagnostic/result handling from the two public methods.

`tests/debug/azm-backend.test.ts` now characterizes both register-contract
side artifacts from AZM: `.regcontracts.txt` and `.asmi`. That locks down the
artifact-writing behavior before future register-contract integration work.

Changed-file Fallow no longer reports production duplication in
`azm-backend.ts`. Remaining changed-file warnings are inherited test setup
clones and the existing `compactBinaryFromEmittedMap` complexity warning, which
is a better future target only if binary-range behavior is characterized first.

Verification for this goal covered the focused AZM backend tests, TypeScript,
lint, changed-file Fallow, and the full `package:check` gate.

Next safe cleanup candidate: audit the inherited duplication in
`tests/debug/azm-backend.test.ts` and extract only local fixture helpers that
make artifact setup clearer. Keep this test-only; avoid further build-path
production changes until a new behavior goal requires them.

### Latest Goal Note: AZM Backend Test Fixture Cleanup

`tests/debug/azm-backend.test.ts` now uses local fixture helpers for common
source/output path setup, successful HEX/D8 artifact setup, diagnostic compile
results, and output capture. This is intentionally a test-only cleanup after
the AZM backend production refactor: the production assembler backend was not
changed in this goal.

The tests still assert the same behavior: Debug80-controlled artifact writing,
native D8 map requirements, register-contract report/interface artifacts,
binary rebuild bounds, source-root diagnostic resolution, source-less
diagnostics, and required-artifact failures.

Changed-file Fallow is clean for the test file. The only remaining warning is
an inherited cross-file setup similarity between this test and
`tests/debug/stack-service.test.ts`, which is not worth abstracting without a
broader debug-test fixture pass.

Verification for this goal covered `npx vitest run
tests/debug/azm-backend.test.ts`, `npm run typecheck`, `npm run lint`,
changed-file Fallow, and `npm run package:check --if-present`.

Next safe cleanup candidate: run a fresh changed-code survey and choose a
non-hot-zone target with focused tests. Avoid matrix keyboard production code
unless the goal is specifically matrix behavior with characterization coverage.

### Latest Goal Note: Fresh Post-AZM Cleanup Survey

Current-state survey after the AZM backend cleanups:

- `fallow audit` is clean for the current worktree because there are no changed
  files.
- Repo-wide `fallow health` reports overall health `73.4:B`, with no dead
  files, no dead exports, no circular dependencies, and no unused dependencies.
- Repo-wide `fallow dupes` still reports broad duplication, but much of the top
  noise is deliberate or high-risk: Z80 decoder tables, TEC-1G hardware paths,
  renderer code, and matrix keyboard paths.
- `fallow health --targets` now ranks
  `src/debug/launch/launch-source-state.ts` as the best low-risk target:
  priority `25.2`, high confidence, medium effort, focused on extracting
  `readSourceMapSymbols` (cognitive complexity `38`) in a 279-line file.

Rejected next targets for this pass:

- `webview/tec1g/glcd-renderer.ts`, `webview/tec1g/lcd-renderer.ts`,
  `webview/tec1g/index.ts`, and `webview/tec1g/matrix-ui.ts` remain UI/hot-zone
  files. They need visual or matrix-specific goals, not general cleanup.
- `src/platforms/tec1g/io-handlers.ts`, `src/platforms/tec1g/sd-spi.ts`,
  `src/platforms/tec1g/glcd.ts`, and RTC-related files are hardware-behavior
  hot zones. Prefer direct protocol/behavior goals before refactoring.
- `src/z80/decode-*` duplication is table-shaped CPU decode logic. It should be
  left alone unless the goal is specifically decoder-generation or opcode-table
  consolidation.
- `src/extension/project-config.ts` has high fan-in and meaningful complexity,
  but changing it is broader than the next small cleanup step.

Recommended next implementation goal:

> Refactor `src/debug/launch/launch-source-state.ts` by extracting
> `readSourceMapSymbols` into smaller pure helpers for map-path collection, map
> parsing/logging, file-symbol conversion, and final sorting. Preserve
> `buildLaunchSourceState` behavior and add/retain focused coverage in
> `tests/debug/launch-source-state.test.ts` for build-artifact symbols,
> auxiliary ROM map symbols, malformed map warnings, source-root path
> resolution, and fallback symbol-index behavior.

Why this is the best next step:

- It is outside the matrix keyboard and TEC-1G hardware hot zones.
- It builds directly on recent D8/source-map work.
- The existing test file already covers project-relative D8 keys, bundled ROM
  keys, build artifact symbols, and local ROM map symbols.
- The extraction can be done with behavior-preserving helpers and a narrow
  changed-file Fallow gate.

## Priority Summary (2026-06-10)

| Priority | Issue | Primary files |
| -------- | ----- | ------------- |
| Critical | Matrix keyboard multi-authority state | `matrix-ui.ts`, `matrix-request.ts`, `accordion-layout.ts`, `launch-sequence.ts` |
| Critical | Cast-heavy webview DOM/message boundaries | `webview/tec1g/index.ts`, `webview/common/project-status-ui.ts`, `matrix-ui.ts` |
| High | Launch orchestration breadth | `src/debug/launch/launch-sequence.ts` |
| High | IO dispatcher breadth | `src/platforms/tec1g/io-handlers.ts` |
| Medium | Large orchestration files | `adapter-request-controller.ts`, `launch-args.ts`, `runtime-control.ts` |
| Medium | Launch policy spread | `launch-args.ts`, `config-validation.ts`, `target-commands.ts` |
| Medium | Bloated test files | `commands.test.ts`, `tec1g-matrix-ui.test.ts` |
| Medium | Coverage exclusions mask core | `vitest.config.ts` |
| Low | Dead exports, CSS monolith, magic numbers | per Fallow list, `styles.css`, `matrix-ui.ts` |
