[Appendices](README.md)

# Appendix B — Platform Configuration Reference

All configuration lives in `debug80.json` (or the `debug80` key of `package.json`). Top-level fields apply to every session. Platform-specific fields live inside a block keyed by the platform name.

---

## Top-level launch fields

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `platform` | `string` | `'simple'` | Platform to emulate: `'simple'`, `'tec1'`, or `'tec1g'` |
| `asm` | `string` | — | Path to the main Z80 assembly source file |
| `sourceFile` | `string` | — | Alias for `asm` |
| `assembler` | `string` | `'asm80'` | Assembler backend identifier |
| `hex` | `string` | derived | Path to the output Intel HEX file; derived from `asm` if omitted |
| `listing` | `string` | derived | Path to the listing file; derived from `asm` if omitted |
| `outputDir` | `string` | asm dir | Directory for build artifacts |
| `artifactBase` | `string` | asm filename | Base name for `.hex` / `.lst` files |
| `entry` | `number` | platform default | CPU entry address; overrides the platform block's `entry` |
| `stopOnEntry` | `boolean` | `false` | Pause at the entry point before executing |
| `projectConfig` | `string` | — | Explicit path to `debug80.json` or `package.json` |
| `target` | `string` | — | Named build target (for multi-target projects) |
| `assemble` | `boolean` | `true` | Run the assembler before starting the session |
| `sourceRoots` | `string[]` | `[]` | Directories to search when resolving source file paths |
| `stepOverMaxInstructions` | `number` | `0` | Instruction limit for step-over; `0` = unlimited |
| `stepOutMaxInstructions` | `number` | `0` | Instruction limit for step-out; `0` = unlimited |
| `diagnostics` | `boolean` | `false` | Emit verbose diagnostic messages to the debug console |

---

## Simple platform (`"platform": "simple"`)

Config block key: `simple`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `regions` | `MemoryRegion[]` | 2 KB ROM + 62 KB RAM | Memory layout; each region has `start`, `end`, `kind` (`'rom'`\|`'ram'`) |
| `entry` | `number` | first ROM start | CPU program counter at session start |
| `appStart` | `number` | `0x0900` | Application start address (used by assembler directives) |
| `binFrom` | `number` | — | Start address for binary output |
| `binTo` | `number` | — | End address for binary output |
| `extraListings` | `string[]` | — | Additional listing files for symbol resolution |

---

## TEC-1 platform (`"platform": "tec1"`)

Config block key: `tec1`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `regions` | `MemoryRegion[]` | 4 KB ROM + 60 KB RAM | Memory layout |
| `entry` | `number` | first ROM start | CPU entry address |
| `appStart` | `number` | `0x1200` | Application start address |
| `romHex` | `string` | — | Path to TEC-1 ROM HEX file (monitor) |
| `ramInitHex` | `string` | — | Path to a HEX file loaded into RAM at startup |
| `updateMs` | `number` | `16` | UI refresh interval in milliseconds |
| `yieldMs` | `number` | `0` | Yield to the event loop every N ms; `0` = no yield |
| `extraListings` | `string[]` | — | Additional listing files |

---

## TEC-1G platform (`"platform": "tec1g"`)

Config block key: `tec1g`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `regions` | `MemoryRegion[]` | 16 KB ROM0 + 16 KB RAM + 32 KB ROM1 | Memory layout |
| `entry` | `number` | `0x8000` | CPU entry address (ROM1 entry) |
| `appStart` | `number` | `0x4200` | Application start address |
| `romHex` | `string` | — | Path to TEC-1G ROM HEX file |
| `ramInitHex` | `string` | — | Path to a HEX file loaded into RAM at startup |
| `cartridgeHex` | `string` | — | Path to a cartridge image HEX file |
| `updateMs` | `number` | `16` | UI refresh interval in milliseconds |
| `yieldMs` | `number` | `0` | Yield to the event loop every N ms |
| `expansionBankHi` | `boolean` | `false` | Enable A14 expansion banking via SYSCTRL bit 6 |
| `matrixMode` | `boolean` | `false` | Start with matrix keyboard input enabled |
| `protectOnReset` | `boolean` | `false` | Write-protect ROM ranges on cold reset |
| `rtcEnabled` | `boolean` | `false` | Emulate the DS1302 real-time clock |
| `sdEnabled` | `boolean` | `false` | Emulate the SPI SD card interface |
| `sdImagePath` | `string` | — | Path to the SD card image file |
| `sdHighCapacity` | `boolean` | `true` | SD card operates in SDHC mode |
| `gimpSignal` | `boolean` | `false` | Enable GIMP signal simulation for hardware diagnostics |
| `extraListings` | `string[]` | — | Additional listing files |
| `uiVisibility` | `object` | all visible | Per-panel visibility flags: `lcd`, `display`, `keypad`, `matrix`, `matrixKeyboard`, `glcd`, `serial` |

---

## Memory region shape

Regions are listed in order. The adapter assigns `romRanges` from any region with `kind: 'rom'`. Writes to ROM ranges are silently ignored.

```json
{
  "regions": [
    { "start": 0,      "end": 16383, "kind": "rom" },
    { "start": 16384,  "end": 65535, "kind": "ram" }
  ]
}
```

---

[Appendices](README.md)
