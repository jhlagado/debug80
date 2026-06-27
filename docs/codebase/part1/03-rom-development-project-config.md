---
layout: default
title: 'Chapter 3 — ROM Development Project Config'
parent: 'Part I — Orientation'
grand_parent: 'Debug80 Engineering Manual'
nav_order: 3
---

[← Project Configuration](02-project-configuration.md) | [Part I](index.md) | [Part II →](../part2/index.md)

# Chapter 3 — ROM Development Project Config Tutorial

This tutorial explains the project-config options that matter when a Debug80
project is used for ROM work. It covers three common jobs:

- run with a ROM binary that already exists
- debug a ROM binary with a matching D8 source map
- develop ROM source in the project and let Debug80 build the ROM artifacts

The examples use TEC-1G because that is where monitor and expansion ROM
development is currently most explicit. The same general split still matters on
other platforms: a ROM binary tells the emulator what to load, while a D8 map
and source roots tell the debugger how to bind addresses back to source.

## The Two Questions

Every ROM setup answers two separate questions.

The first question is what the emulated machine should load:

```json
{
  "tec1g": {
    "romHex": "roms/tec1g/mon3/monitor.hex",
    "expansionRomHex": "roms/tec1g/tecm8/expansion.bin"
  }
}
```

The second question is where the debugger should find source-level debugging
data:

```json
{
  "sourceRoots": ["src", "roms/tec1g/mon3"],
  "debugMaps": ["roms/tec1g/mon3/monitor.d8.json"]
}
```

Those are deliberately separate. You can load a ROM binary without source-level
debugging. You can also keep a source map for a bundled or copied ROM without
actively developing that ROM.

ROM development adds a third question: which ROM sources should Debug80 build
before the session starts? That is what `tec1g.romArtifacts` is for.

## Build Controls

`assemble: false` disables normal app assembly. It does not disable active
source-backed `tec1g.romArtifacts`; explicit ROM artifacts are still assembled
before runtime creation so the emulator does not start with stale firmware.

Use `active: false` when you want to keep an artifact declaration in the config
without using it in the current launch:

```json
{
  "id": "future-expansion",
  "role": "expansion",
  "active": false,
  "binary": "roms/future-expansion.bin",
  "debugMap": "roms/future-expansion.d8.json",
  "windowAddress": 32768,
  "windowSize": 16384,
  "imageSize": 16384,
  "bankSize": 16384,
  "bankCount": 1
}
```

Active binary-only ROM artifacts are not part of the current launch path. If you
want to load a binary now, use `tec1g.romHex` or `tec1g.expansionRomHex`. If you
want Debug80 to build ROM source, use an active source-backed artifact.

## Recommended Project Shape

Use a structure that makes the ownership clear:

```text
debug80.json
src/
  main.asm
roms/
  tec1g/
    tecm8/
      monitor/
        monitor.asm
      expansion/
        bank0.asm
        bank1.asm
        bank2.asm
        ...
build/
  roms/
    tec1g/
      tecm8/
        monitor/
        expansion/
```

Use `src/` for normal app or demo code. Use `roms/` when the source belongs to
firmware that replaces or extends the platform. Build products should go under
`build/`, not beside the source, unless there is a specific reason to check them
in.

## Option 1: Use the Built-In or Profile ROM

Most normal application projects should not declare local ROM artifacts at all.
They should use the platform kit or profile ROM. In that model, Debug80 resolves
the bundled monitor ROM and its source map for you.

A simple target can stay focused on the app:

```json
{
  "projectVersion": 2,
  "projectPlatform": "tec1g",
  "defaultProfile": "mon3",
  "defaultTarget": "demo",
  "targets": {
    "demo": {
      "profile": "mon3",
      "sourceFile": "src/main.asm"
    }
  }
}
```

Use this for projects like games or demos where the monitor ROM is just part of
the machine. Do not copy ROM source into the project unless you want to shadow
or develop that ROM.

## Option 2: Load a Different ROM Binary

If you only want to try a different ROM binary, point the platform block at it.
This loads the ROM but does not build it.

```json
{
  "platform": "tec1g",
  "sourceFile": "src/main.asm",
  "tec1g": {
    "romHex": "roms/custom-monitor.hex",
    "entry": 0,
    "appStart": 16384
  }
}
```

For an expansion ROM binary:

```json
{
  "platform": "tec1g",
  "sourceFile": "src/main.asm",
  "tec1g": {
    "expansionRomHex": "roms/custom-expansion.bin"
  }
}
```

If you also have source-level debug data, add the D8 map and source root:

```json
{
  "sourceRoots": ["src", "roms/custom-monitor"],
  "debugMaps": ["roms/custom-monitor/custom-monitor.d8.json"],
  "tec1g": {
    "romHex": "roms/custom-monitor.hex"
  }
}
```

Use this when the ROM is an input to the project, not something the project is
responsible for building.

## Option 3: Develop a Replacement Monitor ROM

Use a source-backed `monitor` artifact when the project owns the monitor source.
Debug80 assembles the ROM artifact before runtime creation, loads the generated
binary as `tec1g.romHex`, and prepends the generated D8 map and source root so
breakpoints bind to the project ROM source.

```json
{
  "platform": "tec1g",
  "sourceFile": "src/main.asm",
  "tec1g": {
    "entry": 0,
    "appStart": 16384,
    "romArtifacts": [
      {
        "id": "custom-monitor",
        "role": "monitor",
        "sourceFile": "roms/tec1g/custom/monitor/monitor.asm",
        "outputBin": "build/roms/tec1g/custom/monitor/monitor.bin",
        "outputDebugMap": "build/roms/tec1g/custom/monitor/monitor.d8.json",
        "address": 49152,
        "size": 16384
      }
    ]
  }
}
```

Monitor artifacts must use:

```text
address = 0xC000
size    = 0x4000
```

AZM emits the matching HEX and D8 files from the `outputBin` artifact base, so
the `outputBin` path must end in `.bin`, and an explicit `outputDebugMap` must
match the same base name.

For example:

```text
outputBin       build/roms/monitor/monitor.bin
outputDebugMap  build/roms/monitor/monitor.d8.json
```

## Option 4: Develop a Single 16K Expansion ROM

Use a source-backed `expansion` artifact when the project owns one source file
for the visible expansion window.

```json
{
  "platform": "tec1g",
  "sourceFile": "src/main.asm",
  "tec1g": {
    "romArtifacts": [
      {
        "id": "custom-expansion",
        "role": "expansion",
        "sourceFile": "roms/tec1g/custom/expansion/expansion.asm",
        "outputBin": "build/roms/tec1g/custom/expansion/expansion.bin",
        "outputDebugMap": "build/roms/tec1g/custom/expansion/expansion.d8.json",
        "windowAddress": 32768,
        "windowSize": 16384,
        "imageSize": 16384,
        "bankSize": 16384,
        "bankCount": 1
      }
    ]
  }
}
```

Expansion source is assembled for the visible window:

```text
windowAddress = 0x8000
windowSize    = 0x4000
bankSize      = 0x4000
```

Use this when there is one 16K expansion image, or when you are experimenting
with a simple replacement binary in the `0x8000-0xBFFF` window.

## Option 5: Develop a Multibank Expansion ROM

Use a multibank expansion artifact when the source has separate bank files. This
is the model for the TEC-1G expansion scheme with two legacy 16K pages plus
seven extended 16K windows.

```json
{
  "platform": "tec1g",
  "sourceFile": "src/main.asm",
  "tec1g": {
    "romArtifacts": [
      {
        "id": "tecm8-expansion",
        "role": "expansion",
        "outputBin": "build/roms/tec1g/tecm8/expansion/debug80-runtime.bin",
        "windowAddress": 32768,
        "windowSize": 16384,
        "imageSize": 147456,
        "bankSize": 16384,
        "bankCount": 9,
        "banks": [
          {
            "physicalBank": 0,
            "sourceFile": "roms/tec1g/tecm8/expansion/bank0.asm",
            "outputBin": "build/roms/tec1g/tecm8/expansion/bank0.bin",
            "outputDebugMap": "build/roms/tec1g/tecm8/expansion/bank0.d8.json"
          },
          {
            "physicalBank": 1,
            "sourceFile": "roms/tec1g/tecm8/expansion/bank1.asm",
            "outputBin": "build/roms/tec1g/tecm8/expansion/bank1.bin",
            "outputDebugMap": "build/roms/tec1g/tecm8/expansion/bank1.d8.json"
          },
          {
            "physicalBank": 8,
            "sourceFile": "roms/tec1g/tecm8/expansion/bank8.asm",
            "outputBin": "build/roms/tec1g/tecm8/expansion/bank8.bin",
            "outputDebugMap": "build/roms/tec1g/tecm8/expansion/bank8.d8.json"
          }
        ]
      }
    ]
  }
}
```

Each bank source is assembled independently for `0x8000-0xBFFF` and padded to
16K. The top-level `outputBin` is the Debug80 runtime image. If you do not
declare `outputs`, Debug80 writes that runtime image using physical bank
offsets.

Physical bank numbers are:

```text
bank 0  legacy expand page 0
bank 1  legacy expand page 1
bank 2  extended window 0
bank 3  extended window 1
bank 4  extended window 2
bank 5  extended window 3
bank 6  extended window 4
bank 7  extended window 5
bank 8  extended window 6
```

## Output Recipes

`outputs` lets the source bank declarations stay canonical while artifact
production is configurable. This matters because the emulator needs a runtime
image, while hardware programming or release packaging might need a different
shape.

The runtime image should be physical-layout:

```json
{
  "id": "debug80-runtime",
  "kind": "packed",
  "layout": "physical",
  "outputBin": "build/roms/tec1g/tecm8/expansion/debug80-runtime.bin",
  "banks": [0, 1, 2, 3, 4, 5, 6, 7, 8]
}
```

Physical layout writes each bank at its physical offset:

```text
bank 0 -> offset 0x00000
bank 1 -> offset 0x04000
bank 8 -> offset 0x20000
```

A legacy 32K deliverable should be contiguous:

```json
{
  "id": "legacy-expansion-32k",
  "kind": "packed",
  "layout": "contiguous",
  "outputBin": "build/roms/tec1g/tecm8/expansion/legacy-expansion-32k.bin",
  "banks": [0, 1]
}
```

Contiguous layout writes the listed banks one after another:

```text
bank 0 -> offset 0x00000
bank 1 -> offset 0x04000
```

Per-bank output copies the padded bank binaries into a directory:

```json
{
  "id": "per-bank-reference",
  "kind": "perBank",
  "outputDir": "build/roms/tec1g/tecm8/expansion/banks",
  "banks": [0, 1, 2, 3, 4, 5, 6, 7, 8]
}
```

That produces files such as:

```text
build/roms/tec1g/tecm8/expansion/banks/bank0.bin
build/roms/tec1g/tecm8/expansion/banks/bank1.bin
build/roms/tec1g/tecm8/expansion/banks/bank8.bin
```

If a packed recipe writes the same path as the artifact's top-level
`outputBin`, it must use `layout: "physical"`. Debug80 rejects a contiguous
recipe at the runtime path because that would make bank numbers ambiguous at
load time.

## A Full ROM-First TEC-1G Example

This example develops a replacement monitor and a multibank expansion ROM, with
a normal app target kept only as a small demo or test harness.

```json
{
  "projectVersion": 2,
  "projectPlatform": "tec1g",
  "defaultTarget": "demo",
  "targets": {
    "demo": {
      "sourceFile": "src/main.asm",
      "platform": "tec1g"
    }
  },
  "tec1g": {
    "entry": 0,
    "appStart": 16384,
    "romArtifacts": [
      {
        "id": "tecm8-monitor",
        "role": "monitor",
        "sourceFile": "roms/tec1g/tecm8/monitor/monitor.asm",
        "outputBin": "build/roms/tec1g/tecm8/monitor/monitor.bin",
        "outputDebugMap": "build/roms/tec1g/tecm8/monitor/monitor.d8.json",
        "address": 49152,
        "size": 16384
      },
      {
        "id": "tecm8-expansion",
        "role": "expansion",
        "outputBin": "build/roms/tec1g/tecm8/expansion/debug80-runtime.bin",
        "windowAddress": 32768,
        "windowSize": 16384,
        "imageSize": 147456,
        "bankSize": 16384,
        "bankCount": 9,
        "banks": [
          {
            "physicalBank": 0,
            "sourceFile": "roms/tec1g/tecm8/expansion/bank0.asm",
            "outputBin": "build/roms/tec1g/tecm8/expansion/bank0.bin",
            "outputDebugMap": "build/roms/tec1g/tecm8/expansion/bank0.d8.json"
          },
          {
            "physicalBank": 1,
            "sourceFile": "roms/tec1g/tecm8/expansion/bank1.asm",
            "outputBin": "build/roms/tec1g/tecm8/expansion/bank1.bin",
            "outputDebugMap": "build/roms/tec1g/tecm8/expansion/bank1.d8.json"
          },
          {
            "physicalBank": 8,
            "sourceFile": "roms/tec1g/tecm8/expansion/bank8.asm",
            "outputBin": "build/roms/tec1g/tecm8/expansion/bank8.bin",
            "outputDebugMap": "build/roms/tec1g/tecm8/expansion/bank8.d8.json"
          }
        ],
        "outputs": [
          {
            "id": "debug80-runtime",
            "kind": "packed",
            "layout": "physical",
            "outputBin": "build/roms/tec1g/tecm8/expansion/debug80-runtime.bin",
            "banks": [0, 1, 8]
          },
          {
            "id": "legacy-expansion-32k",
            "kind": "packed",
            "layout": "contiguous",
            "outputBin": "build/roms/tec1g/tecm8/expansion/legacy-expansion-32k.bin",
            "banks": [0, 1]
          },
          {
            "id": "per-bank-reference",
            "kind": "perBank",
            "outputDir": "build/roms/tec1g/tecm8/expansion/banks",
            "banks": [0, 1, 8]
          }
        ]
      }
    ]
  }
}
```

This config does four things on launch:

1. Builds the monitor source and loads the generated monitor binary.
2. Builds each declared expansion bank source.
3. Writes the physical runtime expansion image for Debug80.
4. Adds the generated monitor and expansion D8 maps before the app map, so ROM
   source breakpoints bind to the project ROM source.

## Rebuild Behavior

ROM artifacts are built before runtime creation. In normal use, restart the
debug session after changing ROM source so Debug80 rebuilds the monitor or
expansion artifacts and recreates the platform runtime with the new ROM images.

The warm rebuild path is aimed at the active app artifact. It recompiles the app
source and reloads the program memory in the current session. It should not be
treated as the primary workflow for monitor or expansion ROM development.

## Choosing the Right Config

Use this decision table:

| Goal | Config option |
| ---- | ------------- |
| Use the standard bundled monitor | profile or platform kit, no local `romArtifacts` |
| Try a different monitor binary | `tec1g.romHex` |
| Try a different expansion binary | `tec1g.expansionRomHex` |
| Debug a binary with known source | `debugMaps` plus `sourceRoots` |
| Develop replacement MON-3-style monitor source | active `romArtifacts[]` entry with `role: "monitor"` |
| Develop one expansion source image | active source-backed `role: "expansion"` artifact |
| Develop banked expansion source | multibank `role: "expansion"` artifact with `banks[]` |
| Produce hardware/release ROM files | multibank `outputs[]` recipes |

## Common Mistakes

Do not put generated `.bin`, `.hex`, or `.d8.json` files in `roms/` unless you
intentionally want to track those build products. Put generated artifacts under
`build/`.

Do not use a contiguous packed output as the Debug80 runtime image. Runtime
images need physical layout so bank numbers are preserved.

Do not add `outputs` to a single-source artifact. Output recipes are only for
multibank expansion artifacts.

Do not expect `romHex` or `expansionRomHex` to build source. They load existing
ROM files. Use `romArtifacts` when the project owns the ROM source.

Do not rely on a source map alone to load a ROM. The emulator loads the binary
or HEX file; the D8 map only gives the debugger address-to-source information.

---

[Part I](index.md)
