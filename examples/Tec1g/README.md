# TEC-1G Example Programs

This folder now contains two small MON-3-oriented TEC-1G programs:

- `serial_echo.asm`: simple 4800-8-N-2 serial echo loop.
- `matrix_scan.asm`: simple 8x8 matrix scan demo that continuously refreshes
	each row with a delay between row-select writes.

## Run
1) Open `examples/Tec1g` as a workspace.
2) If you have a MON-3 ROM image, add it to `.vscode/debug80.json` under `tec1g.romHex`.
3) Start either:
	 - "Debug (TEC-1G MON-3 + Serial Echo)"
	 - "Debug (TEC-1G MON-3 + Matrix Scan)"

## Notes
- Both programs assemble at `0x4000`.
- `serial_echo.asm` uses `IN 0x00` bit 7 (idle high), matching Debug80's MON-3 serial mirror.
- `matrix_scan.asm` intentionally rescans the display instead of writing rows once.
	That makes it a better baseline for future scan-aware and RGB/persistence work.
