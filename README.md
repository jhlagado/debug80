# Debug80 (Z80 debugger with HEX/LST + asm80)

Minimal VS Code debug adapter for Z80 programs. It loads Intel HEX + .lst listings, runs asm80 by default before each debug session (when an asm root is provided), supports source-level stepping/breakpoints, and exposes registers. “Debug80” is the debugger name used in the examples below.

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

Add `.vscode/debug80.json` so F5 doesn’t depend on the active editor (`debug80.json` at the repo root also works). Example:
```json
{
  "defaultTarget": "app",
  "targets": {
    "app": {
      "sourceFile": "examples/echo.asm",
      "outputDir": "build",
      "artifactBase": "echo",
      "platform": "simple"
    }
  }
}
```
Fields per target:
- `sourceFile`: root asm file to assemble
- `outputDir`: where artifacts go
- `artifactBase`: basename for artifacts
- `platform`: currently `simple` (ROM 0x0000–0x07ff, CPU starts at 0x0000, app at 0x0900)
- `assemble`: defaults to `true`. Set to `false` to skip running asm80 (use existing HEX/LST).
- `hex`, `listing`: optional explicit paths (override defaults)
- `entry`: optional entry point override (ignored by `simple`)
- `sourceRoots`: optional list of directories to resolve `.asm` files referenced by the LST
- `stepOverMaxInstructions`: optional max instructions for Step Over (`0` disables the cap)
- `stepOutMaxInstructions`: optional max instructions for Step Out (`0` disables the cap)
- `terminal`: optional terminal port map for the `simple` platform
- You can define multiple targets (e.g., `app`, `unit`, `integration`) and set `defaultTarget`.

## Create a Debug80 project (scaffold)

To make a folder debuggable quickly in VS Code:

1) Press `Cmd-Shift-P` (macOS) or `Ctrl-Shift-P` (Windows/Linux) to open the Command Palette.
2) Type “Debug80: Create Project (config + launch)” and press Enter.

This command:
- Creates `.vscode/debug80.json` with a default target (tries `src/main.asm`, or the first `.asm` it finds).
- Creates `.vscode/launch.json` with a Debug80 launch configuration.

After scaffolding, adjust the `sourceFile`, `outputDir`, and `artifactBase` as needed, then press F5.

## Z80 workflow

1) Run “Debug80: Create Project (config + launch)” to scaffold `.vscode/debug80.json` (defaults to `targets.app` with `src/main.asm`) and `.vscode/launch.json`.
2) Start debugging with the generated debug80 launch; the adapter reads `.vscode/debug80.json`, runs `asm80` automatically using the target’s `sourceFile`/`asm`, and writes HEX/LST into `outputDir` (install `asm80` locally first). Set `assemble: false` to use pre-built artifacts instead.
3) Set breakpoints in `.asm` files (preferred). Listing breakpoints in `.lst` still work as a fallback.
4) Start debugging (F5). `stopOnEntry` halts on entry; Step/Continue as usual. Registers show in the Variables view.

Notes:
- HALT stops execution; Continue again to terminate.
- Listing/HEX are required; ensure asm80 completes successfully or provide existing artifacts.
- Step Over/Step Out can run for a long time in tight loops; use Pause to interrupt if needed.

## Docs

- `docs/TECHNICAL.md` — detailed developer guide to the extension, adapter, mapping, and stepping
dddd
