# TEC-1G Expansion Memory Handoff

This note describes the Debug80 TEC-1G expansion-memory model for downstream
TECM8 work.

## Hardware Interpretation

Debug80 now treats the TEC-1G expansion window as a decoded legacy/extended
banking system, not as a flat bank number.

The visible CPU window is always:

```text
0x8000-0xBFFF
```

`SYS_CTRL` bit 2 is `EXPAND`. When it is clear, the expansion window is not
active and the base memory image is visible. When it is set, reads and writes in
the window are routed through the decoded expansion bank.

`SYS_CTRL` bits 3-6 are the four-bit memory expansion field:

```text
bit 3  legacy E_A14 / memory expansion bit 0
bit 4  memory expansion bit 1
bit 5  memory expansion bit 2
bit 6  memory expansion bit 3
```

Debug80 decodes these bits as:

```text
upper selector = bits 4-6
legacy page    = bit 3
```

If `upper selector == 0`, Debug80 preserves the original TEC-1G expand behavior:

```text
legacy page 0 -> physical expansion bank 0
legacy page 1 -> physical expansion bank 1
```

If `upper selector` is `1-7`, Debug80 selects one of seven additional 16K
windows:

```text
upper selector 1 -> extended window 0 -> physical expansion bank 2
upper selector 2 -> extended window 1 -> physical expansion bank 3
upper selector 3 -> extended window 2 -> physical expansion bank 4
upper selector 4 -> extended window 3 -> physical expansion bank 5
upper selector 5 -> extended window 4 -> physical expansion bank 6
upper selector 6 -> extended window 5 -> physical expansion bank 7
upper selector 7 -> extended window 6 -> physical expansion bank 8
```

In extended mode, bit 3 is still latched and exposed in Debug80 state, but it
does not select a different physical extended window. The upper selector owns
the extended-window selection.

## Current Debug80 Backing Image

Debug80 currently supports nine 16K physical expansion banks:

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

The maximum image size accepted by the current ROM-artifact validation is:

```text
9 * 0x4000 = 0x24000 = 147456 bytes
```

## Source-Backed Expansion ROM Artifacts

Debug80 treats a single 16K bank as the canonical source-debug unit. For an
expansion source bank:

```text
windowAddress = 0x8000
windowSize    = 0x4000
bankSize      = 0x4000
```

The source output is limited to `0x8000-0xBFFF`. For a multibank expansion
artifact, each bank is assembled independently, padded to 16K, and then packed
into the configured runtime image. The packed image is a loading/programming
container; the per-bank D8 maps remain the source-debug identity.

This prevents a source file from pretending that banked code is a single linear
address range. TECM8 multibank source work should declare banks explicitly, with
each bank assembled for the visible origin `0x8000`.

Example shape:

```json
{
  "id": "tecm8-expansion",
  "role": "expansion",
  "outputBin": "build/roms/tec1g/tecm8/expansion/expansion-144k.bin",
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
    }
  ]
}
```

## Debug State Fields

`decodeSysCtrl()` exposes both the raw field and the decoded model:

```text
memoryExpansionBankBits
memoryExpansionBankValue
memoryExpansionMode
memoryExpansionLegacyBank
memoryExpansionExtendedWindow
memoryExpansionPhysicalBank
```

Use `memoryExpansionPhysicalBank` for the actual backing-bank index.

## TECM8 Guidance

TECM8 should not treat the expansion image as a flat linear ROM. It should treat
the system as:

```text
two legacy 16K expand pages
plus seven additional decoded 16K expansion windows
```

The next TECM8 design step is to decide ownership and behavior for the extended
windows:

```text
EPROM programmer
cartridge window(s)
RAM windows
shadowed RAM/ROM overlays
```

Debug80 does not yet model per-bank roles, read-only ROM banks, cartridge
presence overlays, or EPROM programmer semantics. Those should be designed as
explicit bank metadata rather than inferred from the binary image alone.
