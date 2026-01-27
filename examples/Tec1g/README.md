# TEC-1G Serial Echo Example

This example is a simple 4800-8-N-2 serial echo loop for MON-3 systems.
It assumes the TEC-1G runs in FAST mode (4 MHz) and bit-bangs serial on
PORTSCAN bit 6, with RX on bit 7 of KEYBUF.

## Run
1) Open `examples/Tec1g` as a workspace.
2) If you have a MON-3 ROM image, add it to `.vscode/debug80.json` under `tec1g.romHex`.
3) Start "Debug (TEC-1G MON-3 + Serial Echo)".

## Notes
- The program is assembled at 0x4000.
- RX uses `IN 0x00` bit 7 (idle high), matching Debug80's MON-3 serial mirror.
