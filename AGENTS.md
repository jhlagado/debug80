# Debug80 Agent Guide

## Core Workflow
- Run `yarn lint` and `yarn build` after any code change. Report failures.
- Prefer small, targeted edits; explain intent and impact.
- Default to `apply_patch` for single-file edits.

## Repo Structure
- Extension entry: `src/extension/extension.ts`
- Debug adapter: `src/debug/adapter.ts`
- Platforms:
  - TEC-1 runtime + UI: `src/platforms/tec1/`
  - Simple runtime: `src/platforms/simple/`
- Mapping:
  - D8 map spec + builder: `src/mapping/d8-map.ts`
  - Source map index: `src/mapping/source-map.ts`
- Docs:
  - `README.md`
  - `docs/TECHNICAL.md`
  - `docs/D8_DEBUG_MAP.md`
  - `docs/PLATFORMS.md`
  - `docs/platforms/tec1/README.md`
  - `docs/TIMING_MODEL.md`

## Project Conventions
- Keep file paths ASCII unless a file already uses Unicode.
- Avoid adding new feature flags unless explicitly requested.
- Keep platform UI responsive; prefer lightweight DOM updates.
- Maintain TEC-1 compatibility and verify ROM assumptions in docs.

## Naming Conventions
- **Constants**: SCREAMING_SNAKE_CASE (`THREAD_ID`, `PORT_MAX`, `KEY_RESET`)
- **Interfaces/Types**: PascalCase (`LaunchRequestArguments`, `TerminalConfig`)
- **Functions/Methods**: camelCase (`validatePlatform`, `resolveBaseDir`)
- **File names**: kebab-case (`config-validation.ts`, `path-resolver.ts`)
- **Z80 core (src/z80/)**: Uses snake_case internally (legacy from js8080 port)
  - Do NOT refactor Z80 core naming to avoid breaking the emulator
  - Examples: `cycle_counts`, `parity_bits`, `do_rlc`, `mem_read`

## Quality Checks
- `yarn lint`
- `yarn build`
