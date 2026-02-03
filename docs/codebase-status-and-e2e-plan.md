# Debug80 Codebase Status + E2E Test Plan (Supplement)

Date: 2026-02-03
Scope: Objective status of the codebase after phases 0-3, plus an end-to-end testing plan. Phase 4 (webview extraction/dedup) is intentionally excluded from this assessment because it is in-flight.

---

## 1) Objective codebase status (post Phase 0-3)

### 1.1 Architecture snapshot (what exists today)

- **Extension host** (`src/extension/extension.ts`)
  - Registers the z80 debug adapter (inline), commands, and platform webviews.
  - Owns terminal panel routing and platform panel routing.
  - Still a large, multi-role file (activation + UI orchestration + scaffolding).

- **Debug adapter** (`src/debug/adapter.ts` + support modules)
  - Handles DAP lifecycle, breakpoint resolution, runtime control, and platform custom requests.
  - Recent refactor added **CommandRouter** and **PlatformRegistry** to decouple platform custom request handling.
  - Still branches on platform for runtime instantiation and configuration wiring.

- **Z80 core** (`src/z80/*`)
  - Decoder has been split into per-prefix modules and helpers.
  - A **decoder cache** now avoids per-instruction allocation churn.
  - Tests are now granular (ALU/flags/flow/rotate/etc.), improving confidence.

- **Mapping pipeline** (`src/mapping/*`)
  - Parser -> layer2 matching -> source map index.
  - D8 debug map format is stable and well documented.

- **Platforms** (`src/platforms/*`)
  - TEC-1 and TEC-1G runtimes have explicit constants modules for I/O/memory.
  - TEC-1G runtime remains complex by necessity (LCD/GLCD/matrix/RTC/SD).
  - Webview UIs still live as JS/CSS/HTML strings (Phase 4 in progress).

### 1.2 Progress against the improvement plan

- **Phase 0 (bug fix)**: Done (TEC-1G reset gimpSignal issue).
- **Phase 1 (foundation)**: Done (constants extracted; dead modules removed; key modules tested).
- **Phase 2 (adapter)**: Structurally complete (command router + platform registry introduced).
- **Phase 3 (decoder)**: Done (split into modules, helpers centralized, caching added, tests expanded).
- **Phase 4 (UI extraction/dedup)**: In progress, explicitly excluded here.

### 1.3 Code quality and maintainability (objective signals)

**Positive signals**
- Strict TS config and minimal dependency footprint remain intact.
- Decoder refactor + tests increased correctness confidence in the most complex CPU logic.
- Platform constants and key masks reduced ambiguity against schematics.
- Debug adapter structure improved (custom requests no longer hard-coded chains).

**Remaining structural liabilities**
- `src/extension/extension.ts` still combines activation, UI routing, and scaffolding. This remains a single-point-of-failure file and a contributor bottleneck.
- Adapter still contains platform-specific wiring (normalization + runtime creation). It is better than before but not yet platform-agnostic.
- Platform runtime logic is still largely untested. Most coverage is Z80-core and mapping focused.
- Webview code in strings remains untyped and fragile (Phase 4 target).

### 1.4 Documentation quality (objective signals)

**Strong**
- `docs/technical.md`, `docs/platforms.md`, and `docs/d8-debug-map.md` remain high-quality and current.
- The codebase improvement plan is realistic and already partially executed.

**Gaps**
- No “debugging the debugger” guide (extension host launch, DAP attach tips, webview inspection).
- No test strategy overview (unit vs integration vs e2e, fixture expectations, when to run which).

### 1.5 Testing and coverage (objective state)

- Unit tests for Z80 helpers and decode modules exist and cover many ALU/flag cases.
- Coverage excludes large runtime/adapter/extension surface areas in `vitest.config.ts`.
- No automated e2e coverage for VS Code extension behaviors (launching, breakpoints, stepping, terminal I/O, panel interactions).

---

## 2) E2E testing plan for the Debug80 VS Code extension

### 2.1 Goals

- Verify the **full debug flow** in a real VS Code instance: activation, launch, breakpoints, stepping, registers, and stop conditions.
- Validate **adapter + runtime integration** using real artifacts (HEX/LST/D8M) without requiring asm80.
- Provide a **stable regression harness** for platform-specific behavior (Simple/TEC-1/TEC-1G) without coupling to hardware or external ROM repositories.

### 2.2 Non-goals (initially)

- Deep DOM validation of webview UIs (Phase 4 work may change DOM/API structure).
- Full fidelity performance benchmarks (keep runtime short for CI).
- Cross-platform matrix keyboard and serial edge-case tests in e2e (those belong in platform unit tests for now).

### 2.3 Testing layers (recommended structure)

**Layer A: Adapter integration tests (Node only)**
- Run the debug adapter in-process without VS Code UI.
- Use a DAP client (recommended: `@vscode/debugadapter-testsupport` or a minimal custom client) to drive initialize/launch/breakpoints/step.
- Fast, deterministic, and can run in parallel in CI.

**Layer B: Extension-host e2e tests (VS Code instance)**
- Use `@vscode/test-electron` to launch a real VS Code instance with the extension installed.
- Drive commands (`debug80.createProject`, `debug80.openTerminal`, etc.) and launch a debug session.
- Verify end-to-end wiring: activation -> debug adapter -> runtime -> DAP responses.

**Layer C: Platform-specific end-to-end checks (optional, later)**
- Simple platform is primary, TEC-1/TEC-1G are secondary.
- Focus on critical platform hooks: memory mapping and custom requests, not full UI.

### 2.4 Fixture strategy (critical for stability)

Create **self-contained fixtures** under `tests/e2e/fixtures/`:

```
tests/
  e2e/
    fixtures/
      simple/
        .vscode/
          debug80.json
          launch.json
        build/
          app.hex
          app.lst
          app.d8dbg.json
        src/
          app.asm
```

Key rules:
- Set `assemble: false` in the fixture config so tests do not depend on asm80.
- Check in prebuilt HEX/LST/D8M artifacts (small, deterministic).
- Keep the program tiny: a few instructions + a known loop + a known breakpoint address.

### 2.5 E2E test cases (minimum viable set)

**Adapter integration (Node)**
1. Initialize + launch
   - DAP initialize, then launch with fixture config.
   - Expect successful response and `initialized` / `stopped` events.
2. Breakpoint hit
   - Set breakpoint at a known line or address.
   - Continue and assert stop at correct PC.
3. Step and register read
   - Step in and check PC increments and register state.
4. Terminate
   - Disconnect cleanly (no dangling sessions).

**Extension-host (VS Code)**
1. Activation
   - Open fixture workspace and ensure extension activates on debug resolve.
2. Launch
   - Start debug session via launch config.
3. Breakpoint + step
   - Set breakpoint in source file and verify stop.
   - Step and inspect register values via DAP or VS Code debug API.
4. Terminal I/O (simple platform)
   - Send input via `debug80/terminalInput` and assert output event (or console log) for a known echo routine.

### 2.6 Tooling and dependencies

**Recommended additions**
- `@vscode/test-electron` (for extension-host e2e)
- `@vscode/debugadapter-testsupport` (for DAP integration tests)

If you want to keep dependencies minimal, the DAP client can be a small custom harness, but the test-support package will reduce time-to-first-test significantly.

### 2.7 Proposed scripts

- `yarn test:e2e:adapter` (Node, no VS Code)
- `yarn test:e2e:vscode` (VS Code extension-host)
- `yarn test:e2e` (runs both)

### 2.8 CI integration (GitHub Actions)

Add an e2e job or extend existing CI:

- Use `ubuntu-latest` + `xvfb-run` to run VS Code tests headlessly.
- Cache `~/.vscode-test` to speed up runs.
- Keep timeouts generous but bounded (avoid flake-induced retries).

Example approach:
- `yarn test:e2e:adapter` (fast, always)
- `xvfb-run -a yarn test:e2e:vscode` (slower, can be split by platform)

### 2.9 Reliability and flake control

- Use fixed workspace fixtures with no network or external tool dependencies.
- Avoid timing-based assertions; prefer event-driven waits for DAP events.
- Keep programs tiny and deterministic (no long loops).
- Capture and attach logs on failure (debug console, DAP traces).

### 2.10 Suggested phased rollout

**Phase E2E-0: Harness + fixture**
- Add fixture workspace with prebuilt artifacts.
- Add DAP test harness and a single “launch + terminate” test.

**Phase E2E-1: Adapter integration suite**
- Add breakpoint + stepping tests.
- Add register and memory read validation.

**Phase E2E-2: Extension-host smoke tests**
- Activate extension, launch, breakpoint hit, terminate.

**Phase E2E-3: Platform-specific tests**
- TEC-1: verify custom request handling (key input, reset) via DAP.
- TEC-1G: verify panel event emission and memory snapshot request.

---

## 3) Deliverables from this plan

- A new `tests/e2e/` suite with deterministic fixtures.
- A documented test strategy (what goes in unit vs integration vs e2e).
- CI coverage for real VS Code debug sessions.

---

## 4) Open decisions for follow-up

- Choose the DAP test harness dependency (official test support vs custom client).
- Decide whether to test webview UI DOM in e2e (likely defer until Phase 4 stabilizes).
- Decide if TEC-1G ROM dependencies should be included in fixtures or kept as optional follow-up.

