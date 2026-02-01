# TEC-1G Emulation Completeness Review

Date: 2026-02-01
Schematic: TEC-1G_Schematic_v1-21.pdf (KiCad 8.0.8, Board revision: Production v1.21)

## Methodology

This review compares every TEC-1G hardware feature against the actual runtime implementation in `src/platforms/tec1g/runtime.ts`, `src/platforms/tec1g/sysctrl.ts`, `src/debug/adapter.ts`, and `src/debug/tec1g-shadow.ts`. Bit-level assignments are now confirmed from the v1.21 schematic.

Each feature is rated:
- **Complete** — Faithfully emulated, no known gaps
- **Mostly complete** — Core behavior works, minor gaps remain
- **Partial** — Some functionality present, significant gaps
- **Stub** — Port is handled but returns dummy values / logs only
- **Missing** — Not implemented at all

---

## Hardware reference (from schematic v1.21)

### I/O port decode

Two 74HCT138 decoders (U3 and U12) decode the full port space from address lines A0-A2, qualified by IORQ and additional address matching.

**U3 — lower ports (0x00–0x07):**

| Output | Port | Net label | Function |
|--------|------|-----------|----------|
| O0 | 0x00 | ~{KEYB}-0 | Keypad read (74C923 output + serial RX on bit 7) |
| O1 | 0x01 | ~{DIGITS}-1 | Digit select + speaker (bit 7) + serial TX (bit 6) |
| O2 | 0x02 | ~{SEGS}-2 | Seven-segment data latch |
| O3 | 0x03 | ~{SIMP}-3 | System input (74HCT245 U19 read) |
| O4 | 0x04 | ~{LCD}-4 | LCD instruction (write) / status (read); 0x84 = LCD data |
| O5 | 0x05 | ~{8X8}-05 | 8x8 LED matrix row select |
| O6 | 0x06 | ~{8X8}-06 | 8x8 LED matrix column data |
| O7 | 0x07 | ~{GLCD}-07 | GLCD instruction (write) / status (read); 0x87 = GLCD data |

**U12 — upper ports (0xF8–0xFF):**

| Output | Port | Net label | Function |
|--------|------|-----------|----------|
| O0 | 0xF8 | ~{PORT}-F8 | Unassigned (exposed on IOBus J6) |
| O1 | 0xF9 | ~{PORT}-F9 | Unassigned (exposed on IOBus J6 + TEC Expander J3) |
| O2 | 0xFA | ~{PORT}-FA | Unassigned (exposed on IOBus J6) |
| O3 | 0xFB | ~{PORT}-FB | Unassigned (exposed on GPI/O J10) |
| O4 | 0xFC | ~{PORT}-FC | RTC DS1302 (external via GPI/O J10) |
| O5 | 0xFD | ~{SDIO}-FD | SD card SPI (external via GPI/O J10) |
| O6 | 0xFE | ~{MATRIX}-FE | Matrix keyboard input (74HCT688 U4 address compare) |
| O7 | 0xFF | ~{SYS}-FF | System latch write (74HCT373 U18) |

### System latch — U18 (74HCT373), port 0xFF write

The latch is clocked on write to port 0xFF. Directly confirmed from schematic net labels:

| Bit | Net label | Function | Notes |
|-----|-----------|----------|-------|
| 0 | ~{SHADOW} | Shadow ROM enable | **Active low**: 0 = shadow on, 1 = shadow off |
| 1 | PROTECT | Write protection | 1 = protect 0x4000–0x7FFF |
| 2 | EXPAND | Expansion enable | 1 = expansion window active at 0x8000–0xBFFF |
| 3 | FF-D3 | Expansion bank / reserved | Routes to E_A14 on expansion socket (bank select) |
| 4 | FF-D4 | Reserved | Directly connected to expansion connectors / memory bus |
| 5 | CAPS | Caps lock | Used by matrix keyboard mode |
| 6 | FF-D5 | Reserved | Directly connected to expansion connectors |
| 7 | FF-D6 | Reserved | Directly connected to expansion connectors |

**Key finding:** Bit 3 (FF-D3) connects to E_A14 on the expansion memory socket U9. This is the bank select line — it drives A14 of the expansion device, selecting which 16K half of a 32K chip is visible at 0x8000–0xBFFF. Bit 5 is confirmed as CAPS.

### System input — U19 (74HCT245 A→B), port 0x03 read

The 245 is direction A→B, reading external signals onto the data bus. From schematic trace-back:

| Bit | Signal | Source | Notes |
|-----|--------|--------|-------|
| 0 | SKEY | Shift key state | From keypad / function key detection |
| 1 | PROTECT | System latch bit 1 | Directly fed back from U18 output |
| 2 | EXPAND | System latch bit 2 | Directly fed back from U18 output |
| 3 | CART | Cartridge flag | From expansion connector — active when cartridge inserted |
| 4 | RKEY | Raw key detection | Directly from keypad encoder hardware |
| 5 | GIMP | G.IMP header (J8) | External breakpoint / diagnostic signal |
| 6 | KDA | Key Data Available | From 74C923 (U15) DA pin — **inverted**: 1 = no key waiting |
| 7 | RX | Serial receive | From FTDI module (J5) — idle high |

### Memory architecture

- **U8** (62256): 32K static RAM, covers 0x0000–0x7FFF
- **U7** (27C512): 64K EPROM, top 16K mapped to 0xC000–0xFFFF. ROM select switches (SW5A/B) choose which 16K bank of the 64K EPROM is active (allowing multiple monitor ROMs)
- **U9**: Expansion ROM/RAM socket at 0x8000–0xBFFF. Jumpers JP6-JP8 configure 24/28-pin device. A14 driven by E_A14 (system latch bit 3) for bank selection
- **Shadow logic**: When shadow latch is active (bit 0 = 0) AND upper address lines A11–A15 are all low (address < 0x0800), the ROM chip select is asserted, overlaying ROM onto low 2K. Writes still go to RAM

### Matrix keyboard — J4 connector + U4 (74HCT688)

- J4 exposes: D0–D7, A8–A15, CAPS, RSET, GND, +5V
- U4 (74HCT688) is an 8-bit comparator that matches the high address byte (A8–A15) against a pattern to generate the port 0xFE select
- The scan works by the Z80 placing different values on A8–A15 (via the high byte of the port address in `IN A,(C)`) while reading port 0xFE — each high-byte value selects a different keyboard row
- CONFIG DIP switch 1 selects between 74C923 keypad mode and Matrix keyboard mode

### Keypad encoder — U15 (MM74C923)

- 20-key encoder with debounce
- DA (Data Available) output drives NMI (directly, active high → active low via inverter)
- Key data on pins A–E (5 bits) read via port 0x00
- KBM pin (pin 7) directly connected — keyboard mode select

### Speaker

- Port 0x01 bit 7 → through transistor Q8 (BC547) → speaker SP1
- R17 (100R) series resistor
- Volume control: VR3 (10K pot) or JP2 "Groundwalker SILENCE!" jumper

### LCD — LCD2004 connector

- Standard HD44780 parallel interface
- directly on port 0x04 / 0x84, accent RS line distinguishes instruction vs data (accent derived from A7 on the port address)
- R/W line from Z80 RD signal distinguishes read vs write
- Accent C8 (22pF) optional filter for display corruption

### GLCD

- Not a dedicated on-board component — connects via I/O bus (J6) or expansion
- Port 0x07 / 0x87 directly decoded by U3 output O7

### RTC + SD card

- **Both are external add-ons** connected via the GPI/O connector (J10)
- J10 exposes: ~{P}-FC (port 0xFC), ~{P}-SD/~{SDIO}-FD (port 0xFD), ~{P}-FB (port 0xFB), plus D0–D7, TX, RX, WR, RD, RSET, +5V, GND
- These are NOT on the main TEC-1G board — they are optional peripherals

### CONFIG DIP switch (DIP1)

| Switch | Function | Position 1 | Position 2 |
|--------|----------|-----------|-----------|
| 1 | Keyboard mode | 74C923 (hex keypad) | Matrix keyboard |
| 2 | Protect on reset | OFF | ON |
| 3 | Expansion bank | LO (E_A14=0) | HI (E_A14=1) |

### Speed control

Three mutually exclusive options (choose one):
1. Manual switch SW2 (FAST/SLOW) + mini pot VR1 (500K)
2. Manual switch + radio pot (SW13 "Radio GaGa" + R32)
3. Analog switch U20 (MAX4544) + radio pot — **do NOT install SW2 and U20 simultaneously**

Clock: 4MHz crystal (X1), fed through 4049 inverter chain (U1) with speed control circuit.

### Power

- 9V DC tip-positive via BJ1, or battery via J11
- L7805 voltage regulator with heatsink HS1
- DS1233 (PM1) reset supervisor — generates clean RESET on power-up

---

## Feature-by-feature assessment

### 1. Memory mapping and banking

| Feature | Status | Notes |
|---------|--------|-------|
| Shadow ROM (0xC000→0x0000, low 2K) | **Complete** | Bit 0 of port 0xFF; read aliasing + ROM copy in adapter.ts and tec1g-shadow.ts |
| Shadow address decode (A11–A15 all low) | **Complete** | Only low 2K is shadowed, matching schematic logic |
| Write protection (0x4000–0x7FFF) | **Complete** | Bit 1 of port 0xFF; write blocking in adapter.ts |
| Expansion window enable (0x8000–0xBFFF) | **Complete** | Bit 2 of port 0xFF |
| Expansion bank select via E_A14 | **Missing** | Schematic confirms bit 3 of port 0xFF drives A14 of expansion socket. Currently not decoded — only one bank exists in emulation |
| ROM select switches (SW5A/B for monitor selection) | **N/A** | Not relevant to emulation — user provides ROM hex directly |

### 2. Seven-segment display (6 digits, FND560)

| Feature | Status | Notes |
|---------|--------|-------|
| Digit select (port 0x01, bits 0–5, one-hot) | **Complete** | Via `updateDisplayDigits`. Schematic confirms 6x FND560 common-cathode driven by Q9–Q15 (BC557 PNP) |
| Segment data latch (port 0x02, U16 74HCT273) | **Complete** | Full segment mapping confirmed |
| Multiplexed scanning | **Complete** | Digit/segment latch model matches hardware |

### 3. Speaker

| Feature | Status | Notes |
|---------|--------|-------|
| Toggle output (port 0x01, bit 7) | **Complete** | Schematic: bit 7 → Q8 (BC547) → SP1. Volume via VR3/JP2 |
| Frequency estimation | **Complete** | Cycle-accurate via `calculateSpeakerFrequency` |
| Silence timeout | **Complete** | 2-second inactivity timer via CycleClock |

### 4. 8x8 LED matrix (output)

| Feature | Status | Notes |
|---------|--------|-------|
| Row select (port 0x05, U13 74HCT273) | **Complete** | `updateMatrixRow` handler |
| Column data (port 0x06) | **Complete** | Latched via `matrixLatch` state |

### 5. Keypad (hex + function keys)

| Feature | Status | Notes |
|---------|--------|-------|
| Key data on port 0x00 (bits 0–4 from U15 MM74C923) | **Complete** | `applyKey` sets keyValue |
| NMI on keypress (DA → NMI via inverter) | **Complete** | `nmiPending` flag checked in tick handler |
| Key hold timing | **Complete** | CycleClock-scheduled release |
| Serial RX on port 0x00 bit 7 | **Complete** | Confirmed: bit 7 = RX from FTDI, idle high |

### 6. Matrix keyboard (J4 + U4 74HCT688)

| Feature | Status | Notes |
|---------|--------|-------|
| Matrix scan via full 16-bit port address | **Missing** | Schematic confirms U4 (74HCT688) compares high address byte. IO read handler only uses low byte |
| Row select via A8–A15 | **Missing** | J4 exposes A8–A15, D0–D7, CAPS, RSET |
| CONFIG switch 1 (keypad vs matrix mode) | **Missing** | No matrix mode state in emulation |
| Keypad disable when matrix active | **Missing** | |
| Joystick input (J9) | **Missing** | J9 is a 9-pin joystick connector on the schematic |

### 7. Character LCD (HD44780, LCD2004 via J connector)

| Feature | Status | Notes |
|---------|--------|-------|
| Busy flag + address counter (IN 0x04) | **Complete** | `lcdReadStatus` returns busy bit + address |
| Data read (IN 0x84) | **Complete** | RS derived from A7 of port address, confirmed by schematic |
| Clear display (0x01) | **Complete** | |
| Return home (0x02) | **Complete** | |
| Set DDRAM address (bit 7 set) | **Complete** | 4-line address mapping matches LCD2004 |
| Data write (OUT 0x84) | **Complete** | |
| Busy timing (37µs / 1600µs clear) | **Complete** | |
| Entry mode set (0x04–0x07) | **Missing** | Instruction ignored |
| Display on/off control (0x08–0x0F) | **Missing** | No cursor or blink state for LCD |
| Cursor/display shift (0x10–0x1F) | **Missing** | |
| Function set (0x20–0x3F) | **Missing** | |
| CGRAM (8 custom characters) | **Missing** | No CGRAM storage |

**Assessment: Mostly complete** — the core read/write/busy workflow that MON-3 uses is solid.

### 8. Graphical LCD (ST7920)

| Feature | Status | Notes |
|---------|--------|-------|
| All basic + extended instructions | **Complete** | See previous detailed table |
| GDRAM read/write (128×64) | **Complete** | |
| DDRAM read/write (text mode) | **Complete** | |
| Busy flag + cycle-accurate timing | **Complete** | |
| Cursor blink timer (400ms) | **Complete** | |
| CGRAM | **Missing** | Rarely used on ST7920 |

**Assessment: Complete** for all practical purposes.

### 9. Serial (bitbang)

| Feature | Status | Notes |
|---------|--------|-------|
| TX decode (port 0x01, bit 6) | **Complete** | Schematic: bit 6 → FTDI J5 pin 4 (RX) |
| RX injection (port 0x00, bit 7) | **Complete** | Schematic: FTDI J5 pin 5 (TX) → bit 7 |
| 4800 baud, 8N2 | **Complete** | |
| FTDI loopback test | **Partial** | Port 0x03 bit 7 reflects injected RX, not actual TX loopback |

### 10. System latch — port 0xFF write (U18 74HCT373)

| Bit | Function | Status | Notes |
|-----|----------|--------|-------|
| 0 | ~{SHADOW} (active low) | **Complete** | Correctly inverted in `decodeSysCtrl` |
| 1 | PROTECT | **Complete** | |
| 2 | EXPAND | **Complete** | |
| 3 | FF-D3 → E_A14 (bank select) | **Missing** | Schematic confirms this drives A14 of expansion U9 |
| 4 | FF-D4 (reserved, to expansion bus) | **Missing** | Not decoded; exposed on bus connectors |
| 5 | CAPS (caps lock) | **Missing** | Not decoded; used by matrix keyboard mode |
| 6 | FF-D5 (reserved, to expansion bus) | **Missing** | Not decoded |
| 7 | FF-D6 (reserved, to expansion bus) | **Missing** | Not decoded |

**Current `decodeSysCtrl` only reads bits 0–2. Bits 3–7 are latched (raw value stored in `state.sysCtrl`) but not decoded or acted upon.**

### 11. System input — port 0x03 read (U19 74HCT245)

| Bit | Signal | Status | Notes |
|-----|--------|--------|-------|
| 0 | SKEY (shift key) | **Missing** | Not emulated; returns 0 |
| 1 | PROTECT | **Complete** | |
| 2 | EXPAND | **Complete** | |
| 3 | CART (cartridge present) | **Bug** | Currently mirrors EXPAND (sets 0x08 when expand enabled). Schematic confirms this is a separate CART signal from expansion connector |
| 4 | RKEY (raw key detection) | **Missing** | Not emulated |
| 5 | GIMP (G.IMP header J8) | **Missing** | External diagnostic signal, not emulated |
| 6 | KDA (key data available, inverted) | **Complete** | 1 = no key. Matches 74C923 DA behavior |
| 7 | RX (serial receive, idle high) | **Complete** | |

**Bug confirmed:** The current code at runtime.ts:618–621 sets bit 3 (0x08) based on `expandEnabled`. The schematic shows bit 3 is CART (cartridge), not expand. This should be a separate flag.

### 12. RTC (DS1302) — port 0xFC

| Feature | Status | Notes |
|---------|--------|-------|
| All features | **Missing** | External add-on via GPI/O (J10). Port 0xFC writes logged only, reads return 0xFF |

Schematic confirms: RTC is NOT on the main board. It connects through J10 pin ~{P}-FC.

### 13. SD card SPI — port 0xFD

| Feature | Status | Notes |
|---------|--------|-------|
| All features | **Missing** | External add-on via GPI/O (J10). Port 0xFD writes logged only, reads return 0xFF |

Schematic confirms: SD card is NOT on the main board. It connects through J10 pin ~{P}-SD.

### 14. Cartridge

| Feature | Status | Notes |
|---------|--------|-------|
| CART flag on port 0x03 bit 3 | **Bug** | Incorrectly mirrors expand |
| Cartridge ROM mapping | **Missing** | |
| Cartridge boot behavior | **Missing** | |

### 15. Status LEDs (BAR1)

| Feature | Status | Notes |
|---------|--------|-------|
| System latch status LEDs | **Missing** | BAR1 is a 10-segment LED bar showing latch states, HALT, speaker. L2=SPKR, L3=HALT visible on schematic |
| Disco LEDs (Fullisik under mechanical keys) | **N/A** | Physical board feature only |

### 16. Expansion connectors

| Feature | Status | Notes |
|---------|--------|-------|
| Z80Bus female socket (J2) | **N/A** | Physical expansion; signals available on bus |
| Z80Bus vertical socket for TEC Deck (J1) | **N/A** | Physical expansion |
| TEC Expander socket (J3) | **N/A** | 20-pin expander with CLK, INT, WR, WAIT, data, port selects |
| IOBus (J6) | **N/A** | 10-pin I/O bus |
| MEMBus (J7) | **N/A** | Memory bus expansion |
| GPI/O (J10) | **N/A** | General purpose I/O (carries RTC/SD port selects) |
| Probe (J15) | **N/A** | Logic probe connector |

### 17. CONFIG DIP switch

| Switch | Status | Notes |
|--------|--------|-------|
| 1: Keyboard mode (74C923 / Matrix) | **Missing** | Always in 74C923 mode |
| 2: Protect on reset (OFF / ON) | **Missing** | Protect always starts OFF |
| 3: Expansion bank (LO / HI) | **Missing** | No bank select |

### 18. Joystick (J9)

| Feature | Status | Notes |
|---------|--------|-------|
| 9-pin joystick connector | **Missing** | J9 on schematic; no emulation |

---

## Summary scorecard

| Feature | Priority | Status | Completeness |
|---------|----------|--------|-------------|
| Seven-segment display | High | **Complete** | 100% |
| Speaker | High | **Complete** | 100% |
| Keypad + NMI | High | **Complete** | 100% |
| Shadow ROM | High | **Complete** | 100% |
| Write protection | High | **Complete** | 100% |
| Serial TX/RX | High | **Complete** | 95% |
| GLCD (ST7920) | High | **Complete** | 95% |
| LED matrix output | Medium | **Complete** | 100% |
| Character LCD (HD44780) | High | **Mostly complete** | 75% |
| Expansion window | Medium | **Partial** | 60% (enable works, bank select missing) |
| SYS_CTRL latch (port 0xFF) | Medium | **Partial** | 37% (3 of 8 bits decoded) |
| SYS_INPUT register (port 0x03) | Medium | **Partial** | 50% (bit 3 bug, bits 0/4/5 missing) |
| Matrix keyboard | Medium | **Missing** | 0% |
| CONFIG DIP switch | Low | **Missing** | 0% |
| RTC (DS1302) | Low | **Missing** | 0% (external add-on) |
| SD card SPI | Low | **Missing** | 0% (external add-on) |
| Cartridge | Low | **Missing** | 0% |
| Joystick | Low | **Missing** | 0% |
| Status LED bar | Low | **Missing** | 0% |

---

## Bugs found

1. **Port 0x03 bit 3 mirrors EXPAND instead of CART** — [runtime.ts:618-621](src/platforms/tec1g/runtime.ts#L618-L621). The schematic confirms bit 3 is CART (cartridge present), a distinct signal from the expansion connector. Current code sets bit 3 when `expandEnabled` is true. Fix: bit 3 should be a separate `cartridgePresent` flag (default false).

---

## Stale documentation

- `src/platforms/tec1g/README.md` lines 16–17 state GLCD and LCD busy-flag are "not yet emulated." Both are now implemented.
- `src/platforms/tec1g/README.md` line 47 says `IN 0x04` returns 0x00 — it actually returns busy flag + address counter.

---

## Implementation plan

### Phase 1 — Fix bugs and stale docs (no risk)

**Goal:** Correct the port 0x03 bit 3 bug and bring docs up to date.

1. Fix port 0x03 bit 3: remove the `value |= 0x08` line from the expand block. Add a separate `cartridgePresent` config flag (default false) that sets bit 3 when true.
2. Update `src/platforms/tec1g/README.md`:
   - Mark GLCD (text + graphics + busy flag) as implemented
   - Mark LCD busy flag as implemented
   - Add confirmed SYS_CTRL bit map (all 8 bits from schematic)
   - Add confirmed SYS_INPUT bit map (all 8 bits from schematic)
3. Update `docs/tec1g-emulation-plan.md` to reference this review and note schematic is now available.
4. Add unit tests verifying port 0x03 bit assignments match schematic.

### Phase 2 — SYS_CTRL full decode + expansion bank select

**Goal:** Decode all 8 bits of port 0xFF and enable bank switching.

1. Expand `decodeSysCtrl` to decode all 8 bits:
   - Bit 3: `bankSelect` (E_A14 — selects which 16K half of expansion device)
   - Bit 4: `ffD4` (reserved, stored for expansion bus)
   - Bit 5: `capsLock`
   - Bit 6: `ffD5` (reserved)
   - Bit 7: `ffD6` (reserved)
2. Maintain two 16K banks in memory (32K total for expansion window).
3. On port 0xFF write, if bit 3 changes, swap which bank is visible at 0x8000–0xBFFF.
4. Update adapter.ts memory handling to support bank swap.
5. Add unit tests for bank switching.

### Phase 3 — SYS_INPUT completeness

**Goal:** Make port 0x03 return correct values for all 8 bits.

1. Bit 0 (SKEY): Add shift-key state tracking — set when function key modifier is active.
2. Bit 3 (CART): Already fixed in Phase 1.
3. Bit 4 (RKEY): Add raw key detection — set when any key is physically pressed (before 74C923 processing).
4. Bit 5 (GIMP): Add configurable GIMP flag (default 0; could be tied to Debug80's breakpoint system).
5. Add CONFIG DIP switch state as a config option (keyboard mode, protect-on-reset, expansion bank default).
6. Add unit tests for all 8 bits.

### Phase 4 — HD44780 LCD instruction completeness

**Goal:** Bring LCD from 75% to ~95%.

1. Entry mode set (0x04–0x07): increment/decrement direction, display shift.
2. Display on/off control (0x08–0x0F): display enable, cursor, blink.
3. Cursor/display shift (0x10–0x1F).
4. Function set (0x20–0x3F): acknowledge and store state (8-bit mode, 2-line, 5×8 font — the only configuration that matters for LCD2004).
5. Optional: CGRAM storage (64 bytes for 8 custom characters).
6. Unit tests for each instruction.

### Phase 5 — Matrix keyboard input

**Goal:** Enable QWERTY/mechanical keyboard support.

1. Change IO read handler to accept full 16-bit port address (currently `port & 0xff`).
2. For port 0xFE: use high byte (A8–A15) as row select, return column state for that row.
3. Add key mapping tables matching MON-3's matrixScan expectations.
4. Implement CONFIG switch 1 behavior: when matrix mode active, disable hex keypad (except RESET).
5. Add CAPS (bit 5 of SYS_CTRL) integration with matrix keyboard.
6. Add UI mechanism to send matrix key events.
7. Unit tests for matrix scan behavior with various row addresses.

### Phase 6 — RTC (DS1302) on port 0xFC

**Goal:** Enable MON-3 RTC features and DIAG test.

Note: This is an external add-on via GPI/O (J10), not on the main board.

1. Implement DS1302 bit-bang protocol state machine:
   - CS on bit 4, CLK on bit 6, bidirectional data line.
   - Command byte parsing (read/write, register/RAM select).
2. Time registers sourced from host system clock.
3. 31-byte PRAM with read/write.
4. Add configurable "RTC present" flag that influences add-on detection.
5. Unit tests for protocol and register access.

### Phase 7 — SD card SPI on port 0xFD

**Goal:** Enable basic SD card detection and DIAG test.

Note: This is an external add-on via GPI/O (J10), not on the main board.

1. Minimal SPI state machine: MOSI bit 0, CLK bit 1, CS mask.
2. CMD0 + CMD8 responses for card detection.
3. Optional: CMD17 block read for data loading programs.
4. Add configurable "SD present" flag.
5. Unit tests.

### Phase 8 — Cartridge support

**Goal:** Enable cartridge ROM boot and mapping.

1. Add cartridge ROM hex config option.
2. Map cartridge into expansion address space.
3. Set CART flag (port 0x03 bit 3) when cartridge configured.
4. Implement cartridge boot detection.
5. Unit tests.

---

## Port mirrors (confirmed working)

Ports 0x80–0x87 mirror ports 0x00–0x07 with A7 high, used to distinguish instruction vs data for LCD and GLCD:

| Port | Mirror of | Function |
|------|-----------|----------|
| 0x84 | 0x04 | LCD data (RS=1) vs LCD instruction (RS=0 on 0x04) |
| 0x87 | 0x07 | GLCD data (RS=1) vs GLCD instruction (RS=0 on 0x07) |

These are correctly handled in the emulation.

---

## SD card and RTC pin assignment discrepancy

The older `TEC1G_EMULATION_STATUS.md` document lists different pin assignments than the schematic and `src/platforms/tec1g/README.md`. The schematic is authoritative:

**RTC (DS1302) — port 0xFC (from schematic / DIAG source):**
- CS on bit 4, CLK on bit 6, data line bidirectional
- (STATUS doc incorrectly says: CE=bit 2, CLK=bit 0, I/O=bit 1)

**SD card SPI — port 0xFD (from schematic / DIAG source):**
- MOSI on bit 0, CLK on bit 1, CS mask per DIAG
- (STATUS doc incorrectly says: CS=bit 7, CLK=bit 0, MOSI=bit 1, MISO=bit 6)

**The STATUS doc pin assignments should not be used for implementation.**

---

## Inaccuracies in TEC1G_EMULATION_STATUS.md

The following claims in `docs/TEC1G_EMULATION_STATUS.md` are incorrect based on code inspection:

1. **LCD CGRAM** — claimed ✅ COMPLETE, actually **missing**. No CGRAM storage exists in runtime.ts.
2. **LCD entry mode** — claimed ✅ COMPLETE, actually **missing**. Entry mode instruction (0x04–0x07) is ignored.
3. **LCD display shift** — claimed ✅ COMPLETE, actually **missing**. Cursor/display shift (0x10–0x1F) is ignored.
4. **LCD display on/off** — claimed ✅ COMPLETE, actually **missing**. Display on/off instruction (0x08–0x0F) is ignored.
5. **Port 03 bit 5 = KDA** — STATUS doc says bit 5 is KDA. Schematic confirms bit 6 = KDA, bit 5 = GIMP.
6. **SD/RTC pin assignments** — see section above.
7. **Port FF bits 3–7 "spare/unused"** — claimed available. Schematic confirms bit 3 = E_A14 (bank select), bit 5 = CAPS.

This document should be either updated or superseded by this review.

---

## UI panel status

Current UI sections (from `src/platforms/tec1g/ui-panel-html-markup.ts`):

| Section | Default visibility |
|---------|--------------------|
| LCD | Shown |
| 7-SEG | Shown |
| KEYPAD | Shown |
| 8x8 MATRIX | Hidden |
| GLCD | Hidden |
| SERIAL | Shown |

Proposed additions for future phases:
- **System status indicators** — SHADOW/PROTECT/EXPAND/CAPS latch states (Phase 2/3)
- **Matrix keyboard UI** — virtual QWERTY grid or PC keyboard mapping (Phase 5)
- **RTC display** — current emulated time when RTC add-on enabled (Phase 6)
- **SD card status** — mounted/activity indicator when SD add-on enabled (Phase 7)

---

## Existing test coverage

| Component | Test file | Status |
|-----------|-----------|--------|
| System control (sysctrl) | `tests/platforms/tec1g/sysctrl.test.ts` | Exists |
| UI panel HTML | `tests/platforms/tec1g/ui-panel-html.test.ts` | Exists |
| UI panel memory | `tests/platforms/tec1g/ui-panel-memory.test.ts` | Exists |
| UI panel messages | `tests/platforms/tec1g/ui-panel-messages.test.ts` | Exists |
| Shadow ROM | `tests/debug/tec1g-shadow.test.ts` | Exists |
| LCD HD44780 commands | — | **Missing** |
| GLCD ST7920 commands | — | **Missing** |
| Serial bitbang timing | — | **Missing** |
| Port 0x03 bit assignments | — | **Missing** |
| Memory banking combinations | — | **Missing** |

---

## Open questions

1. **MON-3 build differences:** Are there behavioral differences between MON-3 v1.4, v1.5, and BC24-15 that affect emulation?
2. **SYS_INPUT latch vs combinational:** The schematic shows U19 (74HCT245) as a buffer, not a latch. Current code synthesizes values on-read, which should be correct. However, if MON-3 timing is sensitive to read-during-transition, a latched model might be needed. This should be validated against real hardware behavior.
3. **Expansion beyond 32K:** The schematic notes mention "Memory Expansion of 512k with ease" via the expansion connectors. The current 2-bank (32K) model covers the on-board socket; larger expansions via TEC Deck are a separate concern.

---

## Blocking dependencies

- **Schematic:** ✅ Now available (v1.21). All bit assignments confirmed.
- **MON-3 ROM source:** Available at referenced path.
- **DIAG ROM source:** Referenced in platform README; useful for SD/RTC/matrix verification.

---

## Testing strategy

Each phase should include:
1. Unit tests for new IO behaviors (port read/write at bit level)
2. Regression tests ensuring existing emulation is not broken
3. Where applicable, integration tests against MON-3 routines:
   - LCD busy polling loop
   - GLCD terminal routines
   - Matrix scan + ASCII conversion
   - RTC presence + PRAM read/write
   - SD card idle command sequence
