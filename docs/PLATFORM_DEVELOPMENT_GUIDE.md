# Debug80 Platform Development Guide

## Scope
This guide covers how to add or extend Debug80 platforms (runtime + UI) while
preserving TEC-1 compatibility and keeping the UI responsive.

## Key Concepts
- **Platform runtime**: Emulator-facing logic for IO, memory layout, and device
  behavior. See `src/platforms/`.
- **Platform UI**: Webview panel UI for a platform (if applicable). Keep DOM
  updates lightweight and avoid unnecessary reflows.
- **Config**: Platform wiring is typically driven via `debug80.json` targets.

## Adding a New Platform
1. **Create the runtime module**
   - Add a folder under `src/platforms/<platform-id>/`.
   - Provide a runtime entry that matches existing patterns (TEC-1/TEC-1G).
   - Keep platform state encapsulated and avoid new global flags.
2. **Define IO + memory assumptions**
   - Document ROM/RAM layout, IO ports, and any monitor ROM expectations.
   - For TEC-1 compatibility, verify ROM assumptions in docs and in config.
3. **Add optional UI panel**
   - Use lightweight DOM updates; avoid full re-render on every tick.
   - Keep UI state separate from emulator state where possible.
4. **Wire into config**
   - Add a target in `debug80.json` with `platform` and platform-specific config.
   - Provide `romHex` and region map as needed.
5. **Add tests**
   - Prefer unit tests for runtime behavior.
   - Add UI tests for state and HTML generation when panels are introduced.

## Naming and File Conventions
- **Files**: kebab-case (`ui-panel.ts`, `runtime-config.ts`)
- **Functions**: camelCase
- **Types/Interfaces**: PascalCase
- **Constants**: SCREAMING_SNAKE_CASE
- **Z80 core**: do not refactor naming in `src/z80/`

## Documentation Checklist
- Add `@fileoverview` to new platform modules.
- Update `docs/PLATFORMS.md` for new platform summaries.
- If ROM layout changes, confirm in `docs/platforms/<platform>/README.md`.

## Quick Validation
- `yarn lint`
- `yarn build`
- Run a minimal debug session with the new platform target.
