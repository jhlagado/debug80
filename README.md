# Debug80 (Z80 debugger with HEX/LST + asm80)

Minimal VS Code debug adapter for Z80 programs. It loads Intel HEX + .lst listings, runs asm80 by default before each debug session (when an asm root is provided), supports address breakpoints via the listing, stepping/continue, and exposes registers. TinyCPU support has been removed. “Debug80” is the debugger name used in the examples below.

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
- `assemble`: defaults to `true`. Set to `false` to skip running asm80 (use existing HEX/LST).
- `hex`, `listing`: optional explicit paths (override defaults)
- `entry`: optional entry point override
- You can define multiple targets (e.g., `app`, `unit`, `integration`) and set `defaultTarget`.

## Z80 workflow

1) Run “Debug80: Create Project (config + launch)” to scaffold `debug80.json` (defaults to `targets.app` with `src/main.asm`) and `.vscode/launch.json`.
2) Start debugging with the generated debug80 launch; the adapter reads `debug80.json`, runs `asm80` automatically using the target’s `sourceFile`/`asm`, and writes HEX/LST into `outputDir` (install `asm80` locally first). Set `assemble: false` to use pre-built artifacts instead.
3) Set breakpoints in the generated `.lst`; they map to instruction addresses.
4) Start debugging (F5). `stopOnEntry` halts on entry; Step/Continue as usual. Registers show in the Variables view.

Notes:
- HALT stops execution; Continue again to terminate.
- Listing/HEX are required; ensure asm80 completes successfully or provide existing artifacts.
