---
layout: default
title: 'Appendix B — Platform Configuration Reference'
parent: 'Appendices'
grand_parent: 'Debug80 Engineering Manual'
nav_order: 2
---

[Appendices](index.md)

# Appendix B — Platform Configuration Reference

Project configuration lives in `debug80.json` at the workspace folder root. Top-level fields apply to every session. Platform-specific fields live inside a block keyed by the platform name.

---

## Top-level launch fields

| Field                     | Type       | Default                                                | Description                                                                           |
| ------------------------- | ---------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `platform`                | `string`   | `'simple'`                                             | Platform to emulate: `'simple'`, `'tec1'`, or `'tec1g'`                               |
| `asm`                     | `string`   | —                                                      | Path to the main Z80 assembly source file                                             |
| `sourceFile`              | `string`   | —                                                      | Alias for `asm`                                                                       |
| `assembler`               | `string`   | inferred                                               | Assembler backend identifier. Inferred from source extension unless set explicitly.   |
| `hex`                     | `string`   | derived                                                | Path to the output Intel HEX file; derived from `asm` if omitted                      |
| `outputDir`               | `string`   | `build`                                                | Directory for build artifacts                                                         |
| `artifactBase`            | `string`   | asm filename                                           | Base name for generated artifacts such as `.hex`, `.bin`, `.d8.json`, and AZM reports |
| `entry`                   | `number`   | platform default                                       | CPU entry address; overrides the platform block's `entry`                             |
| `stopOnEntry`             | `boolean`  | `true` in raw launch schema; panel toggle defaults off | Pause at the entry point before executing                                             |
| `projectConfig`           | `string`   | —                                                      | Explicit path to a Debug80 project config, normally root `debug80.json`               |
| `target`                  | `string`   | —                                                      | Named build target (for multi-target projects)                                        |
| `assemble`                | `boolean`  | `true`                                                 | Run the assembler before starting the session                                         |
| `sourceRoots`             | `string[]` | `[]`                                                   | Directories to search when resolving source file paths                                |
| `stepOverMaxInstructions` | `number`   | `0`                                                    | Instruction limit for step-over; `0` = unlimited                                      |
| `stepOutMaxInstructions`  | `number`   | `0`                                                    | Instruction limit for step-out; `0` = unlimited                                       |
| `diagnostics`             | `boolean`  | `false`                                                | Emit verbose diagnostic messages to the debug console                                 |
| `azm`                     | `object`   | —                                                      | AZM-specific compile options; see below                                               |

Debug80 currently infers `azm` for `.asm`, `.inc`, and `.z80`, and `glimmer` for `.glim`. The top-level `azm` block is only consulted by the AZM-backed paths, including the Glimmer flow's internal AZM work inside `@jhlagado/glimmer`.

### AZM options

Most users should rely on defaults, but launch config may pass a small `azm` object through to the linked compile API:

| Field                         | Type                                                | Default | Description                                                                      |
| ----------------------------- | --------------------------------------------------- | ------- | -------------------------------------------------------------------------------- |
| `registerContracts`           | `'off' \| 'audit' \| 'warn' \| 'error' \| 'strict'` | `'off'` | AZM register contract mode                                                       |
| `symbolCase`                  | `'strict' \| 'insensitive'`                           | `'strict'` | Symbol lookup mode; insensitive supports legacy source capitalization         |
| `registerContractsPolicy`     | `{ strict?: string[]; audit?: string[]; off?: string[] }` | —       | File-scoped register contract policy using AZM glob patterns                     |
| `emitRegisterReport`          | `boolean`                                           | `false` | Write a `.regcontracts.txt` report artifact when register contract analysis runs |
| `emitRegisterInterface`       | `boolean`                                           | `false` | Write an inferred `.asmi` interface artifact                                     |
| `registerContractsProfile`    | `'mon3'`                                            | —       | Built-in AZM register contract profile                                           |
| `registerContractsInterfaces` | `string[]`                                          | `[]`    | External `.asmi` contract files to load                                          |

`registerContractsPolicy` lets one AZM compile use different register-contract modes for different source files. Use `registerContracts` as the fallback mode, then add `strict`, `audit`, and `off` glob lists for file-specific overrides:

```json
{
  "azm": {
    "registerContracts": "strict",
    "registerContractsPolicy": {
      "strict": ["src/**/*.asm", "roms/tec1g/tecm8/expansion/**/*.asm"],
      "audit": ["roms/tec1g/tecm8/monitor/**/*.asm"],
      "off": ["vendor/**/*.asm"]
    },
    "emitRegisterReport": true,
    "registerContractsProfile": "mon3"
  }
}
```

AZM resolves policy entries by source-file glob. More specific patterns win over broader patterns; if matches tie, the stricter mode wins. Policy entries use only `strict`, `audit`, and `off`; compatibility modes such as `warn` and `error` remain top-level `registerContracts` modes.

Every Project panel exposes a **Strict labels** checkbox backed by the
project-level `azm.symbolCase` field. It is checked by default. Clearing it
immediately persists `"insensitive"` in `debug80.json`, allowing AZM to resolve
legacy symbol references with inconsistent capitalization. The TEC-1G Project
accordion also exposes session-scoped **Register Contracts** (`Enforce`,
`Audit`, `Off`) and **Contract Updates** (`Ask`, `Auto`, `Never`) controls.
Those contract controls are not persisted directly into `debug80.json`.

---

## Simple platform (`"platform": "simple"`)

Config block key: `simple`

| Field      | Type             | Default              | Description                                                              |
| ---------- | ---------------- | -------------------- | ------------------------------------------------------------------------ |
| `regions`  | `MemoryRegion[]` | 2 KB ROM + 62 KB RAM | Memory layout; each region has `start`, `end`, `kind` (`'rom'`\|`'ram'`) |
| `entry`    | `number`         | first ROM start      | CPU program counter at session start                                     |
| `appStart` | `number`         | `0x0900`             | Application start address (used by assembler directives)                 |
| `binFrom`  | `number`         | —                    | Start address for binary output                                          |
| `binTo`    | `number`         | —                    | End address for binary output                                            |

---

## TEC-1 platform (`"platform": "tec1"`)

Config block key: `tec1`

| Field        | Type             | Default              | Description                                        |
| ------------ | ---------------- | -------------------- | -------------------------------------------------- |
| `regions`    | `MemoryRegion[]` | 4 KB ROM + 60 KB RAM | Memory layout                                      |
| `entry`      | `number`         | first ROM start      | CPU entry address                                  |
| `appStart`   | `number`         | `0x1200`             | Application start address                          |
| `romHex`     | `string`         | —                    | Path to TEC-1 ROM HEX file (monitor)               |
| `ramInitHex` | `string`         | —                    | Path to a HEX file loaded into RAM at startup      |
| `updateMs`   | `number`         | `16`                 | UI refresh interval in milliseconds                |
| `yieldMs`    | `number`         | `0`                  | Yield to the event loop every N ms; `0` = no yield |

---

## TEC-1G platform (`"platform": "tec1g"`)

Config block key: `tec1g`

| Field             | Type             | Default                             | Description                                                                                                                                |
| ----------------- | ---------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `regions`         | `MemoryRegion[]` | 16 KB ROM0 + 16 KB RAM + 32 KB ROM1 | Memory layout                                                                                                                              |
| `entry`           | `number`         | `0x8000`                            | CPU entry address (ROM1 entry)                                                                                                             |
| `appStart`        | `number`         | `0x4200`                            | Application start address                                                                                                                  |
| `romHex`          | `string`         | —                                   | Path to TEC-1G ROM HEX file                                                                                                                |
| `ramInitHex`      | `string`         | —                                   | Path to a HEX file loaded into RAM at startup                                                                                              |
| `expansionRomHex` | `string`         | —                                   | Path to an optional 16K to 144K expansion ROM image mapped through the 0x8000-0xBFFF banked window                                        |
| `romArtifacts`    | `object[]`       | —                                   | Explicit TEC-1G ROM-first build declarations for monitor and expansion images                                                              |
| `updateMs`        | `number`         | `16`                                | UI refresh interval in milliseconds                                                                                                        |
| `yieldMs`         | `number`         | `0`                                 | Yield to the event loop every N ms                                                                                                         |
| `expansionBankHi` | `boolean`        | `false`                             | Enable A14 expansion banking via SYSCTRL bit 3                                                                                             |
| `matrixMode`      | `boolean`        | `false`                             | Initial MON-3 Matrix CONFIG state; the TEC-1G webview normally drives and reasserts this from Matrix Keyboard accordion visibility         |
| `protectOnReset`  | `boolean`        | `false`                             | Write-protect ROM ranges on cold reset                                                                                                     |
| `rtcEnabled`      | `boolean`        | `false`                             | Emulate the DS1302 real-time clock                                                                                                         |
| `sdEnabled`       | `boolean`        | `false`                             | Emulate the SPI SD card interface                                                                                                          |
| `sdImagePath`     | `string`         | —                                   | Path to the SD card image file                                                                                                             |
| `sdHighCapacity`  | `boolean`        | `true`                              | SD card operates in SDHC mode                                                                                                              |
| `gimpSignal`      | `boolean`        | `false`                             | Enable GIMP signal simulation for hardware diagnostics                                                                                     |
| `uiVisibility`    | `object`         | all visible                         | Legacy per-panel visibility flags retained for old configs; the current TEC-1G UI keeps core hardware sections visible and uses accordions |

### `tec1g.romArtifacts`

`romArtifacts` is validated only for TEC-1G launches. The current schema allows one active monitor artifact and one active expansion artifact. Active entries must be source-backed and are assembled before runtime creation. A TEC-1G expansion artifact may either be a single source-backed 16K window or a multibank artifact with explicit per-bank sources. That build path forces AZM `registerContracts` off, suppresses register-report output, pads generated bank binaries to their configured size, writes configurable multibank output recipes when requested, and keeps the configured `tec1g.entry` authoritative whenever an active monitor artifact owns the launch.

| Field            | Type      | Required | Description                                                                  |
| ---------------- | --------- | -------- | ---------------------------------------------------------------------------- |
| `id`             | `string`  | yes      | Stable artifact identifier used in diagnostics                               |
| `role`           | `string`  | yes      | `'monitor'` or `'expansion'`                                                 |
| `active`         | `boolean` | no       | Defaults to active; `false` keeps a binary-only placeholder out of launch    |
| `sourceFile`     | `string`  | active   | Source file assembled with AZM                                               |
| `outputBin`      | `string`  | active   | Binary output path. Must use `.bin`                                          |
| `outputDebugMap` | `string`  | no       | Optional explicit D8 path. Must match the `outputBin` artifact base          |
| `binary`         | `string`  | inactive | Binary-only placeholder path for deferred artifact installs                  |
| `debugMap`       | `string`  | no       | Optional D8 path paired with an inactive binary-only placeholder             |
| `address`        | `number`  | monitor  | Must be `0xC000`                                                             |
| `size`           | `number`  | monitor  | Must be `0x4000`                                                             |
| `windowAddress`  | `number`  | expansion| Must be `0x8000`                                                             |
| `windowSize`     | `number`  | expansion| Must be `0x4000`                                                             |
| `imageSize`      | `number`  | expansion| Total binary image size. Must be a positive multiple of `bankSize`           |
| `bankSize`       | `number`  | expansion| Current Phase 2 model requires it to equal `windowSize`                      |
| `bankCount`      | `number`  | expansion| Must equal `imageSize / bankSize`; valid range is 1-9                         |
| `bankSelect`     | `object`  | no       | Bank-selection metadata. Current shape supports `{ kind: 'tec1g-standard' }` |
| `banks`          | `object[]`| expansion| Multibank source declarations keyed by physical expansion bank                |
| `outputs`        | `object[]`| no       | Optional multibank output recipes derived from the built bank images         |

Multibank expansion entries omit top-level `sourceFile` and `outputDebugMap`.
The top-level `outputBin` is the Debug80 runtime image loaded through
`tec1g.expansionRomHex`. Each `banks[]` entry declares:

| Field            | Type      | Required | Description                                                                  |
| ---------------- | --------- | -------- | ---------------------------------------------------------------------------- |
| `physicalBank`   | `number`  | yes      | Physical expansion bank, valid range 0-8                                     |
| `sourceFile`     | `string`  | yes      | Bank source assembled at the visible `0x8000-0xBFFF` window                  |
| `outputBin`      | `string`  | yes      | Per-bank 16K binary output path. Must use `.bin`                             |
| `outputDebugMap` | `string`  | no       | Optional D8 path. Must match the bank `outputBin` artifact base              |

When `outputs` is omitted, Debug80 writes the top-level `outputBin` as a
physical-layout image, preserving the existing multibank behavior. When
`outputs` is present, each recipe consumes the already-built bank images:

| Field       | Type       | Required | Description                                                                    |
| ----------- | ---------- | -------- | ------------------------------------------------------------------------------ |
| `id`        | `string`   | yes      | Stable output identifier used in diagnostics                                   |
| `kind`      | `string`   | yes      | `'packed'` or `'perBank'`                                                      |
| `banks`     | `number[]` | yes      | Declared physical banks to include, with no duplicates                         |
| `layout`    | `string`   | no       | Packed output layout. Defaults to `'contiguous'`; `'physical'` writes banks at physical offsets |
| `outputBin` | `string`   | packed   | Packed binary output path. Must use `.bin`                                     |
| `outputDir` | `string`   | perBank  | Directory that receives `bank0.bin`, `bank1.bin`, etc.                         |

If no packed recipe writes the top-level `outputBin`, Debug80 still creates it
as the physical runtime image so launch behavior remains stable.

---

## Memory region shape

Regions are listed in order. The adapter assigns `romRanges` from any region with `kind: 'rom'`. Writes to ROM ranges are silently ignored.

```json
{
  "regions": [
    { "start": 0, "end": 16383, "kind": "rom" },
    { "start": 16384, "end": 65535, "kind": "ram" }
  ]
}
```

---

[Appendices](index.md)
