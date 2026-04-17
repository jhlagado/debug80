# Platform Specification (v0.1)

This document defines the "platform" abstraction for Debug80. A platform is a
hosted Z80 environment: memory map, I/O devices, reset/boot rules, and any
machine-specific behavior. The debugger core (DAP + CPU + mapping) stays
unchanged; only the platform supplies the environment.

The format is intentionally simple: select a `platform` in `debug80.json`, then
provide a platform-specific config block. No feature flags.

Platform ids are now resolved through the lazy manifest in
`src/platforms/manifest.ts`. Built-in platforms register there, and external
extensions can add new entries through the public `Debug80Api.registerPlatform()`
surface documented in `docs/platform-extension-api.md`.

For per-platform details, see `src/platforms/README.md`.
For timing and time-series I/O, see `docs/timing-model.md`.
TEC-1G notes: `docs/platforms/tec1g/README.md`.

## Goals

- Support multiple Z80 target environments without changing the core debugger.
- Keep launch config minimal by using the existing target selection.
- Make the current simple environment configurable.
- Allow the supported machine profiles (Simple, TEC-1, TEC-1G) to evolve incrementally.

## Selection and configuration

Platform selection is per target in `debug80.json`:

```json
{
  "defaultTarget": "app",
  "targets": {
    "app": {
      "asm": "src/main.asm",
      "outputDir": "build",
      "artifactBase": "main",
      "platform": "simple",
      "terminal": {
        "rxPort": 16,
        "txPort": 17,
        "statusPort": 18,
        "newline": "\n"
      }
    }
  }
}
```

`platform` is a string id. The matching config object uses the same key as the
platform id (e.g. `simple`, `tec1`, `tec1g`).

## Folder structure

Platform modules live under `src/platforms/`:

```
src/
  platforms/
    serial/
      bitbang-uart.ts
    simple/
      provider.ts
      runtime.ts
    tec-common/
      index.ts
    tec1/
      provider.ts
      runtime.ts
    tec1g/
      provider.ts
      runtime.ts
```

Each platform can have its own dependencies. Shared serial helpers and TEC
constants live alongside the platform code. TEC-1 and TEC-1G now have their
runtime, controller, and webview panel modules under `src/platforms/`, while
the adapter and extension still orchestrate wiring. ROMs live under `roms/`.

## Core interfaces

The platform interface is minimal but explicit. This is a spec, not exact code:

```ts
export interface PlatformDefinition {
  id: string;
  name: string;
  description?: string;
  create(config: unknown, ctx: PlatformContext): PlatformRuntime;
}

export interface PlatformRuntime {
  memory: MemoryModel;
  io: IODeviceBus;
  onLoad?(ctx: PlatformContext): Promise<void> | void;
  onReset?(ctx: PlatformContext): void;
  onStop?(): void;
  interrupts?: InterruptModel;
  memoryMap?: MemoryRegion[];
}
```

### Memory model

The memory model is authoritative for reads/writes during emulation:

```ts
export interface MemoryModel {
  read8(addr: number): number;
  write8(addr: number, value: number): void;
  load?(addr: number, bytes: Uint8Array): void;
  reset?(): void;
  switchBank?(bank: number, slot?: number): void;
}
```

`memoryMap` (optional) describes ROM/RAM regions for diagnostics and UI:

```ts
export interface MemoryRegion {
  name: string;
  start: number;
  end: number; // exclusive
  kind: "rom" | "ram" | "io" | "banked" | "unknown";
  bank?: number;
  readOnly?: boolean;
}
```

### I/O devices

The I/O bus routes IN/OUT port access to devices:

```ts
export interface IODeviceBus {
  readPort(port: number): number;
  writePort(port: number, value: number): void;
  tick?(): void;
  register?(device: IODevice): void;
}

export interface IODevice {
  name: string;
  ports: number[];
  read(port: number): number;
  write(port: number, value: number): void;
  tick?(): void;
}
```

Devices register on the bus with port ranges and callbacks. A platform may
include a timer device, keyboard device, disk device, etc.

### Interrupts

Optional interrupt model for machines that raise INT/NMI:

```ts
export interface InterruptModel {
  raiseINT(): void;
  raiseNMI(): void;
  clearINT(): void;
}

export interface PlatformContext {
  sendOutput(text: string, category: 'console' | 'terminal'): void;
  raiseError(message: string): void;
  getPC(): number;
}
```

## Platform configs (v0.1)

### Simple platform

The current environment becomes the `simple` platform:
- ROM region `0x0000`–`0x07ff` (`0`–`2047`) (system layer).
- RAM region `0x0800`–`0xffff` (`2048`–`65535`) (program + data).
- CPU starts at `0x0000` (`0`), system init runs, then jumps to `0x0900` (`2304`).

Terminal I/O is still configurable via the `terminal` block.

```json
{
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
  },
  "terminal": {
    "rxPort": 16,
    "txPort": 17,
    "statusPort": 18,
    "statusBits": { "rxReadyBit": 0, "txReadyBit": 1 },
    "newline": "\n",
    "echo": true,
    "inputBufferSize": 256,
    "writeThrottleMs": 0
  }
}
```

Notes:
- `newline` defines what the terminal sends for Enter.
- `echo` controls local echo in the webview terminal.
- `statusBits` allows different bit conventions per platform.
- `simple.regions` define memory ranges (inclusive start/end).
- `simple.regions[].kind` can be `rom`, `ram`, `unknown`.
- `simple.regions[].readOnly` forces read-only for non-ROM regions (optional).
- `simple.appStart` is the expected entry address for user code (ORG).
- `simple.entry` is the CPU start address (default first ROM region start).
- `simple.binFrom`/`simple.binTo` optionally trigger an extra asm80 pass that emits `.bin`.

The repository no longer ships `cpm` or `microbee` platform directories or
example configs. Those machine profiles moved out of tree and are not covered by
this spec.

### TEC-1 (v0.1)

TEC-1 is a small ROM+RAM machine with keypad and 7-segment display:
- ROM: 0x0000 - 0x07ff (0 - 2047)
- RAM: 0x0800 - 0x0fff (2048 - 4095, 2 KB)
- Entry: 0x0000 (0), user programs start at 0x0800 (2048)

```json
{
  "platform": "tec1",
  "tec1": {
    "regions": [
      { "start": 0, "end": 2047, "kind": "rom" },
      { "start": 2048, "end": 4095, "kind": "ram" }
    ],
    "appStart": 2048,
    "entry": 0,
    "romHex": "roms/tec1/mon-1b/mon-1b.hex"
  }
}
```

`romHex` points at an Intel HEX file for the monitor ROM. If omitted, Debug80
uses the bundled `roms/tec1/mon-1b/mon-1b.hex`. Debug80 also bundles
`roms/tec1/mon-2/mon-2.hex` and `roms/tec1/jmon/jmon.hex` (both use RAM @ 0x0900). If you
already have a TypeScript module like
`MON-1B.ts` that exports a template string, Debug80 will accept that file and
extract the embedded HEX string.

Optional tuning fields:
- `updateMs` (default 16): min milliseconds between TEC-1 panel updates.
- `yieldMs` (default 0): extra yield delay when the emulator is ahead of real time.
- `ramInitHex`: optional Intel HEX file to preload RAM (e.g. a starter program).
- `extraListings`: optional list of additional `.lst` files to load for ROM/debug mapping.

Extra ROM listings:
- Use `extraListings` to load ROM listings that live outside the project (for example, in a
  platform repo). Paths are resolved relative to the `debug80.json` base directory; absolute
  paths also work.
- If a listing sits next to a matching `.asm`, `.zax`, or `.z80` source file, Debug80 will offer that source in the
  ROM source picker and use it for line-based breakpoints.
- Debug80 caches a D8 debug map under `<workspace>/.debug80/cache` as
  `<listing-base>.<hash>.d8.json` (hash from the listing path). If the workspace cache
  directory cannot be used, it falls back to the listing directory.
- If the `.lst` changes, Debug80 rebuilds the cache automatically. To force a rebuild,
  delete the matching `.d8.json` file (or the `.debug80/cache` directory).
- Missing listings emit a Debug Console message that includes the platform name.

```json
{
  "platform": "tec1",
  "tec1": {
    "romHex": "roms/tec1/mon-1b/mon-1b.hex",
    "extraListings": ["../platform/roms/tec1/mon-1b/mon-1b.lst"]
  }
}
```

ROM-specific RAM usage:
- MON-1 user programs start at 0x0800.
- MON-2 user programs start at 0x0900 (0x0800–0x08ff reserved for variables).

I/O map:
- IN 0x00: keycode (0x00–0x0f hex digits, 0x13 ADDRESS, 0x10 UP (+), 0x12 GO, 0x11 DOWN (-))
- OUT 0x01: digit select (bits 0–5, one-hot) + serial TX on bit 6 + speaker on bit 7 (latched)
- OUT 0x02: segment bits (latched)
- NMI at 0x0066 on keypress

Serial (bitbang):
- TX on bit 6 of OUT 0x01 (idle high).
- RX on bit 7 of IN 0x00 (idle high).
- Debug80 decodes TX at 9600 baud assuming FAST = 4.0 MHz.
- The TEC-1 panel can inject RX bytes (CR on send). To avoid the classic first-byte
  drop in ROM bitbang receivers, Debug80 injects a one-time `0x00` sync byte on the
  first SEND only. If you write your own ROM, ignore a single leading `0x00` on the
  first receive or perform a one-byte flush at startup.

Segment bit mapping (PORTSEGS):
- 0x01 = a (top)
- 0x02 = f (upper-left)
- 0x04 = g (middle)
- 0x08 = b (upper-right)
- 0x10 = dp (decimal point)
- 0x20 = c (lower-right)
- 0x40 = e (lower-left)
- 0x80 = d (bottom)

Minimal RAM program example (ORG 0x0800) that shows a single digit:

```asm
        ORG 0x0800

loop:   LD  A, 0x01       ; select rightmost digit (bit 0)
        OUT (0x01), A
        LD  A, 0xEB       ; "0" segment pattern from HEXSEGTBL
        OUT (0x02), A
        JP  loop
```

Build it with asm80 (or let Debug80 assemble it), then run the ROM monitor and
press ADDRESS to 0800 followed by GO. The ROM keeps scanning once your program
takes over, so your code should refresh the display as needed.

Mon-2 example (RAM reserved 0x0800–0x08ff, user programs at 0x0900):

```json
{
  "platform": "tec1",
  "tec1": {
    "romHex": "roms/tec1/mon-2/mon-2.hex",
    "regions": [
      { "start": 0, "end": 2047, "kind": "rom" },
      { "start": 2048, "end": 4095, "kind": "ram" }
    ],
    "appStart": 2304,
    "entry": 0
  }
}
```

### TEC-1G: bundled MON3 (wizard and manual projects)

For **TEC-1G**, Debug80 can ship a **MON3** ROM snapshot inside the VSIX and
resolve it directly at launch, with an explicit command available if you want
to copy it into your workspace under stable paths (see
`docs/plans/platform-rom-bundles.md`).

**After “Create Project” (TEC-1G)** the extension records the MON-3 bundle
reference in `debug80.json` and resolves the shipped bundle on launch when no
workspace copy is present:

- `roms/tec1g/mon3/mon3.bin` — monitor ROM image (`tec1g.romHex`; `.bin` or `.hex` per program loader rules).
- `roms/tec1g/mon3/mon3.lst` — ASM80 listing for ROM source mapping (`tec1g.extraListings`).
- `tec1g.sourceRoots` includes `src` and `roms/tec1g/mon3` so monitor sources resolve cleanly when a listing is present.

**Command:** **Debug80: Copy Bundled MON3 ROM into Workspace** (`debug80.materializeBundledRom`) — pick a folder and optional overwrite; copies the same files on demand.

New TEC-1G projects keep the MON-3 bundle reference in `debug80.json` by
default. At launch, Debug80 resolves the shipped bundle directly when the
workspace copy is absent, and the explicit materialize command remains
available if you want local ROM/listing files.

**Manual project (no wizard):** point `tec1g.romHex` and `tec1g.extraListings` at workspace-relative paths (or absolute paths). Example:

```json
{
  "defaultTarget": "app",
  "targets": {
    "app": {
      "sourceFile": "src/main.asm",
      "outputDir": "build",
      "artifactBase": "main",
      "platform": "tec1g",
      "tec1g": {
        "regions": [
          { "start": 0, "end": 2047, "kind": "rom" },
          { "start": 2048, "end": 32767, "kind": "ram" },
          { "start": 49152, "end": 65535, "kind": "rom" }
        ],
        "appStart": 16384,
        "entry": 0,
        "romHex": "roms/tec1g/mon3/mon3.bin",
        "extraListings": ["roms/tec1g/mon3/mon3.lst"],
        "sourceRoots": ["src", "roms/tec1g/mon3"]
      }
    }
  }
}
```

**Overrides:** replace the files on disk and keep the same paths, or change `romHex` /
`extraListings` / `sourceRoots` to your own MON3 build. Day-to-day debugging uses only
workspace paths, not paths inside the extension.

More hardware and I/O detail: `docs/platforms/tec1g/README.md`.

## Build and launch flow

1) User selects a target in the debug config (via `projectConfig` + `target`).
2) Debug80 reads `platform`, resolves the matching manifest entry, and lazy-loads
  the platform provider.
3) Platform sets up memory and devices, then the CPU runs normally.
4) Mapping, breakpoints, and stepping are unchanged.

Reset behavior:
- A reset clears CPU and device state.
- Debug80 reloads the HEX into memory after reset.
- Platform `onReset` should reset device state and bank selection.

## v0.1 expectations

- Terminal platform is configurable and is the default.
- Built-in platform entries are registered in `src/platforms/manifest.ts`.
- External platforms can be registered during extension activation without
  editing the Debug80 core.
- The platform config lives in `debug80.json` per target.
- Runtime providers and platform sidebar UI modules are lazy-loaded.

## Future expansion

- Stable published import paths for third-party platform packages.
- More worked examples of external platform packages and wrapper extensions.
- Common device library (terminal, keyboard, display, disk).
- Memory map visualization in the debugger UI.
