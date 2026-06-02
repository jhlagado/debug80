# Debug80 Code Quality Audit

This document records the current code-health state of Debug80 and proposes a
staged cleanup programme. It is intentionally engineering-facing; user-facing
manual content belongs at [debug80.com](https://debug80.com/).

Audit date: 2026-06-02

## Summary

Debug80 is in a healthy state for a fast-moving pre-release extension: there are
no circular dependencies, no unused package dependencies reported by Fallow, and
the major systems now have meaningful test coverage. The main maintainability
risks are not architectural collapse; they are accumulated branch complexity,
large composition files, dead exported surface area, and remaining historical
source-map/cache vocabulary that can obscure the current AZM-only model.

The highest-value cleanup is to make the code easier to reason about without
changing behavior:

1. Remove dead exports and stale artifacts that no longer serve public behavior.
2. Finish retiring listing/cache concepts from runtime code and committed assets.
3. Split complex dispatchers and validators into table-driven or smaller helper
   modules.
4. Factor duplicated runtime/debug/webview patterns into explicit shared
   utilities.
5. Add a small number of regression tests around the areas that have repeatedly
   regressed: source-map resolution, project selection persistence, launch
   diagnostics, matrix keyboard focus, and display duty-cycle rendering.

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

Largest authored source files:

| File | Lines | Notes |
| --- | ---: | --- |
| `webview/common/styles.css` | 1019 | Shared UI styling; high visual coupling across platform panels. |
| `src/z80/decode-primary.ts` | 913 | Decoder table/logic; large but domain-driven. |
| `src/debug/requests/adapter-request-controller.ts` | 669 | DAP request orchestration; many responsibilities. |
| `src/debug/launch-args.ts` | 653 | Config discovery and merge behavior; cross-cutting and hard to scan. |
| `webview/common/memory-panel.ts` | 641 | Memory/register panel UI logic; substantial DOM state handling. |
| `src/platforms/tec1/runtime.ts` | 585 | TEC-1 runtime; includes some dead exports. |
| `src/debug/session/runtime-control.ts` | 583 | Run/step/step-out loops; duplicated control flow. |
| `src/z80/decode-helpers.ts` | 548 | Instruction helpers; domain complexity. |
| `src/extension/platform-view-provider.ts` | 543 | Webview provider state and messaging; high fan-out/fan-in. |
| `src/debug/launch/config-validation.ts` | 521 | Repetitive validators; good candidate for helper extraction. |

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
- Keep the fallback policy note in `docs/technical.md` aligned with runtime
  behavior.

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
CoolTerm behavior. The code now has good low-level tests, but `io-handlers.ts`
still centralizes many unrelated port behaviors.

Recommended approach:

- Keep the port handler as a dispatch surface, but move device-specific read and
  write behavior into device adapters.
- Give each peripheral a small contract test suite: port writes, reads, reset
  state, UI payload emission, and timing/duty-cycle behavior where applicable.
- For future Storage/RTC/Joystick UI accordions, add runtime state queries before
  building UI so panels can be tested independently from DOM rendering.

### P3: Tests Are Strong But Heavy And Duplicated

The test suite is broad, which is a strength. The downside is duplicated fixture
setup in integration-style tests:

- `tests/extension/commands.test.ts`
- `tests/extension/platform-view-provider.test.ts`
- `tests/debug/adapter-integration.test.ts`
- `tests/debug/runtime-control.test.ts`
- Webview panel tests

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
npm run test -- tests/debug/path-resolver.test.ts tests/debug/mapping-service.test.ts
npm exec --yes fallow -- --only dead-code --format compact
```

### Phase 2: Document And Enforce Source-Map Fallback Policy

Goal: make native AZM D8 behavior explicit and prevent old listing fallback from
returning.

Completed guardrails:

- Added a short source-map policy section to `docs/technical.md`.
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

## Quality Criteria For Future PRs

### Latest Goal Note: TEC-1G SYS_CTRL Bit Contract

The TEC-1G `SYS_CTRL` decoder now follows MON-3 for caps lock: bit `0x80`
is CAPSLOCK. Bits `0x08`, `0x10`, `0x20`, and `0x40` are treated as the
four Memory Expansion bank lamps in the webview, with bit `0x08` still serving
as the current two-bank `E_A14` selector for the 0x8000-0xBFFF window.

This removes a stale emulator assumption where bit `0x20` was shown as CAPS.
Future expansion-deck work should keep MON-3 source as the source of truth for
port contracts and avoid assigning user-visible meanings to SYS_CTRL bits
without a regression test in both the decoder and webview status layer.

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

Start with Phase 1 and Phase 2 together because they are related and low-risk:

> Keep `.debug80/cache` artifacts out of the repository, remove confirmed dead
> exports, document the source-map fallback policy, and add regression tests that
> ensure Debug80 only uses native AZM source maps from build/bundled outputs.

That goal should produce a small PR with clear verification and minimal product
behavior change.
