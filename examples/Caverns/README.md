# HelloWorld (debug80 sample)

Z80 sample wired for the debug80 extension. The adapter runs asm80 for you and debugs against the generated `build/main.lst`.

## Files
- `src/constants.asm`, `macros.asm`, `system.asm` — tiny ROM layer and RST 10H service macros.
- `src/main.asm` — prints a greeting, then echoes input lines until you press Enter on an empty line.
- `.vscode/debug80.json` — target config (`src/main.asm` → `build/main`).
- `.vscode/launch.json` — “Debug (debug80)” launch config.

## Usage
1) Open `examples/HelloWorld` in VS Code with debug80 installed.
2) Press F5 and pick “Debug (debug80)”. The adapter assembles to `build/main.hex` + `build/main.lst`.
3) Set breakpoints in `build/main.lst` (not the `.asm`) and run. Use the Debug80 Terminal panel for input/output.
