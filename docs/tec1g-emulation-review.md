# TEC-1G Emulation Completeness Review

Date: 2026-02-01
Schematic: TEC-1G_Schematic_v1-21.pdf (KiCad 8.0.8, Board revision: Production v1.21)

## Methodology

This review compares every TEC-1G hardware feature against the actual runtime implementation in
`src/platforms/tec1g/runtime.ts`, `src/platforms/tec1g/sysctrl.ts`, `src/debug/adapter.ts`, and
`src/debug/tec1g-shadow.ts`. Bit-level assignments are now confirmed from the v1.21 schematic.

Each feature is rated:

- **Complete** — Faithfully emulated, no known gaps
- **Mostly complete** — Core behavior works, minor gaps remain
- **Partial** — Some functionality present, significant gaps
- **Stub** — Port is handled but returns dummy values / logs only
- **Missing** — Not implemented at all

---

## Hardware reference (from schematic v1.21)

### I/O port decode

Two 74HCT138 decoders (U3 and U12) decode the full port space from address lines A0-A2, qualified by IORQ and
additional address matching.

**U3 — lower ports (0x00-0x07):**

| Output         | Signal      | Description                                                |
| -------------- | ----------- | ---------------------------------------------------------- |
| O0 (port 0x00) | ~{KEYB}-0   | Keypad read (74C923 output + serial RX on bit 7)           |
| O1 (port 0x01) | ~{DIGITS}-1 | Digit select + speaker (bit 7) + serial TX (bit 6)         |
| O2 (port 0x02) | ~{SEGS}-2   | Seven-segment data latch                                   |
| O3 (port 0x03) | ~{SIMP}-3   | System input (74HCT245 U19 read)                           |
| O4 (port 0x04) | ~{LCD}-4    | LCD instruction (write) / status (read); 0x84 = LCD data   |
| O5 (port 0x05) | ~{8X8}-05   | 8x8 LED matrix row select                                  |
| O6 (port 0x06) | ~{8X8}-06   | 8x8 LED matrix column data                                 |
| O7 (port 0x07) | ~{GLCD}-07  | GLCD instruction (write) / status (read); 0x87 = GLCD data |

**U12 — upper ports (0xF8-0xFF):**

| Output         | Signal       | Description                                         |
| -------------- | ------------ | --------------------------------------------------- |
| O0 (port 0xF8) | ~{PORT}-F8   | Unassigned (exposed on IOBus J6)                    |
| O1 (port 0xF9) | ~{PORT}-F9   | Unassigned (exposed on IOBus J6 + TEC Expander J3)  |
| O2 (port 0xFA) | ~{PORT}-FA   | Unassigned (exposed on IOBus J6)                    |
| O3 (port 0xFB) | ~{PORT}-FB   | Unassigned (exposed on GPI/O J10)                   |
| O4 (port 0xFC) | ~{PORT}-FC   | RTC DS1302 (external via GPI/O J10)                 |
| O5 (port 0xFD) | ~{SDIO}-FD   | SD card SPI (external via GPI/O J10)                |
| O6 (port 0xFE) | ~{MATRIX}-FE | Matrix keyboard input (74HCT688 U4 address compare) |
| O7 (port 0xFF) | ~{SYS}-FF    | System latch write (74HCT373 U18)                   |

### System latch — U18 (74HCT373), port 0xFF write

The latch is clocked on write to port 0xFF. Directly confirmed from schematic net labels:

| Bit   | Signal    | Description                                                                  |
| ----- | --------- | ---------------------------------------------------------------------------- |
| Bit 0 | ~{SHADOW} | Shadow ROM enable. **Active low**: 0 = shadow on, 1 = shadow off             |
| Bit 1 | PROTECT   | Write protection. 1 = protect 0x4000-0x7FFF                                  |
| Bit 2 | EXPAND    | Expansion enable. 1 = expansion window active at 0x8000-0xBFFF               |
| Bit 3 | FF-D3     | Expansion bank / reserved. Routes to E_A14 on expansion socket (bank select) |
| Bit 4 | FF-D4     | Reserved. Directly connected to expansion connectors / memory bus            |
| Bit 5 | CAPS      | Caps lock. Used by matrix keyboard mode                                      |
| Bit 6 | FF-D5     | Reserved. Directly connected to expansion connectors                         |
| Bit 7 | FF-D6     | Reserved. Directly connected to expansion connectors                         |

**Key finding:** Bit 3 (FF-D3) connects to E_A14 on the expansion memory socket U9. This is the bank select line —
it drives A14 of the expansion device, selecting which 16K half of a 32K chip is visible at 0x8000-0xBFFF. Bit 5 is
confirmed as CAPS.

### System input — U19 (74HCT245 A->B), port 0x03 read

The 245 is direction A->B, reading external signals onto the data bus. From schematic trace-back:

| Bit   | Signal  | Description                                                                     |
| ----- | ------- | ------------------------------------------------------------------------------- |
| Bit 0 | SKEY    | Shift key state. From keypad / function key detection                           |
| Bit 1 | PROTECT | System latch bit 1. Directly fed back from U18 output                           |
| Bit 2 | EXPAND  | System latch bit 2. Directly fed back from U18 output                           |
| Bit 3 | CART    | Cartridge flag. From expansion connector — active when cartridge inserted       |
| Bit 4 | RKEY    | Raw key detection. Directly from keypad encoder hardware                        |
| Bit 5 | GIMP    | G.IMP header (J8). External breakpoint / diagnostic signal                      |
| Bit 6 | KDA     | Key Data Available. From 74C923 (U15) DA pin — **inverted**: 1 = no key waiting |
| Bit 7 | RX      | Serial receive. From FTDI module (J5) — idle high                               |

### Memory architecture

- **U8** (62256): 32K static RAM, covers 0x0000-0x7FFF
- **U7** (27C512): 64K EPROM, top 16K mapped to 0xC000-0xFFFF. ROM select switches (SW5A/B) choose which 16K bank
  of the 64K EPROM is active (allowing multiple monitor ROMs)
- **U9**: Expansion ROM/RAM socket at 0x8000-0xBFFF. Jumpers JP6-JP8 configure 24/28-pin device. A14 driven by
  E_A14 (system latch bit 3) for bank selection
- **Shadow logic**: When shadow latch is active (bit 0 = 0) AND upper address lines A11-A15 are all low
  (address < 0x0800), the ROM chip select is asserted, overlaying ROM onto low 2K. Writes still go to RAM

### Matrix keyboard — J4 connector + U4 (74HCT688)

- J4 exposes: D0-D7, A8-A15, CAPS, RSET, GND, +5V
- U4 (74HCT688) is an 8-bit comparator that matches the high address byte (A8-A15) against a pattern to generate
  the port 0xFE select
- The scan works by the Z80 placing different values on A8-A15 (via the high byte of the port address in
  `IN A,(C)`) while reading port 0xFE — each high-byte value selects a different keyboard row
- CONFIG DIP switch 1 selects between 74C923 keypad mode and Matrix keyboard mode

### Keypad encoder — U15 (MM74C923)

- 20-key encoder with debounce
- DA (Data Available) output drives NMI (directly, active high -> active low via inverter)
- Key data on pins A-E (5 bits) read via port 0x00
- KBM pin (pin 7) directly connected — keyboard mode select

### Speaker

- Port 0x01 bit 7 -> through transistor Q8 (BC547) -> speaker SP1
- R17 (100R) series resistor
- Volume control: VR3 (10K pot) or JP2 "Groundwalker SILENCE!" jumper

### LCD — LCD2004 connector

- Standard HD44780 parallel interface
- directly on port 0x04 / 0x84, accent RS line distinguishes instruction vs data (accent derived from A7 on the
  port address)
- R/W line from Z80 RD signal distinguishes read vs write
- Accent C8 (22pF) optional filter for display corruption

### GLCD

- Not a dedicated on-board component — connects via I/O bus (J6) or expansion
- Port 0x07 / 0x87 directly decoded by U3 output O7

### RTC + SD card

- **Both are external add-ons** connected via the GPI/O connector (J10)
- J10 exposes: ~{P}-FC (port 0xFC), ~{P}-SD/~{SDIO}-FD (port 0xFD), ~{P}-FB (port 0xFB), plus D0-D7, TX, RX, WR,
  RD, RSET, +5V, GND
- These are NOT on the main TEC-1G board — they are optional peripherals

### CONFIG DIP switch (DIP1)

| Switch   | Function         | Description                                                  |
| -------- | ---------------- | ------------------------------------------------------------ |
| Switch 1 | Keyboard mode    | Position 1: 74C923 (hex keypad). Position 2: Matrix keyboard |
| Switch 2 | Protect on reset | Position 1: OFF. Position 2: ON                              |
| Switch 3 | Expansion bank   | Position 1: LO (E_A14=0). Position 2: HI (E_A14=1)           |

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

Shadow ROM (0xC000->0x0000, low 2K) — **Complete**
:   Bit 0 of port 0xFF; read aliasing + ROM copy in adapter.ts
    and tec1g-shadow.ts

Shadow address decode (A11-A15 all low) — **Complete**
:   Only low 2K is shadowed, matching schematic logic

Write protection (0x4000-0x7FFF) — **Complete**
:   Bit 1 of port 0xFF; write blocking in adapter.ts

Expansion window enable (0x8000-0xBFFF) — **Complete**
:   Bit 2 of port 0xFF

Expansion bank select via E_A14 — **Missing**
:   Schematic confirms bit 3 of port 0xFF drives A14 of expansion
    socket. Currently not decoded — only one bank exists in
    emulation

ROM select switches (SW5A/B) — **N/A**
:   Not relevant to emulation — user provides ROM hex directly

### 2. Seven-segment display (6 digits, FND560)

Digit select (port 0x01, bits 0-5, one-hot) — **Complete**
:   Via `updateDisplayDigits`. Schematic confirms 6x FND560
    common-cathode driven by Q9-Q15 (BC557 PNP)

Segment data latch (port 0x02, U16 74HCT273) — **Complete**
:   Full segment mapping confirmed

Multiplexed scanning — **Complete**
:   Digit/segment latch model matches hardware

### 3. Speaker

| Feature                          | Rating       | Notes                                                     |
| -------------------------------- | ------------ | --------------------------------------------------------- |
| Toggle output (port 0x01, bit 7) | **Complete** | Schematic: bit 7 -> Q8 (BC547) -> SP1. Volume via VR3/JP2 |
| Frequency estimation             | **Complete** | Cycle-accurate via `calculateSpeakerFrequency`            |
| Silence timeout                  | **Complete** | 2-second inactivity timer via CycleClock                  |

### 4. 8x8 LED matrix (output)

| Feature                              | Rating       | Notes                           |
| ------------------------------------ | ------------ | ------------------------------- |
| Row select (port 0x05, U13 74HCT273) | **Complete** | `updateMatrixRow` handler       |
| Column data (port 0x06)              | **Complete** | Latched via `matrixLatch` state |

### 5. Keypad (hex + function keys)

| Feature                                        | Rating       | Notes                                      |
| ---------------------------------------------- | ------------ | ------------------------------------------ |
| Key data on port 0x00 (bits 0-4, U15 MM74C923) | **Complete** | `applyKey` sets keyValue                   |
| NMI on keypress (DA -> NMI via inverter)       | **Complete** | `nmiPending` flag checked in tick handler  |
| Key hold timing                                | **Complete** | CycleClock-scheduled release               |
| Serial RX on port 0x00 bit 7                   | **Complete** | Confirmed: bit 7 = RX from FTDI, idle high |

### 6. Matrix keyboard (J4 + U4 74HCT688)

Matrix scan via full 16-bit port address — **Missing**
:   Schematic confirms U4 (74HCT688) compares high address byte.
    IO read handler only uses low byte

Row select via A8-A15 — **Missing**
:   J4 exposes A8-A15, D0-D7, CAPS, RSET

CONFIG switch 1 (keypad vs matrix mode) — **Missing**
:   No matrix mode state in emulation

Keypad disable when matrix active — **Missing**

Joystick input (J9) — **Missing**
:   J9 is a 9-pin joystick connector on the schematic

### 7. Character LCD (HD44780, LCD2004 via J connector)

| Feature                               | Rating       | Notes                                                      |
| ------------------------------------- | ------------ | ---------------------------------------------------------- |
| Busy flag + address counter (IN 0x04) | **Complete** | `lcdReadStatus` returns busy bit + address                 |
| Data read (IN 0x84)                   | **Complete** | RS derived from A7 of port address, confirmed by schematic |
| Clear display (0x01)                  | **Complete** |                                                            |
| Return home (0x02)                    | **Complete** |                                                            |
| Set DDRAM address (bit 7 set)         | **Complete** | 4-line address mapping matches LCD2004                     |
| Data write (OUT 0x84)                 | **Complete** |                                                            |
| Busy timing (37us / 1600us clear)     | **Complete** |                                                            |
| Entry mode set (0x04-0x07)            | **Missing**  | Instruction ignored                                        |
| Display on/off control (0x08-0x0F)    | **Missing**  | No cursor or blink state for LCD                           |
| Cursor/display shift (0x10-0x1F)      | **Missing**  |                                                            |
| Function set (0x20-0x3F)              | **Missing**  |                                                            |
| CGRAM (8 custom characters)           | **Missing**  | No CGRAM storage                                           |

**Assessment: Mostly complete** — the core read/write/busy workflow that MON-3 uses is solid.

### 8. Graphical LCD (ST7920)

| Feature                           | Rating       | Notes                       |
| --------------------------------- | ------------ | --------------------------- |
| All basic + extended instructions | **Complete** | See previous detailed table |
| GDRAM read/write (128x64)         | **Complete** |                             |
| DDRAM read/write (text mode)      | **Complete** |                             |
| Busy flag + cycle-accurate timing | **Complete** |                             |
| Cursor blink timer (400ms)        | **Complete** |                             |
| CGRAM                             | **Missing**  | Rarely used on ST7920       |

**Assessment: Complete** for all practical purposes.

### 9. Serial (bitbang)

| Feature                         | Rating       | Notes                                                        |
| ------------------------------- | ------------ | ------------------------------------------------------------ |
| TX decode (port 0x01, bit 6)    | **Complete** | Schematic: bit 6 -> FTDI J5 pin 4 (RX)                       |
| RX injection (port 0x00, bit 7) | **Complete** | Schematic: FTDI J5 pin 5 (TX) -> bit 7                       |
| 4800 baud, 8N2                  | **Complete** |                                                              |
| FTDI loopback test              | **Partial**  | Port 0x03 bit 7 reflects injected RX, not actual TX loopback |

### 10. System latch — port 0xFF write (U18 74HCT373)

| Feature                                    | Rating       | Notes                                              |
| ------------------------------------------ | ------------ | -------------------------------------------------- |
| Bit 0 — ~{SHADOW} (active low)             | **Complete** | Correctly inverted in `decodeSysCtrl`              |
| Bit 1 — PROTECT                            | **Complete** |                                                    |
| Bit 2 — EXPAND                             | **Complete** |                                                    |
| Bit 3 — FF-D3 -> E_A14 (bank select)       | **Missing**  | Schematic confirms this drives A14 of expansion U9 |
| Bit 4 — FF-D4 (reserved, to expansion bus) | **Missing**  | Not decoded; exposed on bus connectors             |
| Bit 5 — CAPS (caps lock)                   | **Missing**  | Not decoded; used by matrix keyboard mode          |
| Bit 6 — FF-D5 (reserved, to expansion bus) | **Missing**  | Not decoded                                        |
| Bit 7 — FF-D6 (reserved, to expansion bus) | **Missing**  | Not decoded                                        |

**Current `decodeSysCtrl` only reads bits 0-2. Bits 3-7 are latched (raw value stored in `state.sysCtrl`) but not
decoded or acted upon.**

### 11. System input — port 0x03 read (U19 74HCT245)

Bit 0 — SKEY (shift key) — **Missing**
:   Not emulated; returns 0

Bit 1 — PROTECT — **Complete**

Bit 2 — EXPAND — **Complete**

Bit 3 — CART (cartridge present) — **Bug**
:   Currently mirrors EXPAND (sets 0x08 when expand enabled).
    Schematic confirms this is a separate CART signal from
    expansion connector

Bit 4 — RKEY (raw key detection) — **Missing**
:   Not emulated

Bit 5 — GIMP (G.IMP header J8) — **Missing**
:   External diagnostic signal, not emulated

Bit 6 — KDA (key data available, inverted) — **Complete**
:   1 = no key. Matches 74C923 DA behavior

Bit 7 — RX (serial receive, idle high) — **Complete**

**Bug confirmed:** The current code at runtime.ts:618-621 sets bit 3 (0x08) based on `expandEnabled`. The schematic
shows bit 3 is CART (cartridge), not expand. This should be a separate flag.

### 12. RTC (DS1302) — port 0xFC

All features — **Missing**
: External add-on via GPI/O (J10). Port 0xFC writes logged only, reads return 0xFF

Schematic confirms: RTC is NOT on the main board. It connects through J10 pin ~{P}-FC.

### 13. SD card SPI — port 0xFD

All features — **Missing**
: External add-on via GPI/O (J10). Port 0xFD writes logged only, reads return 0xFF

Schematic confirms: SD card is NOT on the main board. It connects through J10 pin ~{P}-SD.

### 14. Cartridge

| Feature                      | Rating      | Notes                      |
| ---------------------------- | ----------- | -------------------------- |
| CART flag on port 0x03 bit 3 | **Bug**     | Incorrectly mirrors expand |
| Cartridge ROM mapping        | **Missing** |                            |
| Cartridge boot behavior      | **Missing** |                            |

### 15. Status LEDs (BAR1)

System latch status LEDs — **Missing**
:   BAR1 is a 10-segment LED bar showing latch states, HALT,
    speaker. L2=SPKR, L3=HALT visible on schematic

Disco LEDs (Fullisik under mechanical keys) — **N/A**
:   Physical board feature only

### 16. Expansion connectors

| Feature                                  | Rating  | Notes                                                       |
| ---------------------------------------- | ------- | ----------------------------------------------------------- |
| Z80Bus female socket (J2)                | **N/A** | Physical expansion; signals available on bus                |
| Z80Bus vertical socket for TEC Deck (J1) | **N/A** | Physical expansion                                          |
| TEC Expander socket (J3)                 | **N/A** | 20-pin expander with CLK, INT, WR, WAIT, data, port selects |
| IOBus (J6)                               | **N/A** | 10-pin I/O bus                                              |
| MEMBus (J7)                              | **N/A** | Memory bus expansion                                        |
| GPI/O (J10)                              | **N/A** | General purpose I/O (carries RTC/SD port selects)           |
| Probe (J15)                              | **N/A** | Logic probe connector                                       |

### 17. CONFIG DIP switch

| Feature                                   | Rating      | Notes                     |
| ----------------------------------------- | ----------- | ------------------------- |
| Switch 1: Keyboard mode (74C923 / Matrix) | **Missing** | Always in 74C923 mode     |
| Switch 2: Protect on reset (OFF / ON)     | **Missing** | Protect always starts OFF |
| Switch 3: Expansion bank (LO / HI)        | **Missing** | No bank select            |

### 18. Joystick (J9)

| Feature                  | Rating      | Notes                         |
| ------------------------ | ----------- | ----------------------------- |
| 9-pin joystick connector | **Missing** | J9 on schematic; no emulation |

---

## Summary scorecard

| Feature                   | Pri  | Status              | %    |
| ------------------------- | ---- | ------------------- | ---- |
| Seven-segment display     | High | **Complete**        | 100% |
| Speaker                   | High | **Complete**        | 100% |
| Keypad + NMI              | High | **Complete**        | 100% |
| Shadow ROM                | High | **Complete**        | 100% |
| Write protection          | High | **Complete**        | 100% |
| Serial TX/RX              | High | **Complete**        | 95%  |
| GLCD (ST7920)             | High | **Complete**        | 95%  |
| LED matrix output         | Med  | **Complete**        | 100% |
| Character LCD (HD44780)   | High | **Mostly complete** | 75%  |
| Expansion window          | Med  | **Partial**         | 60%  |
| SYS_CTRL latch (0xFF)     | Med  | **Partial**         | 37%  |
| SYS_INPUT register (0x03) | Med  | **Partial**         | 50%  |
| Matrix keyboard           | Med  | **Missing**         | 0%   |
| CONFIG DIP switch         | Low  | **Missing**         | 0%   |
| RTC (DS1302)              | Low  | **Missing**         | 0%   |
| SD card SPI               | Low  | **Missing**         | 0%   |
| Cartridge                 | Low  | **Missing**         | 0%   |
| Joystick                  | Low  | **Missing**         | 0%   |
| Status LED bar            | Low  | **Missing**         | 0%   |

Expansion window: enable works, bank select missing.
SYS_CTRL: 3 of 8 bits decoded.
SYS_INPUT: bit 3 bug, bits 0/4/5 missing.

---

## Bugs found

1. **Port 0x03 bit 3 mirrors EXPAND instead of CART** —
   [runtime.ts:618-621](src/platforms/tec1g/runtime.ts#L618-L621). The schematic confirms bit 3 is CART (cartridge
   present), a distinct signal from the expansion connector. Current code sets bit 3 when `expandEnabled` is true.
   Fix: bit 3 should be a separate `cartridgePresent` flag (default false).

---

## Stale documentation

- `src/platforms/tec1g/README.md` lines 16-17 state GLCD and LCD busy-flag are "not yet emulated." Both are now
  implemented.
- `src/platforms/tec1g/README.md` line 47 says `IN 0x04` returns 0x00 — it actually returns busy flag + address
  counter.

---

## Implementation plan

### Stage 1 — Bug fixes, docs, and register correctness

These tasks are independent and can be worked in parallel. No architectural risk.

#### 1A — Fix port 0x03 bit 3 bug

**Files:** `src/platforms/tec1g/runtime.ts`
**Effort:** Small
**Tasks:**

- [x] Remove the `value |= 0x08` line from the expand block in port 0x03 read handler (line ~618-621)
- [x] Add `cartridgePresent: boolean` to `Tec1gState` (default `false`)
- [x] Set bit 3 based on `state.cartridgePresent` instead of `expandEnabled`
- [x] Add unit test: port 0x03 bit 3 is 0 when no cartridge, 1 when cartridge present
- [x] Add unit test: port 0x03 bit 3 is independent of expand state

#### 1B — Update stale platform README

**Files:** `src/platforms/tec1g/README.md`
**Effort:** Small
**Tasks:**

- [x] Replace "Not yet emulated" list — mark GLCD (text + graphics + busy flag) as implemented
- [x] Mark LCD busy flag + data read as implemented
- [x] Correct `IN 0x04` description (returns busy flag + address counter, not 0x00)
- [x] Add full SYS_CTRL bit map (all 8 bits, from schematic section of this review)
- [x] Add full SYS_INPUT bit map (all 8 bits, from schematic section of this review)
- [x] Document stub ports: 0xFC (RTC), 0xFD (SD) return 0xFF
- [x] Note matrix keyboard 0xFE returns 0xFF (stub)

---

### Stage 2 — System register completeness

These tasks build the foundation for all later stages. 2A and 2B can be worked in parallel; 2C depends on both.

#### 2A — SYS_CTRL full 8-bit decode

**Files:** `src/platforms/tec1g/sysctrl.ts`, `src/platforms/tec1g/runtime.ts`
**Effort:** Small
**Depends on:** Nothing
**Tasks:**

- [x] Expand `Tec1gSysCtrlState` type to add: `bankSelect`, `capsLock`, `ffD4`, `ffD5`, `ffD6`
- [x] Update `decodeSysCtrl` to decode all 8 bits:
  - Bit 3: `bankSelect` (E_A14)
  - Bit 4: `ffD4` (reserved, pass-through)
  - Bit 5: `capsLock`
  - Bit 6: `ffD5` (reserved, pass-through)
  - Bit 7: `ffD6` (reserved, pass-through)
- [x] Store decoded values in `Tec1gState`
- [x] Update `sysctrl.test.ts` with tests for all 8 bits
- [x] Include `capsLock` and `bankSelect` in UI update payload (for future status display)

#### 2B — SYS_INPUT all 8 bits

**Files:** `src/platforms/tec1g/runtime.ts`
**Effort:** Small-Medium
**Depends on:** Stage 1A (cartridge fix)
**Tasks:**

- [x] Bit 0 (SKEY): Add `shiftKeyActive: boolean` to state; set when FN modifier is held
- [x] Bit 3 (CART): Already fixed in 1A — verify integration
- [x] Bit 4 (RKEY): Add raw key detection; set when `keyValue !== 0x7F` (key physically held)
- [x] Bit 5 (GIMP): Add `gimpEnabled: boolean` config option (default false)
- [x] Verify bits 1, 2, 6, 7 are already correct
- [x] Add unit tests for every bit of port 0x03 in isolation and combination

#### 2C — Expansion bank switching

**Files:** `src/platforms/tec1g/runtime.ts`, `src/debug/adapter.ts`
**Effort:** Medium
**Depends on:** Stage 2A (bankSelect decoded)
**Tasks:**

- [x] Allocate 32K expansion buffer (two 16K banks) instead of current 16K
- [x] On port 0xFF write: if `bankSelect` changes, swap which 16K bank is mapped at 0x8000-0xBFFF
- [x] Update `adapter.ts` memory read/write to route 0x8000-0xBFFF through bank index
- [x] Handle bank swap during debug memory view (show correct bank contents)
- [x] Add CONFIG DIP switch 3 (expansion default bank) as a config option
- [x] Unit tests: write to bank 0, switch to bank 1, write different data, switch back, verify both banks
- [x] Unit tests: verify bank select survives reset correctly (respects CONFIG default)

**Status:** Bank selection now switches between two 16K expansion banks using `bankA14`; hooks are centralized in
`src/debug/tec1g-memory.ts`. Remaining work is default-bank config, reset behavior, and memory view bank awareness.

---

### Stage 3 — HD44780 LCD instruction completeness

Self-contained stage. Can be worked independently of Stage 2. Each task below is a separate HD44780 instruction
group.

#### 3A — Entry mode set (0x04-0x07)

**Files:** `src/platforms/tec1g/runtime.ts`
**Effort:** Small
**Tasks:**

- [x] Add `lcdEntryIncrement: boolean` and `lcdEntryShift: boolean` to state (defaults: increment=true,
      shift=false)
- [x] Parse instruction: bit 1 = I/D (increment/decrement), bit 0 = S (shift)
- [x] Use `lcdEntryIncrement` in `lcdWriteData` and `lcdReadData` to control address direction
- [x] When shift enabled, shift entire display on each data write
- [x] Set busy timing (37us)
- [x] Unit tests: write sequence with decrement mode, verify addresses go backwards
- [x] Unit tests: write with shift enabled, verify display offset changes

#### 3B — Display on/off control (0x08-0x0F)

**Files:** `src/platforms/tec1g/runtime.ts`
**Effort:** Small
**Tasks:**

- [x] Add `lcdDisplayOn: boolean`, `lcdCursorOn: boolean`, `lcdCursorBlink: boolean` to state
- [x] Parse instruction: bit 2 = D (display), bit 1 = C (cursor), bit 0 = B (blink)
- [x] Include display/cursor/blink state in UI update payload
- [x] Update webview rendering to show/hide cursor based on state
- [x] Set busy timing (37us)
- [x] Unit tests: toggle display on/off, verify state; toggle cursor/blink

#### 3C — Cursor/display shift (0x10-0x1F)

**Files:** `src/platforms/tec1g/runtime.ts`
**Effort:** Small
**Tasks:**

- [x] Parse instruction: bit 3 = S/C (display shift vs cursor move), bit 2 = R/L (right vs left)
- [x] Display shift: adjust `lcdDisplayShift` offset (add to state)
- [x] Cursor move: adjust `lcdAddr` without writing data
- [x] Set busy timing (37us)
- [x] Unit tests: shift display left/right, verify offset; move cursor, verify address

#### 3D — Function set (0x20-0x3F)

**Files:** `src/platforms/tec1g/runtime.ts`
**Effort:** Small
**Tasks:**

- [x] Parse instruction: bit 4 = DL (data length), bit 3 = N (lines), bit 2 = F (font)
- [x] Store state but don't change behavior (LCD2004 is always 8-bit, 2-line, 5x8)
- [x] Set busy timing (37us)
- [x] Unit test: function set doesn't crash or corrupt state

#### 3E — CGRAM support (optional)

**Files:** `src/platforms/tec1g/runtime.ts`, `src/platforms/tec1g/ui-panel-html-script.ts`
**Effort:** Small-Medium
**Tasks:**

- [x] Add `lcdCgram: Uint8Array(64)` to state (8 characters x 8 bytes each)
- [x] Parse CGRAM address set instruction (0x40-0x7F): set CGRAM address
- [x] Route data writes to CGRAM when address is in CGRAM range
- [x] Route data reads from CGRAM when address is in CGRAM range
- [x] In UI rendering: for character codes 0x00-0x07, render from CGRAM instead of font ROM
- [x] Unit tests: write custom character, read it back, verify rendering lookup

---

### Stage 4 — Matrix keyboard

Larger feature requiring IO system changes and new UI. Can be worked independently of Stage 3.

#### 4A — 16-bit port address support

**Files:** `src/z80/runtime.ts` (or IO dispatch), `src/platforms/tec1g/runtime.ts`
**Effort:** Medium
**Depends on:** Nothing (but affects IO interface contract)
**Tasks:**

- [x] Audit IO handler interface — currently `read(port: number)` masks to 8 bits
- [x] Change IO read handler to pass full 16-bit port value (or at least preserve high byte)
- [x] Ensure all existing port handlers still work with `port & 0xFF` for backward compat
- [x] Verify TEC-1 platform is unaffected by the interface change
- [x] Verify Simple platform is unaffected
- [x] Unit tests: confirm port 0x04 still matches whether accessed as 0x04 or 0x0004

**Status:** IO handlers now preserve full port values while keeping low-byte compatibility; added unit coverage for
IN port address width and LCD status reads with a non-zero high byte.

#### 4B — Matrix scan state machine

**Files:** `src/platforms/tec1g/runtime.ts`
**Effort:** Medium
**Depends on:** Stage 4A
**Tasks:**

- [x] Add `matrixKeyStates: Uint8Array(16)` to state — 16 rows x 8 column bits each
- [x] On `IN 0xFE`: extract high byte (A8-A15) as row address; return `matrixKeyStates[row]`
- [x] Default all rows to 0xFF (no keys pressed)
- [x] Add `applyMatrixKey(row: number, col: number, pressed: boolean)` method to runtime
- [x] Add `matrixModeEnabled: boolean` to state (from CONFIG switch or config option)
- [x] When matrix mode active, inhibit hex keypad NMI (except RESET)
- [x] Unit tests: set key in row 3 col 5, scan row 3, verify bit 5 is low; scan other rows, verify 0xFF

**Status:** Matrix scan now uses the high port byte for row selection when enabled; keypad NMI is suppressed in
matrix mode, and tests cover row reads plus the disabled-mode fallback.

#### 4C — Matrix key mapping tables

**Files:** new file `src/platforms/tec1g/matrix-keymap.ts`
**Effort:** Small
**Depends on:** Stage 4B
**Tasks:**

- [x] Create mapping from PC keyboard scancodes to matrix (row, col) pairs
- [x] Align with MON-3's `matrixScan` and `matrixToASCII` expected layout
- [x] Include shifted characters (using CAPS from SYS_CTRL bit 5)
- [x] Export mapping table for use by UI panel
- [x] Unit tests: verify all printable ASCII characters have a mapping

**Status:** Added MON-3-aligned matrix scan ASCII mapping tables with shift/caps variants, plus tests for printable
ASCII coverage and row/col bounds.

#### 4D — Matrix keyboard UI

**Files:** `src/platforms/tec1g/ui-panel-*.ts`
**Effort:** Medium
**Depends on:** Stage 4B, 4C
**Tasks:**

- [x] Add UI toggle for matrix keyboard mode (shows/hides matrix keyboard panel)
- [x] Option A: virtual QWERTY grid in webview (click to press)
- [x] Option B: capture PC keyboard events and translate via keymap
- [x] Send `applyMatrixKey` messages from webview to runtime
- [x] Show CAPS state indicator from SYS_CTRL
- [x] Visual feedback on key press/release

**Status:** Implemented keyboard-capture mode with a matrix toggle + CAPS indicator, plus a clickable QWERTY grid
with per-key press feedback.

---

### Stage 5 — RTC (DS1302) on port 0xFC

External add-on emulation. Fully independent of other stages.

#### 5A — DS1302 protocol state machine

**Files:** new file `src/platforms/tec1g/ds1302.ts`
**Effort:** Medium
**Depends on:** Nothing
**Tasks:**

- [x] Create `DS1302` class with bit-bang interface:
  - Track CE (bit 4), CLK (bit 6), data line state
  - Detect CLK rising/falling edges
  - Shift in command byte (8 bits: address + R/W flag)
  - Shift in/out data byte (8 bits, LSB first)
- [x] Implement read mode: on rising CLK edges after command, shift out data bits
- [x] Implement write mode: on rising CLK edges after command, shift in data bits
- [x] Handle CE transitions (CE low -> reset protocol state)
- [x] Unit tests: full write-then-read cycle for a single register

**Status:** Added a DS1302 bit-bang state machine with command/data shifting and a basic write/read test.

#### 5B — DS1302 registers and PRAM

**Files:** `src/platforms/tec1g/ds1302.ts`
**Effort:** Small-Medium
**Depends on:** Stage 5A
**Tasks:**

- [x] Implement time registers (seconds, minutes, hours, day, month, year, day-of-week)
- [x] Source time from `Date.now()` on read; convert to BCD format
- [x] Implement write to time registers (store offsets from system time)
- [x] Implement 31-byte PRAM array with read/write by address
- [x] Implement burst read/write mode (sequential register access)
- [x] Handle write-protect register (bit 7 of register 0x07)
- [x] Unit tests: read time, verify BCD format; write PRAM, read back

**Status:** Added BCD time registers + PRAM storage with write-protect, plus burst read/write support.

#### 5C — DS1302 integration with runtime

**Files:** `src/platforms/tec1g/runtime.ts`
**Effort:** Small
**Depends on:** Stage 5A, 5B
**Tasks:**

- [ ] Add `rtcEnabled: boolean` config option (default false)
- [ ] Instantiate `DS1302` in runtime when enabled
- [ ] Route port 0xFC writes to `ds1302.write(value)`, reads to `ds1302.read()`
- [ ] Add RTC presence indicator to SYS_INPUT (if applicable — verify with MON-3 source)
- [ ] Unit tests: end-to-end port 0xFC write command + read response

---

### Stage 6 — SD card SPI on port 0xFD

External add-on emulation. Fully independent of other stages.

#### 6A — SPI state machine

**Files:** new file `src/platforms/tec1g/sd-spi.ts`
**Effort:** Medium
**Depends on:** Nothing
**Tasks:**

- [ ] Create `SdSpi` class with bit-bang interface:
  - Track MOSI (bit 0), CLK (bit 1), CS state
  - Shift register: accumulate 8 bits on CLK edges -> command byte
  - Output shift register: provide 8 bits on CLK edges -> response byte
- [ ] Implement idle state: respond with 0xFF when not selected
- [ ] Implement command detection: 6-byte SD command format (0x40 | cmd, 4 args, CRC)
- [ ] Unit tests: shift in CMD0 bytes, verify command detected

#### 6B — SD card command responses

**Files:** `src/platforms/tec1g/sd-spi.ts`
**Effort:** Medium
**Depends on:** Stage 6A
**Tasks:**

- [ ] CMD0 (GO_IDLE_STATE): respond with R1 = 0x01 (idle)
- [ ] CMD8 (SEND_IF_COND): respond with R7 (voltage accepted)
- [ ] ACMD41 (SD_SEND_OP_COND): respond with R1 = 0x00 (ready) after N retries
- [ ] CMD58 (READ_OCR): respond with OCR register
- [ ] CMD17 (READ_SINGLE_BLOCK): respond with data token + 512 bytes from virtual image
- [ ] Unit tests: full initialization sequence (CMD0 -> CMD8 -> ACMD41 -> CMD58)

#### 6C — SD card integration with runtime

**Files:** `src/platforms/tec1g/runtime.ts`
**Effort:** Small
**Depends on:** Stage 6A, 6B
**Tasks:**

- [ ] Add `sdEnabled: boolean` and optional `sdImagePath: string` config options
- [ ] Instantiate `SdSpi` in runtime when enabled
- [ ] Route port 0xFD writes to `sdSpi.write(value)`, reads to `sdSpi.read()`
- [ ] If `sdImagePath` provided, load file as virtual disk image for block reads
- [ ] Add SD presence indicator to SYS_INPUT (if applicable)
- [ ] Unit tests: end-to-end port 0xFD initialization sequence

---

### Stage 7 — Cartridge support

Depends on Stage 2C (bank switching) for memory mapping.

#### 7A — Cartridge configuration and memory mapping

**Files:** `src/platforms/tec1g/runtime.ts`, `src/debug/adapter.ts`, `src/platforms/types.ts`
**Effort:** Medium
**Depends on:** Stage 2C (expansion bank switching)
**Tasks:**

- [ ] Add `cartridgeHex: string` config option to `Tec1gPlatformConfig`
- [ ] Load cartridge ROM hex into expansion memory space on launch
- [ ] Set `cartridgePresent = true` in state when cartridge configured
- [ ] Verify CART flag (port 0x03 bit 3) reflects presence correctly
- [ ] Unit tests: cartridge configured -> CART=1; not configured -> CART=0

#### 7B — Cartridge boot detection

**Files:** `src/platforms/tec1g/runtime.ts`
**Effort:** Small-Medium
**Depends on:** Stage 7A
**Tasks:**

- [ ] Research MON-3 cartridge boot sequence (check ROM source for boot flag location and behavior)
- [ ] Implement boot flag detection at expected cartridge header address
- [ ] On cold reset with cartridge present, jump to cartridge entry point (if boot flag valid)
- [ ] Unit tests: cartridge with valid boot header triggers entry; invalid header boots normally

---

### Stage 8 — Quality and UI polish

Can be worked at any time, independently of feature stages.

#### 8A — System status indicators in UI

**Files:** `src/platforms/tec1g/ui-panel-*.ts`
**Effort:** Small
**Depends on:** Stage 2A (SYS_CTRL decode)
**Tasks:**

- [ ] Add status LED indicators to webview panel: SHADOW, PROTECT, EXPAND, CAPS
- [ ] Update on each UI payload (already includes `sysCtrl` value)
- [ ] Style to match BAR1 LED bar appearance from real hardware

#### 8B — Missing test coverage

**Files:** `tests/platforms/tec1g/`
**Effort:** Medium
**Depends on:** Nothing (can be written against current code)
**Tasks:**

- [ ] LCD HD44780: busy flag timing, clear, home, DDRAM addressing, data read/write
- [ ] GLCD ST7920: basic instruction set, GDRAM write/read, DDRAM addressing, busy timing
- [ ] Serial bitbang: TX decode accuracy, RX injection timing, edge cases
- [ ] Port 0x03: verify all 8 bits against schematic (current state before fixes)
- [ ] Memory banking: SHADOW + PROTECT + EXPAND combinations, boundary conditions

---

## Task dependency graph

```
Stage 1A --+
Stage 1B --+ (all independent)
Stage 1C --+

Stage 2A ----------------+
Stage 2B -(needs 1A)-----+
                         +--> Stage 2C --> Stage 7A --> Stage 7B

Stage 3A --+
Stage 3B --+
Stage 3C --+ (all independent, can parallel with any)
Stage 3D --+
Stage 3E --+

Stage 4A --> Stage 4B --> Stage 4C
                     +--> Stage 4D

Stage 5A --> Stage 5B --> Stage 5C   (independent)

Stage 6A --> Stage 6B --> Stage 6C   (independent)

Stage 8A -(needs 2A)
Stage 8B -(independent, can start now)
```

## Summary by effort

| Effort                       | Tasks                                              |
| ---------------------------- | -------------------------------------------------- |
| **Small** (< 2 hours)        | 1A, 1B, 1C, 2A, 2B, 3A, 3B, 3C, 3D, 4C, 5C, 6C, 8A |
| **Small-Medium** (2-4 hours) | 3E, 5B, 7A, 7B                                     |
| **Medium** (half day)        | 2C, 4A, 4B, 4D, 5A, 6A, 6B, 8B                     |

## Recommended work order for a single developer

1. **1A + 1B + 1C** — fix the bug, update docs (clear the decks)
2. **2A + 2B** — system registers (foundation for everything)
3. **8B** — write missing tests against current code (catch regressions early)
4. **3A-3D** — LCD instructions (quick wins, self-contained)
5. **2C** — bank switching (enables cartridge later)
6. **4A-4D** — matrix keyboard (biggest new feature)
7. **5A-5C** — RTC (external add-on)
8. **6A-6C** — SD card (external add-on)
9. **7A-7B** — cartridge (depends on bank switching)
10. **3E + 8A** — CGRAM and UI polish (nice-to-have)

## Parallel work streams (for multiple developers)

| Stream                         | Tasks                                              |
| ------------------------------ | -------------------------------------------------- |
| **Stream A — Core registers**  | 1A -> 2A + 2B -> 2C -> 7A -> 7B (sequential chain) |
| **Stream B — LCD**             | 3A, 3B, 3C, 3D, 3E (independent, any order)        |
| **Stream C — Matrix keyboard** | 4A -> 4B -> 4C + 4D (sequential chain)             |
| **Stream D — RTC**             | 5A -> 5B -> 5C (sequential chain)                  |
| **Stream E — SD card**         | 6A -> 6B -> 6C (sequential chain)                  |
| **Stream F — Docs + tests**    | 1B, 1C, 8A, 8B (mostly independent)                |

Streams B, C, D, E can all run in parallel. Stream A should start first (others may depend on register fixes).
Stream F can run alongside anything.

---

## Port mirrors (confirmed working)

Ports 0x80-0x87 mirror ports 0x00-0x07 with A7 high, used to distinguish instruction vs data for LCD and GLCD:

| Port                       | Description                                         |
| -------------------------- | --------------------------------------------------- |
| Port 0x84 (mirror of 0x04) | LCD data (RS=1) vs LCD instruction (RS=0 on 0x04)   |
| Port 0x87 (mirror of 0x07) | GLCD data (RS=1) vs GLCD instruction (RS=0 on 0x07) |

These are correctly handled in the emulation.

---

## SD card and RTC pin assignment discrepancy

The older `TEC1G_EMULATION_STATUS.md` document lists different pin assignments than the schematic and
`src/platforms/tec1g/README.md`. The schematic is authoritative:

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

1. **LCD CGRAM** — claimed COMPLETE, actually **missing**. No CGRAM storage exists in runtime.ts.
2. **LCD entry mode** — claimed COMPLETE, actually **missing**. Entry mode instruction (0x04-0x07) is ignored.
3. **LCD display shift** — claimed COMPLETE, actually **missing**. Cursor/display shift (0x10-0x1F) is ignored.
4. **LCD display on/off** — claimed COMPLETE, actually **missing**. Display on/off instruction (0x08-0x0F) is
   ignored.
5. **Port 03 bit 5 = KDA** — STATUS doc says bit 5 is KDA. Schematic confirms bit 6 = KDA, bit 5 = GIMP.
6. **SD/RTC pin assignments** — see section above.
7. **Port FF bits 3-7 "spare/unused"** — claimed available. Schematic confirms bit 3 = E_A14 (bank select),
   bit 5 = CAPS.

This document should be either updated or superseded by this review.

---

## UI panel status

Current UI sections (from `src/platforms/tec1g/ui-panel-html-markup.ts`):

| Section    | Visibility |
| ---------- | ---------- |
| LCD        | Shown      |
| 7-SEG      | Shown      |
| KEYPAD     | Shown      |
| 8x8 MATRIX | Hidden     |
| GLCD       | Hidden     |
| SERIAL     | Shown      |

Proposed additions for future phases:

- **System status indicators** — SHADOW/PROTECT/EXPAND/CAPS latch states (Phase 2/3)
- **Matrix keyboard UI** — virtual QWERTY grid or PC keyboard mapping (Phase 5)
- **RTC display** — current emulated time when RTC add-on enabled (Phase 6)
- **SD card status** — mounted/activity indicator when SD add-on enabled (Phase 7)

---

## Existing test coverage

| Component             | Test file                   | Status      |
| --------------------- | --------------------------- | ----------- |
| System control        | `sysctrl.test.ts`           | Exists      |
| UI panel HTML         | `ui-panel-html.test.ts`     | Exists      |
| UI panel memory       | `ui-panel-memory.test.ts`   | Exists      |
| UI panel messages     | `ui-panel-messages.test.ts` | Exists      |
| Shadow ROM            | `tec1g-shadow.test.ts`      | Exists      |
| LCD HD44780 commands  | —                           | **Missing** |
| GLCD ST7920 commands  | —                           | **Missing** |
| Serial bitbang timing | —                           | **Missing** |
| Port 0x03 bits        | —                           | **Missing** |
| Memory banking combos | —                           | **Missing** |

Test files are in `tests/platforms/tec1g/` and `tests/debug/`.

---

## Open questions

1. **MON-3 build differences:** Are there behavioral differences between MON-3 v1.4, v1.5, and BC24-15 that affect
   emulation?
2. **SYS_INPUT latch vs combinational:** The schematic shows U19 (74HCT245) as a buffer, not a latch. Current code
   synthesizes values on-read, which should be correct. However, if MON-3 timing is sensitive to
   read-during-transition, a latched model might be needed. This should be validated against real hardware behavior.
3. **Expansion beyond 32K:** The schematic notes mention "Memory Expansion of 512k with ease" via the expansion
   connectors. The current 2-bank (32K) model covers the on-board socket; larger expansions via TEC Deck are a
   separate concern.

---

## Blocking dependencies

- **Schematic:** Now available (v1.21). All bit assignments confirmed.
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
