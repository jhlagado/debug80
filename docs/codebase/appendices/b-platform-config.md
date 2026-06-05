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
| `assembler`               | `string`   | inferred                                               | Assembler backend identifier. AZM is the supported backend.                           |
| `hex`                     | `string`   | derived                                                | Path to the output Intel HEX file; derived from `asm` if omitted                      |
| `outputDir`               | `string`   | asm dir                                                | Directory for build artifacts                                                         |
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

### AZM options

Debug80's current assembler backend is AZM. Most users should rely on defaults, but launch config may pass a small `azm` object through to the linked compile API:

| Field                         | Type                                                | Default | Description                                                                      |
| ----------------------------- | --------------------------------------------------- | ------- | -------------------------------------------------------------------------------- |
| `registerContracts`           | `'off' \| 'audit' \| 'warn' \| 'error' \| 'strict'` | `'off'` | AZM register contract mode                                                       |
| `emitRegisterReport`          | `boolean`                                           | `false` | Write a `.regcontracts.txt` report artifact when register contract analysis runs |
| `emitRegisterInterface`       | `boolean`                                           | `false` | Write an inferred `.asmi` interface artifact                                     |
| `registerContractsProfile`    | `'mon3'`                                            | —       | Built-in AZM register contract profile                                           |
| `registerContractsInterfaces` | `string[]`                                          | `[]`    | External `.asmi` contract files to load                                          |

The TEC-1G Project accordion exposes simpler session-scoped controls: **Register Contracts** (`Enforce`, `Audit`, `Off`) and **Contract Updates** (`Ask`, `Auto`, `Never`). Those controls are not persisted directly into `debug80.json`; the extension maps them into launch-time `azm` options when the user restarts debugging. AZM's deprecated `registerCare*` API aliases are compatibility names only; new Debug80 configuration should use `registerContracts*`.

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
| `cartridgeHex`    | `string`         | —                                   | Path to a cartridge image HEX file                                                                                                         |
| `updateMs`        | `number`         | `16`                                | UI refresh interval in milliseconds                                                                                                        |
| `yieldMs`         | `number`         | `0`                                 | Yield to the event loop every N ms                                                                                                         |
| `expansionBankHi` | `boolean`        | `false`                             | Enable A14 expansion banking via SYSCTRL bit 6                                                                                             |
| `matrixMode`      | `boolean`        | `false`                             | Initial MON-3 Matrix CONFIG state; the TEC-1G webview normally drives and reasserts this from Matrix Keyboard accordion visibility         |
| `protectOnReset`  | `boolean`        | `false`                             | Write-protect ROM ranges on cold reset                                                                                                     |
| `rtcEnabled`      | `boolean`        | `false`                             | Emulate the DS1302 real-time clock                                                                                                         |
| `sdEnabled`       | `boolean`        | `false`                             | Emulate the SPI SD card interface                                                                                                          |
| `sdImagePath`     | `string`         | —                                   | Path to the SD card image file                                                                                                             |
| `sdHighCapacity`  | `boolean`        | `true`                              | SD card operates in SDHC mode                                                                                                              |
| `gimpSignal`      | `boolean`        | `false`                             | Enable GIMP signal simulation for hardware diagnostics                                                                                     |
| `uiVisibility`    | `object`         | all visible                         | Legacy per-panel visibility flags retained for old configs; the current TEC-1G UI keeps core hardware sections visible and uses accordions |

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
