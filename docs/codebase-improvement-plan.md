# Debug80 Codebase Improvement Plan

Date: 2026-02-03
Last Updated: 2026-02-03

## Current State Assessment

Debug80 is a functional Z80 debug adapter for VS Code with TEC-1/TEC-1G platform emulation. The core Z80 emulation and source mapping systems are solid. The TypeScript config is strict, dependencies are minimal, and the documentation is above average. However, the codebase shows clear signs of organic growth without periodic refactoring. Several files have become load-bearing monoliths, the UI layer is architecturally problematic, test coverage has critical gaps, and platform-specific logic is tangled into the adapter core.

This is an honest assessment — the project works, but scaling it (new platforms, new features, new contributors) will be painful without structural changes.

### Current Line Counts (Critical Files)

| File | Lines | Status |
|------|-------|--------|
| `src/debug/adapter.ts` | 1,296 | God file - needs splitting |
| `src/extension/extension.ts` | 1,075 | Does too much |
| `src/z80/decode.ts` | 1,616 | Monolithic decoder |
| `src/platforms/tec1g/runtime.ts` | 1,287 | Complex, has bugs |
| `src/platforms/tec1g/ui-panel-html-script.ts` | 1,461 | JS-in-strings |
| `src/platforms/tec1/runtime.ts` | 514 | Simpler, OK for now |
| `src/platforms/tec1/ui-panel-html-script.ts` | 767 | JS-in-strings |

---

## Immediate Bug Fix Required

### BUG: Duplicate State Reset in TEC-1G Runtime

**Location:** `src/platforms/tec1g/runtime.ts` lines 1251–1257

**Problem:** The `resetState()` function has duplicate assignments that also incorrectly overwrite the configured `gimpSignal` value:

```typescript
// Lines 1251-1253: Correct initial assignments
state.shiftKeyActive = false;
state.rawKeyActive = false;
state.gimpSignal = defaultGimpSignal;  // Uses config value ✓

// Lines 1255-1257: Duplicate assignments that OVERWRITE correct values
state.shiftKeyActive = false;          // Duplicate
state.rawKeyActive = false;            // Duplicate
state.gimpSignal = false;              // BUG: Overwrites defaultGimpSignal!
```

**Impact:** The `gimpSignal` configuration option (set in `debug80.json`) is ignored on reset. If a user configures `gimpSignal: true`, it will be reset to `false` every time the emulator resets.

**Fix:** Delete lines 1255–1257. The correct assignments are already on lines 1251–1253.

**Status:** Done on branch `refactor/codebase-improvement-phase0` (commit 867f565).

---

## Critical Issues

### 1. `adapter.ts` is a God File (1296 LOC)

**Problem:** `src/debug/adapter.ts` handles DAP protocol lifecycle, breakpoint management, 15+ platform-specific custom request handlers, session state, source mapping, and I/O coordination. Adding a platform means editing this file in 5+ places.

**Evidence:** Lines 719–855 contain a chain of `if (command === 'debug80/tec1Key')` ... `if (command === 'debug80/tec1gKey')` ... repeated for every platform variant of every command. The pattern scales linearly with platforms.

**Fix:**
- Extract a `CommandRouter` that maps command strings to handler functions, registered per-platform at runtime creation.
- Extract DAP protocol boilerplate (threads, scopes, variables) into a thin adapter shell.
- Platform runtimes should register their own custom request handlers rather than the adapter knowing about every platform.

**Target:** adapter.ts under 500 LOC. Each platform owns its command handlers.

---

### 2. Embedded HTML/CSS/JavaScript in TypeScript (~3,300 LOC)

**Problem:** The webview UI for TEC-1 and TEC-1G is built as template literal strings inside TypeScript files. `tec1g/ui-panel-html-script.ts` alone is 1,461 lines of JavaScript-inside-a-string. This code has no type checking, no IDE support, no testability, and no linting.

**Files affected:**
- `src/platforms/tec1g/ui-panel-html-script.ts` (1461 LOC)
- `src/platforms/tec1g/ui-panel-html-style.ts` (638 LOC)
- `src/platforms/tec1/ui-panel-html-script.ts` (767 LOC)
- `src/platforms/tec1/ui-panel-html-style.ts` (398 LOC)

**Fix:**
- Move webview code to actual `.html`, `.css`, and `.ts` files under a `webview/` directory per platform.
- Use a bundler (esbuild) to compile webview TypeScript separately, with its own tsconfig targeting the browser.
- Load compiled bundles as webview resources using VS Code's `asWebviewUri()` API.
- This makes the UI code type-checked, lintable, testable, and IDE-supported.

**Target:** Zero lines of JavaScript-in-strings. Webview code is real TypeScript with real tooling.

---

### 3. `decode.ts` is a Monolithic Function (1,616 LOC)

**Problem:** `src/z80/decode.ts` contains a single deeply-nested function handling every Z80 opcode across all prefix groups (unprefixed, CB, DD, ED, FD, DDCB, FDCB). It's difficult to navigate, impossible to unit-test per-instruction, and hard to optimize.

**Fix:**
- Split into per-prefix-group modules: `decode-primary.ts`, `decode-cb.ts`, `decode-dd.ts`, `decode-ed.ts`, `decode-fd.ts`, `decode-ddcb.ts`.
- Each module exports a handler function dispatched from a thin top-level decode entry point.
- Individual instruction handlers become independently testable.

**Target:** No single decode file over 400 LOC. Each prefix group testable in isolation.

---

### 4. Core Code Has No Automated Tests

**Problem:** The most critical files have zero test coverage and are explicitly excluded in `vitest.config.ts` (lines 20–43):
- `adapter.ts` — the entire DAP session handler
- All `platforms/**/runtime.ts` — every platform's I/O emulation
- `z80/decode.ts` — the instruction decoder
- `z80/runtime.ts` — the execution loop
- `extension.ts` — the VS Code entry point

The 80% coverage threshold is meaningless when the hardest, most bug-prone code is excluded from measurement.

**Fix:**
- After extracting the adapter (issue #1), write integration tests for the command router and DAP lifecycle using mock transports.
- After splitting decode (issue #3), write per-prefix instruction tests.
- Add I/O handler tests for each platform runtime using injected memory/port stubs.
- Remove exclusions from vitest.config.ts as coverage becomes possible.

**Target:** Coverage exclusion list reduced to genuinely untestable VS Code API code only. Real coverage above 70% including adapter and runtimes.

---

## High Priority Issues

### 5. TEC-1 / TEC-1G UI Code Duplication (60–70% overlap)

**Problem:** The TEC-1 and TEC-1G platforms each have ~9 UI panel files with 60–70% identical code. Bug fixes and feature additions must be applied twice. Divergence is inevitable.

**Fix:**
- Extract shared UI infrastructure into `src/platforms/tec-common/ui/`:
  - Base panel markup generator
  - Shared styles (seven-segment display, keypad, speaker, tabs)
  - Common message handling (postMessage protocol)
  - Shared state management
- Platform-specific panels extend/compose the base with their additions (GLCD, matrix keyboard, status LEDs, etc.)

**Target:** Shared UI code in one place. Platform panels contain only platform-specific additions.

---

### 6. Tight Platform Coupling in Adapter

**Problem:** `adapter.ts` contains hardcoded platform name checks (`platform === 'tec1'`, `platform === 'tec1g'`) scattered across configuration loading, runtime creation, and custom request handling. The adapter knows too much about each platform.

**Fix:**
- Define a `PlatformProvider` interface:
  ```typescript
  interface PlatformProvider {
    name: string;
    createRuntime(config: PlatformConfig): PlatformRuntime;
    getCustomRequestHandlers(): Map<string, RequestHandler>;
    normalizeConfig(raw: unknown): PlatformConfig;
  }
  ```
- Register providers in a platform registry. The adapter queries the registry instead of branching on platform names.

**Target:** Adding a new platform means implementing `PlatformProvider` and registering it. Zero changes to adapter.ts.

---

### 7. Magic Numbers Throughout Platform Runtimes

**Problem:** `src/platforms/tec1g/runtime.ts` is full of raw hex values for port numbers, memory addresses, bit masks, and device registers with no named constants. Examples from lines 145–748:
- Port `0x00`, `0x04`, `0x84`, `0xfe`, `0x0c`, `0x8c` used directly in I/O handlers
- Memory regions `0x0000–0x07ff`, `0x0800–0x7fff`, `0xc000–0xffff` hardcoded
- Bit masks `0xff`, `0x3f`, `0x7f`, `0x1f`, `0x07`, `0x08` unnamed

**Fix:**
- Create `src/platforms/tec1g/constants.ts` with named constants for all port addresses, memory regions, bit masks, and device registers.
- Do the same for TEC-1 (`src/platforms/tec1/constants.ts`).
- Replace all magic numbers in runtime code with named constants.

**Target:** Zero raw hex literals in I/O handler logic. Every hardware value has a named constant with a comment referencing the schematic.

**Status:** Complete (Phase 1). Added `src/platforms/tec1g/constants.ts` and `src/platforms/tec1/constants.ts` with port/memory/mask/LCD/GLCD constants, replaced all raw hex literals in both runtimes, and normalized key masking to `*_MASK_LOW7`.

---

### 8. Incomplete Module Extraction

**Problem:** Six modules are excluded from test coverage with the comment "Extracted adapter modules (not yet integrated/tested)": `assembler.ts`, `breakpoint-manager.ts`, `config-loader.ts`, `memory-utils.ts`, `path-resolver.ts`, `symbol-manager.ts`. This suggests a stalled refactoring effort where code was extracted from the adapter but never fully wired up or tested.

**Fix:**
- Audit each extracted module: is it actually used? Is the adapter still doing the same work internally?
- Wire up any unused extractions or delete dead code.
- Write tests for each module and remove from the coverage exclusion list.

**Target:** No "extracted but not integrated" modules. Everything is either used-and-tested or deleted.

**Status:** Complete (Phase 1). Removed unused `config-loader`, `memory-utils`, and `symbol-manager` modules (and their exports). Added tests for `assembler` and `path-resolver`, kept `breakpoint-manager` under coverage, and removed the coverage exclusions for these modules.

---

## Medium Priority Issues

### 9. `extension.ts` Does Too Much (1,075 LOC)

**Problem:** The extension entry point handles activation, command registration, webview lifecycle, project scaffolding, debug configuration provision, and session state management.

**Fix:**
- Extract command registration into `src/extension/commands.ts`.
- Extract debug configuration provider into `src/extension/debug-config-provider.ts`.
- Extract project scaffolding into `src/extension/scaffolding.ts`.
- `extension.ts` becomes a thin activation function wiring components together.

**Target:** extension.ts under 200 LOC.

---

### 10. Inconsistent Error Handling and Logging

**Problem:** Different modules use different error reporting: `service.log()` callbacks, `vscode.window.showErrorMessage()`, commented-out `console.log()` statements, and silent `.then()` chains. No centralized logging strategy.

**Fix:**
- Define a `Logger` interface with levels (debug, info, warn, error).
- Implement it for VS Code output channel and for test environments.
- Replace all logging patterns with the centralized logger.
- Audit and fix silent async failures, especially in `platform-view-provider.ts`.

---

### 11. Serial/UART Module Size (5,616 LOC)

**Problem:** `src/platforms/serial/` contains 5,616 lines of bitbang UART emulation code. While the complexity may be inherent to the domain, the module deserves review for potential simplification.

**Fix:**
- Review whether all UART modes and edge cases are actually needed.
- Consider whether timing-critical paths can be simplified with lookup tables.
- Ensure test coverage is adequate for the complexity.

---

## Low Priority Issues

### 12. Font Data as TypeScript (2,318 LOC)

`src/platforms/tec1g/st7920-font.ts` is a data file containing font bitmaps. Consider generating it from a canonical source or loading it as a binary asset to reduce source churn.

### 13. No Pre-Commit Hooks

No husky/lint-staged or similar. Easy to commit code that fails lint or tests.

### 14. Missing Developer Documentation

- No guide for debugging the debugger itself
- No API documentation for the platform extension points
- No troubleshooting guide for common issues

---

## Recommended Execution Order

The issues above have dependencies. This is the recommended sequence:

| Phase | Issues | Rationale |
|-------|--------|-----------|
| **Phase 0: Bug Fix** | Duplicate state reset bug | Immediate fix, user-facing bug |
| **Phase 1: Foundation** | #7 (constants), #8 (stalled extractions) | Low-risk cleanup that makes later work easier |
| **Phase 2: Adapter** | #1 (split adapter), #6 (platform registry) | Unlocks testability and extensibility |
| **Phase 3: Decoder** | #3 (split decode) | Independent of adapter work, enables instruction-level tests |
| **Phase 4: UI** | #2 (webview extraction), #5 (dedup UI) | Highest effort, but blocked by nothing |
| **Phase 5: Tests** | #4 (test coverage) | Follows structural changes; test the new modules |
| **Phase 6: Polish** | #9, #10, #11, #12, #13, #14 | Quality-of-life improvements |

---

## What's Good (Don't Break These)

- Strict TypeScript config — keep it strict
- Minimal runtime dependencies — don't add frameworks
- Clean source mapping system (parser, layer2, d8-map) — well-designed, well-tested
- Custom error types with context — good pattern
- Comprehensive type definitions — 18+ interfaces in types.ts
- Good existing documentation (README, TECHNICAL, PLATFORMS, D8_DEBUG_MAP)
- Proper DAP protocol implementation — correct and complete

---

## Success Criteria

The refactoring is done when:

1. No source file exceeds 500 LOC (excluding generated data files)
2. Adding a new platform requires zero changes to adapter.ts or extension.ts
3. All webview code is real TypeScript with type checking and linting
4. Test coverage (including adapter and runtimes) exceeds 70%
5. Zero magic numbers in I/O handler logic
6. The coverage exclusion list contains only VS Code API boundary code

---

## Appendix A: External Platform Repositories

The project has companion repositories for platform-specific test programs and ROMs:

### debug80-tec1g (`/Users/johnhardy/Documents/projects/debug80-tec1g`)

```
debug80-tec1g/
├── roms/
│   ├── tec1/       # Classic TEC-1 ROM images for compatibility testing
│   └── tec1g/      # TEC-1G ROM images (MON-3 BC24-15, etc.)
├── tec1g-mon1/     # MON-1B compatibility setup (user program @ 0x0800)
│   ├── .vscode/
│   │   ├── debug80.json   # Platform configuration
│   │   └── launch.json    # VS Code debug targets
│   ├── .debug80/          # Generated debug artifacts
│   ├── build/             # Assembled output
│   └── src/               # Assembly source files
└── tec1g-mon3/     # MON-3 configuration (user program @ 0x4000)
```

### debug80-tec1 (`/Users/johnhardy/Documents/projects/debug80-tec1`)

```
debug80-tec1/
├── roms/
│   └── tec1/       # TEC-1 ROM images
├── tec1-mon1/      # MON-1 configuration (RAM starts @ 0x0800)
│   └── .vscode/debug80.json
└── tec1-mon2/      # MON-2 configuration (RAM starts @ 0x0900)
    └── .vscode/debug80.json
```

**Purpose:** These are development/testing workspaces, not part of the debug80 codebase. They demonstrate:
- How users structure debug80 projects
- Real ROM configurations for regression testing
- Example programs (serial, matrix, LCD tests)

**Relationship to debug80:** These repos consume debug80 as a VS Code extension. They are useful for:
- Manual testing during development
- Understanding user-facing configuration patterns
- Validating ROM compatibility

---

## Appendix B: Platform Architecture Complexity

The TEC-1 and TEC-1G platforms have very different complexity levels:

| Aspect | TEC-1 | TEC-1G | Notes |
|--------|-------|--------|-------|
| Runtime LOC | 514 | 1,287 | 2.5x larger |
| UI Script LOC | 767 | 1,461 | 1.9x larger |
| Display | 6-digit 7-seg | 6-digit 7-seg + 16x2 LCD + 128x64 GLCD | Much more complex |
| Keyboard | 20-key hex pad | Hex pad + 8x8 matrix | Matrix adds state machine |
| Peripherals | Speaker | Speaker + RTC (DS1302) + SD card (SPI) | Multiple device emulations |
| Memory | Fixed map | Shadow RAM, bank switching, protection | Complex memory model |

**Implication:** TEC-1G's runtime complexity is inherent to the hardware being emulated. The 1,287 LOC isn't necessarily bloated — it's emulating a lot of hardware. However:
- The state machine is fragile (see bug above)
- Magic numbers make it hard to verify correctness against schematic
- No unit tests for any I/O handler paths

**Recommendation:** Don't try to shrink tec1g/runtime.ts for the sake of LOC count. Instead:
1. Add constants for all hardware addresses
2. Add unit tests for each peripheral (LCD, GLCD, RTC, SD, matrix keyboard)
3. Fix the state reset bug
4. Consider splitting peripheral emulation into separate files (e.g., `glcd.ts`, `lcd.ts`, `matrix-keyboard.ts`) if the file continues to grow

---

## Appendix C: Test File Status

Recent test files added (per git status):
- `tests/platforms/tec1g/glcd.test.ts` (new, untracked)
- `tests/platforms/tec1g/memory-banking.test.ts` (new, untracked)
- `tests/platforms/tec1g/serial.test.ts` (new, untracked)
- `tests/platforms/tec1g/lcd.test.ts` (modified)
- `tests/platforms/tec1g/port03.test.ts` (modified)

**Positive sign:** Active test development for TEC-1G platform. Ensure these get committed and the coverage exclusions are updated to include the tested code paths.
