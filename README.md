# Debug80 (Z80 debugger with HEX/LST)

Minimal VS Code debug adapter for Z80 programs. It loads Intel HEX + .lst listings, supports address breakpoints via the listing, stepping/continue, and exposes registers. TinyCPU support has been removed. “Debug80” is the debugger name used in the examples below.

## Prerequisites

- Node 18+ (Node 20+ recommended)
- Yarn
- asm80 installed locally: `yarn add -D asm80`

## Install & Build

```bash
yarn install --ignore-engines
yarn build
yarn test
```

## Project config (recommended)

Add a `debug80.json` at the repo root so F5 doesn’t depend on the active editor. Example:
```json
{
  "defaultTarget": "app",
  "targets": {
    "app": {
      "sourceFile": "examples/echo.asm",
      "outputDir": "build",
      "artifactBase": "echo",
      "entry": 0
    }
  }
}
```
Fields per target:
- `sourceFile`: root asm file to assemble
- `outputDir`: where artifacts go
- `artifactBase`: basename for artifacts
- `hex`, `listing`: optional explicit paths (override defaults)
- `entry`: optional entry point override
- You can define multiple targets (e.g., `app`, `unit`, `integration`) and set `defaultTarget`.

## Z80 workflow

1) Add `.debug80.json` as above.
2) Use “Debug Z80 (asm80, project config)” or “Debug Z80 (z80asm, project config)” launch configs; they read `debug80.json`. PreLaunch tasks emit HEX/LST into `outputDir`.
3) Set breakpoints in the generated `.lst`; they map to instruction addresses.
4) Start debugging (F5). `stopOnEntry` halts on entry; Step/Continue as usual. Registers show in the Variables view.

Task/launch config reference:
- `.vscode/tasks.json` includes `asm80: build z80` and `z80asm: build z80`.
- `.vscode/launch.json` has “Debug Z80 (asm80)”, “Debug Z80 (z80asm)”, and they can read `.debug80.json`.

Notes:
- HALT stops execution; Continue again to terminate.
- Listing/HEX are required; ensure the preLaunch task has run or exists already.
