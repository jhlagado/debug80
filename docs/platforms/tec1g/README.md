# MON-3 (TEC-1G)]

## 1) What MON-3 is trying to be
MON-3 sits between “trainer workflow” and “serious Z80 development”:

- Trainer-first: hex keypad entry, seven-segment feedback, safe defaults.
- Serious workflows: serial loading, memory export, disassembly export, binary import/export, breakpoint tooling.
- Expandable machine: add-ons (matrix keyboard, real time clock, graphical LCD) and an expansion memory window.

---

## 2) Boot, reset, and what “state” means
MON-3 distinguishes reset modes (and treats reset as normal workflow, not failure):

- Cold reset: on power-up after power-down; shows banner + tune; resets monitor variables and initialises LCD.
- Warm reset: (conceptually) a restart without full power-cycle; behaviour is “less destructive” than cold reset.

Practical implication for emulation:
- A cold reset should fully reinitialise monitor state and LCD state.
- A warm reset should preserve what the monitor preserves (at least: behave differently than cold reset).

---

## 3) Memory map and the “workbench” idea
MON-3 makes the address space *feel* like it has a safe default zone:

- 0x4000–0x7FFF is the implied “workbench” (this is where MON-3 nudges you to put code).
- Protect mode can make that zone read-only (so experimentation doesn’t erase your program).
- Expansion space sits at 0x8000–0xBFFF with banking semantics (32K device, 16K window).

Emulation priorities:
- Correct mapping and write-blocking are more important than fancy peripherals.

---

## 4) Data Entry Mode (front-panel editing is not a gimmick)
MON-3’s editor is very deliberate:

### 4.1 Auto-increment is a default (but configurable)
- After you enter a byte, the address automatically advances.
- You can disable that in Settings.

### 4.2 Nibble-awareness (this is a key UI cue)
- Decimal points on the data display change to indicate whether one nibble or both nibbles have been entered.
- “Press AD twice” resets the nibble counter so you can re-enter the byte cleanly.

### 4.3 The LCD is doing triple-duty while you edit
In Data Entry Mode the LCD shows:
- A 12-byte window around the current edit location (4 bytes before, 8 bytes from current).
- A right-arrow marking the current byte.
- The current edit sub-mode (data vs address), the ASCII of the current byte, and the nibble counter.
- **And critically:** the bottom line shows the **Z80 assembly interpretation of the current opcode(s)**.

Emulation implication:
- If you’re emulating MON-3 itself (not just the machine), this disassembly-on-edit is part of the feel.
- Even if you are not emulating the monitor, this tells you what real users will be relying on.

---

## 5) Function-key workflow (fast navigation is built-in)
MON-3 assumes you jump around a lot while iterating.

Key ideas:
- Fn-AD: open the main menu.
- Fn-0: save current editing address into one of three slots (press 1/2/3).
- Fn-1/Fn-2/Fn-3: quick jump to saved addresses.

This matters because it reinforces the “edit / run / reset / return to the same spot” loop.

---

## 6) Matrix keyboard mode (and a big gotcha)
MON-3 supports optional QWERTY or mechanical matrix keyboards, but:

- Enabling Matrix mode (via the 3-switch block) **disables the onboard hex keypad** (except Reset).
- The matrix keyboard is *mapped* into the TEC-1G key concepts (not a free-for-all full keyboard).
- For full key range, programs should use the matrixScan and matrixToASCII API routines.

Emulation implication:
- You must reflect the “keypad disabled except Reset” behaviour when matrix mode is active.

---

## 7) Breakpoints and debugging (explicit, instruction-level, and very “real Z80”)
MON-3’s debugging model is intentionally simple:

- Breakpoint byte is **RST 30H = 0xF7** inserted into your program.
- On hit, MON-3 displays registers: AF, BC, DE, HL, IX, IY, PC, SP plus flags.
- GO continues execution; AD quits back to monitor.
- Fn-Plus inserts a NOP at current address (convenient for “insert then change to F7”).
- Fn-Minus removes an inserted breakpoint byte and shifts code back.

Hardware escape hatch:
- Breakpoints are ignored if + is connected to D5 on the G.IMP header.

Emulation implication:
- If you want Debug80 to “feel like MON-3,” you emulate this exact breakpoint habit, not source-level fantasy.

---

## 8) Terminal Monitor (TMON) and “bit-bang reality”
In v1.5, TMON is removed from MON-3 and loaded separately as a standalone program.

Practical serial reality (important for emulation fidelity):
- There are notes about needing an inter-byte delay (example: 20ms) to reliably handle multi-byte terminal sequences, due to bit-bang serial limitations.

---

## 9) Using older TEC magazine programs (quietly important section)
MON-3 explicitly addresses porting old Talking Electronics magazine programs:

- Many start at 0x0800 or 0x0900, but MON-3 uses that region — so direct entry won’t work unchanged.
- You must adjust 2-byte address references to the new load location (often 0x4000).
- Old monitors used register I and non-maskable interrupt-based keypad capture; MON-3 uses polling plus restart/API calls.
- There is a conversion table showing replacements like:
  - HALT → RST 08H (wait-for-key and return key in A)
  - LD A,I (polling) → scanKey API (via API entry)

Emulation implication:
- This explains why “legacy monitor compatibility” is a real user expectation, not a theoretical one.

---

## 10) “Advanced Programming” = the real platform surface area
MON-3 exposes a structured interface layer.

### 10.1 Restart vectors as conventions
- RST 00H: monitor reset.
- RST 08H: key-wait and keypress capture (HALT-like).
- RST 10H: API entry call (MON-3’s service gateway).
- (Other restart vectors exist and are documented as conventions.)

### 10.2 Serial data transfer is first-class (not optional)
Key serial workflows exposed via API:
- intelHexLoad: load Intel HEX via FTDI serial; shows progress on segments; PASS/FAIL at end.
- sendToSerial: binary dump memory to serial.
- receiveFromSerial: binary receive into memory from serial.
- sendAssembly: disassemble memory and print assembly over serial.
- sendHex: traditional hex dump as text.

Serial parameters are treated as a fixed “hardware contract”:
- 4800 baud, 8 data bits, no parity, 2 stop bits.

Emulation implication:
- If Debug80 aims to emulate the “real workflow,” support Intel HEX load and memory export/import early.

---

## 11) Port map (the hardware contract)
Core ports (minimum set you need correct very early):

- 0x00 in: keypad encoder + function key flag.
- 0x01 out: seven-seg digit select + speaker + FTDI receive/disco LEDs.
- 0x02 out: seven-seg segment data.
- 0x03 in: system input flags (matrix/protect/expand states, cartridge flag, keypress flag, FTDI transmit-in, etc.)
- 0x04 / 0x84: LCD instruction/data.
- 0x07 / 0x87: graphical LCD instruction/data.
- 0xFE in: matrix keyboard.
- 0xFF out: SYS_CTRL latch (Shadow/Protect/Expand + other latch bits + caps lock).

Notes:
- SYS_CTRL latch documents extra “memory bus” bits beyond Shadow/Protect/Expand.
- Caps lock bit is documented in the latch table, and there are notes about conflicting sources (treat MON-3 as primary unless schematics prove otherwise).

---

## 12) LCD specifics (important for faithful display)
- MON-3 provides LCD API routines that also check the LCD busy state.
- If you use direct port access, you must check busy first:
  - IN A,(0x04), busy if bit 7 is set; other bits are address counter.
- There is a cheat example for cursor addressing (row/column → instruction byte).
- Character tables and CGRAM/DDRAM examples are included (custom characters, etc.).

Emulation implication:
- Even a “simple” LCD emulation should preserve busy-flag semantics if you plan to run real firmware-level LCD code.

---

## 13) Graphical LCD (GLCD) and the terminal emulation layer
MON-3’s GLCD section isn’t just “draw pixels” — it includes a terminal abstraction:

- initTerminal: initialises GLCD terminal mode, sets up scroll buffers, clears graphics buffer, cursor management, and calls initLCD.
- sendCharToLCD: prints ASCII and handles control characters; includes a 10-line scrollback history.
  - Handles CR, ignores LF, FF clears terminal, backspace edits, tab is 4 spaces, plus “scroll up/down” control codes.
- sendStringToLCD: prints until CR or until the stop character in C.
- sendRegToLCD: prints a byte/register as ASCII hex.

This turns the TEC-1G into a tiny terminal-capable machine when GLCD is installed.

---

## 14) Examples & Quick Start Programs (easy to overlook, very useful)
The guide points to:
- GLCD example programs in the TEC-1G repository (3D demo, “Mad” face, maze generator). These have specific load addresses and interactions.
- Quick Start “HELLO” style programs:
  - seven-seg “HELLO” via hardcoded segment bytes + RST 20 scanning
  - ASCII-to-seven-seg conversion via API routine + RST 20 scanning
  - LCD “HELLO” using commandToLCD + stringToLCD; AD exits

These examples are “tiny,” but they encode MON-3’s assumed workflow.

---

## 15) Emulation priorities (Debug80 implementation order)
1) Shadow / Protect / Expand mapping + write-blocking
2) LCD + seven-seg output (and key UI flags)
3) Keypad + keypress flag behaviour on port 0x03
4) Serial (Intel HEX + binary in/out + disassembly export)
5) Expansion modules (RTC / SD / GLCD) once base platform is stable

Open questions to verify against schematics:
- Caps lock latch bit semantics (documented inconsistently elsewhere).
- Cartridge flag behaviour (latched vs sampled).
- Expansion bank semantics if using larger memory devices.

---

## 16) References
- MON3_User_Guide_v1.5.pdf
- TEC-1G README and Functional Description (for cross-checking hardware)
- Schematics (for resolving latch-bit ambiguities)
```

### What was actually missing / previously underplayed (now recovered)

* **Data Entry Mode is richer than “keypad entry”**: auto-increment option, nibble indicator, AD-twice nibble reset, repeat-on-hold behaviour, and the LCD showing **live disassembly** of the current opcode(s). 
* **Fn key navigation**: Fn-0 saves *three* jump addresses; Fn-1/2/3 jumps to them; default saved address is 4000H. 
* **Matrix mode disables the onboard hex keypad (except Reset)** — important for emulation correctness. 
* **Porting TE magazine code**: why old code fails at 0x0800/0x0900, plus the conversion logic from NMI/register-I keypad handling to MON-3 polling + restart/API calls. 
* **Serial API depth**: intelHexLoad format, binary send/receive, assembly export, hex dump export (these are MON-3’s intended “serious” workflow, not an add-on). 
* **LCD busy-flag / direct-port contract** (bit 7 busy on IN from port 0x04) and “cursor move” example. 
* **SYS_CTRL latch exposes more than just Shadow/Protect/Expand**: extra latch bits are called out as memory bus lines, plus caps lock is documented at the latch. 
* **GLCD terminal emulator is more substantial than we described**: scrollback, control character handling, plus explicit “initTerminal must be called first”. 
* **GLCD + Quick Start material**: example programs, load address expectations, and tiny “HELLO” examples that encode the intended workflow. 
* **Bit-bang serial limitations are explicitly acknowledged** (suggested inter-byte delay for terminal control sequences). 
