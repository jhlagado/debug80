---
title: Debug80 Platform Development Guide
---

# Debug80 Platform Development Guide

This guide documents how to add a new platform runtime and UI panel to Debug80.
It complements the existing platform docs in `docs/PLATFORMS.md` and the runtime
reference comments in `src/platforms/**`.

## Quick Checklist
- [ ] Define runtime state and IO handlers
- [ ] Wire platform into the adapter runtime map
- [ ] Add a platform UI panel (optional but recommended)
- [ ] Document the memory map and IO ports
- [ ] Add unit tests and a smoke test

## Core Concepts

### Platform runtime
Each platform provides a runtime implementation that connects the Z80 core to:
- Memory mapping (ROM/RAM/expansion)
- IO ports (keypad, display, serial, peripherals)
- Timing model (cycle clock usage)

Runtime files live under `src/platforms/<name>/runtime.ts`.

### Platform UI
If a platform has a custom UI panel:
- UI controller lives in `src/platforms/<name>/ui-panel.ts`
- HTML template lives in `src/platforms/<name>/ui-panel-html.ts`
- State helpers live in `src/platforms/<name>/ui-panel-*.ts`

### Configuration
Platform defaults are loaded from `debug80.json` project config. Add any new
fields to:
- `src/debug/config-validation.ts`
- `src/debug/types.ts`
- `docs/PLATFORMS.md` (runtime contract)

## Runtime Contract (Required)

Implement at minimum:
- **Memory**: ROM/RAM map and any mirroring/overlay
- **IO**: `in`/`out` port behavior for keypad, display, and serial
- **Speed modes** (if applicable): required for monitoring or timing-sensitive ROMs

Reference implementations:
- `src/platforms/tec1/runtime.ts` (simple keypad + 7-seg)
- `src/platforms/tec1g/runtime.ts` (GLCD + LCD + matrix + serial)
- `src/platforms/simple/runtime.ts` (minimal runtime)

## IO Port Documentation

Document every port and bit field in:
- `docs/PLATFORMS.md`
- `src/platforms/<name>/README.md`

Include:
- Port address
- Direction (IN/OUT)
- Bit meanings
- Default/reset values
- Known ROM expectations (e.g. busy flag polling)

## UI Panel Guidelines

### Required behaviors
- Keep updates incremental and lightweight
- Avoid synchronous blocking in the panel script
- Use the shared refresh controller for memory views

### Recommended modules
- `ui-panel-html.ts`: HTML + DOM logic
- `ui-panel-state.ts`: mutable UI state
- `ui-panel-refresh.ts`: snapshot refresh logic
- `ui-panel-messages.ts`: webview message handlers

## Testing Expectations

Add tests under `tests/platforms/<name>`:
- Runtime IO behavior
- Memory mapping
- UI helper utilities (if extracted)

Use existing tests as a reference:
- `tests/platforms/tec-common.test.ts`
- `tests/platforms/tec1g/sysctrl.test.ts`
- `tests/platforms/ui-panel-helpers.test.ts`

## Example Platform Skeleton

```
src/
  platforms/
    myplatform/
      runtime.ts
      ui-panel.ts
      ui-panel-html.ts
      ui-panel-state.ts
      README.md
tests/
  platforms/
    myplatform/
      runtime.test.ts
```

## Verification

Run the standard checks:
```
yarn lint
yarn build
yarn test
```

If adding performance-sensitive logic, see `PERFORMANCE_TESTING.md`.
