# Debug80 (Z80 debugger with HEX/LST + asm80)

[![CI](https://github.com/jhlagado/debug80/actions/workflows/ci.yml/badge.svg)](https://github.com/jhlagado/debug80/actions/workflows/ci.yml)

Minimal VS Code debug adapter for Z80 programs. It loads Intel HEX + .lst listings, runs asm80 by default before each debug session (when an asm root is provided), supports source-level stepping/breakpoints, and exposes registers. “Debug80” is the debugger name used in this document.

TEC-1-specific workspace setups live in the separate `debug80-tec1` repo:
https://github.com/jhlagado/debug80-tec1

TEC-1G-specific workspace setups live in the separate `debug80-tec1g` repo:
https://github.com/jhlagado/debug80-tec1g

This repository keeps the shared debugger and a small `test/fixtures` stub for the root `debug80.json`.

<table>
  <tr>
    <td bgcolor="#0b0b0b" align="center">
      <img src="assets/debug80_pixel_art_flat.png" width="360" alt="Debug80 pixel art logo">
    </td>
  </tr>
</table>

## Prerequisites

- Node 18+ (Node 20+ recommended)
- npm (ships with Node)
- asm80 installed locally: `npm install -D asm80`

## Local ZAX checkout (develop ZAX + Debug80 without npm publish)

Debug80 depends on [`@jhlagado/zax`](https://www.npmjs.com/package/@jhlagado/zax) (e.g. `"@jhlagado/zax": "^0.2.2"` in `package.json`) for the `.zax` assembler backend. **Keep that semver range in git** so CI, VSIX packaging, and collaborators all resolve the same dependency story. Do not commit `file:../zax` (or similar) in this repo if you want a single, consistent install.

### `npm link` (recommended for local ZAX development)

`npm link` does **not** change `package.json`. It only changes what ends up under `node_modules/@jhlagado/zax` on your machine:

```bash
# 1) In the ZAX repo: build, then register globally
cd /path/to/ZAX
npm run build
npm link

# 2) In the Debug80 repo: use that link
cd /path/to/debug80
npm link @jhlagado/zax
```

After **every change to ZAX TypeScript**, rebuild the compiler (`npm run build` in ZAX). Debug80 reads `dist/src/cli.js` from the linked tree; you usually **do not** need to reinstall or rebuild Debug80 for ZAX-only changes.

To match what users get from npm (or before you cut a release), put the tree back:

```bash
cd /path/to/debug80
npm unlink @jhlagado/zax
npm install
```

(From the ZAX repo, `npm unlink` removes the global registration when you no longer need it.)

Packaging the extension (`vsce package` / clean `npm ci`) uses the registry with a normal `package.json` — no link — unless you explicitly link in that environment.

### Optional environment overrides

For one-off cases (e.g. point at a specific `cli.js` without using `npm link`), you can set these **before** extension host resolution; they are **not** required for normal development:

- **`DEBUG80_ZAX_CLI`**: absolute path to `dist/src/cli.js` (or another runnable entry).
- **`DEBUG80_ZAX_ROOT`**: path to the ZAX repo root (uses `dist/src/cli.js` under it).

Restart VS Code (or the Extension Development Host) after changing them, or set them via **`terminal.integrated.env.*`** / launch **`env`**.

If unset, Debug80 resolves `@jhlagado/zax` from `node_modules` (registry install or `npm link` as above).

## Install & Build

```bash
npm install
npm run build
npm test
```

## Local VSIX Candidate

```bash
npm ci
npm run package:check
code --install-extension debug80-0.0.1.vsix --force
```

The full release checklist is in `docs/release-process.md`.

## Quick start

- Open the separate [`debug80-tec1g`](https://github.com/jhlagado/debug80-tec1g) repo for TEC-1G monitor + serial workflows (or `debug80-tec1g-mon3` for MON-3–oriented workspaces).
- Open the separate [`debug80-tec1`](https://github.com/jhlagado/debug80-tec1) repo for TEC-1 monitor + serial workflows.
- With this repo open, you can point `debug80.json` at `test/fixtures/echo.asm` and press F5 for a minimal Simple-platform smoke run.

Platform-focused repos ship their own `.vscode` configs; use those for full demos.

## Project config (recommended)

Add `.vscode/debug80.json` so F5 doesn’t depend on the active editor (`debug80.json` at the repo root also works). Example:
```json
{
  "defaultTarget": "app",
  "targets": {
    "app": {
      "sourceFile": "test/fixtures/echo.asm",
      "outputDir": "build",
      "artifactBase": "echo",
      "platform": "simple",
      "simple": {
        "regions": [
          { "start": 0, "end": 2047, "kind": "rom" },
          { "start": 2048, "end": 65535, "kind": "ram" }
        ],
        "appStart": 2304,
        "entry": 0,
        "binFrom": 2304,
        "binTo": 65535
      }
    }
  }
}
```
Fields per target:
- `sourceFile`: root asm file to assemble
- `outputDir`: where artifacts go
- `artifactBase`: basename for artifacts
- `platform`: currently `simple`
- `simple`: platform config (memory `regions` with `kind` + `readOnly`; CPU starts at 0x0000 / 0, app at 0x0900 / 2304)
- `simple.binFrom`/`simple.binTo`: optional, emits a `.bin` via an extra asm80 pass
- `assemble`: defaults to `true`. Set to `false` to skip running asm80 (use existing HEX/LST).
- `hex`, `listing`: optional explicit paths (override defaults)
- `entry`: optional entry point override (non-simple platforms)
- `sourceRoots`: optional list of directories to resolve `.asm` files referenced by the LST
- `stepOverMaxInstructions`: optional max instructions for Step Over (`0` disables the cap)
- `stepOutMaxInstructions`: optional max instructions for Step Out (`0` disables the cap)
- `terminal`: optional terminal port map for the `simple` platform
- You can define multiple targets (e.g., `app`, `unit`, `integration`) and set `defaultTarget`.

Launch config (`.vscode/launch.json`) option:
- `openRomSourcesOnLaunch`: opens ROM listing/source files automatically when a session starts (default true).
- `openMainSourceOnLaunch`: opens the primary source file automatically when a session starts.
- `sourceColumn`: editor column (1-9) for source files opened on launch (default 1).
- `panelColumn`: editor column (1-9) for Debug80 platform panels (default 2).

## Create a Debug80 project (scaffold)

To make a folder debuggable quickly in VS Code:

1) Press `Cmd-Shift-P` (macOS) or `Ctrl-Shift-P` (Windows/Linux) to open the Command Palette.
2) Type “Debug80: Create Project (config + launch)” and press Enter.

This command scaffolds a built-in profile kit:
- Creates `debug80.json` (or you may place it at `.vscode/debug80.json`) with a default target (tries `src/main.asm`, or the first `.asm` it finds).
- Creates `.vscode/launch.json` with a Debug80 launch configuration when you choose a launch-enabled scaffold.
- Merges a small **Debug80** block into `.gitignore` if missing: `.debug80/` cache, the default `outputDir`, `.vscode/launch.json` (local-only; the extension also contributes a default launch), and common OS junk. It does not ignore the whole `.vscode/` folder, because project config can live at `.vscode/debug80.json`.
- Built-in kits cover Simple/default, TEC-1/MON-1B, TEC-1/Classic 2K, and TEC-1G/MON-3.
- It does not generate `.vscode/settings.json`; the extension already contributes the relevant file associations.

After scaffolding, adjust the `sourceFile`, `outputDir`, and `artifactBase` as needed, then press F5.

To target a different platform (e.g., `tec1`):
- Set `platform: "tec1"` in `.vscode/debug80.json`.
- Copy relevant fields from the dedicated `debug80-tec1` repo’s `.vscode/debug80.json` (e.g., memory regions, ROM, `ramInitHex`).
- Update `sourceFile` to your program and build outputs.

## Z80 workflow

1) Run “Debug80: Create Project (config + launch)” to scaffold `debug80.json` (defaults to `targets.app` with `src/main.asm`) and, if requested, `.vscode/launch.json`. The profile picker lets you choose the built-in kit before scaffolding.
2) Start debugging with the generated debug80 launch; the adapter reads `debug80.json` (or `.vscode/debug80.json` if you use that layout), runs `asm80` automatically using the target’s `sourceFile`/`asm`, and writes HEX/LST into `outputDir` (install `asm80` locally first). Set `assemble: false` to use pre-built artifacts instead.
3) Set breakpoints in `.asm` files (preferred). Listing breakpoints in `.lst` still work as a fallback.
4) Start debugging (F5). `stopOnEntry` halts on entry; Step/Continue as usual. Registers show in the Variables view.

Notes:
- HALT stops execution; Continue again to terminate.
- Listing/HEX are required; ensure asm80 completes successfully or provide existing artifacts.
- Step Over/Step Out can run for a long time in tight loops; use Pause to interrupt if needed.

## External projects (e.g., caverns80)

For external repos:
1) Open the external project as your workspace (e.g., `caverns80`).
2) Run “Debug80: Create Project (config + launch)” to scaffold `.vscode`.
3) Update the selected profile kit and `sourceFile` to match the project and platform (Simple/TEC-1).
4) Press F5.

This keeps example configs inside Debug80 while letting external projects own their debug setup.

## Docs

- `docs/technical.md` — detailed developer guide to the extension, adapter, mapping, and stepping
- `docs/design-project-workflow.md` — proposed project creation, selection, and entry-point workflow
- `docs/platforms.md` — platform architecture and config references
- `docs/platform-extension-api.md` — how external extensions register new runtime/UI platforms
- `docs/d8-debug-map.md` — debug map format and generator notes
- `docs/timing-model.md` — timing and cycle model details
- `docs/platform-development-guide.md` — how to add a new platform runtime/UI
