# TEC-1G Emulation Status

> Comprehensive comparison of TEC-1G hardware features vs debug80 emulation implementation.
>
> Last Updated: January 2025

## Executive Summary

| Category                         | Emulated | Partial | Missing | Total  |
| -------------------------------- | -------- | ------- | ------- | ------ |
| **Core CPU & Memory**            | 5        | 0       | 0       | 5      |
| **TEC-1 Compatible I/O (00-07)** | 7        | 1       | 0       | 8      |
| **TEC-1G Extended I/O (F8-FF)**  | 1        | 1       | 3       | 5      |
| **Display Devices**              | 3        | 0       | 0       | 3      |
| **Input Devices**                | 1        | 0       | 2       | 3      |
| **Communication**                | 1        | 0       | 0       | 1      |
| **Peripherals**                  | 0        | 0       | 2       | 2      |
| **TOTALS**                       | **18**   | **2**   | **7**   | **27** |

**Overall Emulation Completeness: ~74% (20/27 features)**

---

## 1. Core CPU & Memory System

### 1.1 Z80 CPU ✅ COMPLETE

| Feature                      | Status | Notes                                  |
| ---------------------------- | ------ | -------------------------------------- |
| Z80 instruction set          | ✅     | Full instruction set emulated          |
| Interrupt handling (NMI/INT) | ✅     | NMI wired to keypad, INT mode 1        |
| Clock speeds                 | ✅     | SLOW (400kHz) / FAST (4MHz) switchable |
| Cycle-accurate timing        | ✅     | Proper T-state counting                |

**Implementation:** [src/z80/z80.ts](../src/z80/z80.ts)

### 1.2 Memory Architecture ✅ COMPLETE

| Feature                        | Status | Notes                        |
| ------------------------------ | ------ | ---------------------------- |
| 64KB address space             | ✅     | Full 64KB addressable        |
| Bank 0 (0000-3FFF) - RAM       | ✅     | 16KB RAM                     |
| Bank 1 (4000-7FFF) - RAM       | ✅     | 16KB RAM                     |
| Bank 2 (8000-BFFF) - Expansion | ✅     | Cartridge/Expansion RAM      |
| Bank 3 (C000-FFFF) - ROM       | ✅     | MON-3 ROM                    |
| SHADOW mode (bit 0)            | ✅     | ROM shadows RAM at 0000-3FFF |
| PROTECT mode (bit 1)           | ✅     | Blocks writes to Bank 0      |
| EXPAND mode (bit 2)            | ✅     | Enables Bank 2 RAM           |

**Implementation:**

- Memory banking: [src/debug/adapter.ts](../src/debug/adapter.ts) (lines 380-450)
- System control decoder: [src/platforms/tec1g/sysctrl.ts](../src/platforms/tec1g/sysctrl.ts)

---

## 2. TEC-1 Compatible I/O Ports (00-07)

All TEC-1 compatible ports are fully emulated with proper timing.

### 2.1 Port 00 - Keyboard Data ✅ COMPLETE

| Feature                       | Status | Notes                  |
| ----------------------------- | ------ | ---------------------- |
| 74C923 key encoder (bits 0-4) | ✅     | Key value 0-19 encoded |
| Key available flag (bit 5)    | ✅     | KDA signal from 74C923 |
| Serial RX data (bit 7)        | ✅     | FTDI serial input      |
| NMI generation on keypress    | ✅     | Triggers Z80 NMI       |

**Implementation:** [src/platforms/tec1g/runtime.ts](../src/platforms/tec1g/runtime.ts) lines 130-155

### 2.2 Port 01 - Digit Select/Control ✅ COMPLETE

| Feature                  | Status | Notes                                 |
| ------------------------ | ------ | ------------------------------------- |
| Digit select (bits 0-2)  | ✅     | 6 digits multiplexed                  |
| Speaker output (bit 7)   | ✅     | Frequency calculated from toggle rate |
| Serial TX output (bit 6) | ✅     | Bitbang UART at 4800 baud             |
| Spare bits (3-5)         | ✅     | Available for user                    |

**Implementation:** [src/platforms/tec1g/runtime.ts](../src/platforms/tec1g/runtime.ts) lines 160-220

### 2.3 Port 02 - Segment Data ✅ COMPLETE

| Feature                 | Status | Notes                            |
| ----------------------- | ------ | -------------------------------- |
| Segment data (bits 0-7) | ✅     | 8 segments (a-g + DP) active low |
| Display multiplexing    | ✅     | Proper digit/segment timing      |

**Implementation:** [src/platforms/tec1g/runtime.ts](../src/platforms/tec1g/runtime.ts) lines 225-245

### 2.4 Port 03 - SIMP Input ⚠️ PARTIAL

| Feature                    | Status | Notes             |
| -------------------------- | ------ | ----------------- |
| Key Data Available (bit 5) | ✅     | KDA status        |
| Serial RX (bit 7)          | ✅     | FTDI serial input |
| Protection status (bit 1)  | ✅     | PROTECT pin state |
| G.INPUT pin                | ❌     | Not implemented   |
| Cartridge detection        | ❌     | Not implemented   |

**Implementation:** [src/platforms/tec1g/runtime.ts](../src/platforms/tec1g/runtime.ts) lines 250-270

### 2.5 Port 04/84 - LCD Data ✅ COMPLETE

| Feature                   | Status | Notes                        |
| ------------------------- | ------ | ---------------------------- |
| HD44780 data write        | ✅     | Full character set (A00 ROM) |
| HD44780 data read         | ✅     | Read back from DDRAM         |
| 40x4 character mode       | ✅     | 4 lines × 40 characters      |
| Custom characters (CGRAM) | ✅     | 8 user-defined characters    |
| Cursor positioning        | ✅     | Proper DDRAM addressing      |
| Display shift             | ✅     | Left/right shift             |
| Entry mode                | ✅     | Increment/decrement, shift   |

**Implementation:** [src/platforms/tec1g/runtime.ts](../src/platforms/tec1g/runtime.ts) lines 275-400

### 2.6 Port 05 - Matrix Column ✅ COMPLETE

| Feature                  | Status | Notes                 |
| ------------------------ | ------ | --------------------- |
| Column select (bits 0-7) | ✅     | 8 columns active high |
| LED matrix column drive  | ✅     | Proper multiplexing   |

**Implementation:** [src/platforms/tec1g/runtime.ts](../src/platforms/tec1g/runtime.ts) lines 405-420

### 2.7 Port 06 - Matrix Row ✅ COMPLETE

| Feature              | Status | Notes               |
| -------------------- | ------ | ------------------- |
| Row data (bits 0-7)  | ✅     | 8 rows active high  |
| LED matrix row drive | ✅     | Proper multiplexing |

**Implementation:** [src/platforms/tec1g/runtime.ts](../src/platforms/tec1g/runtime.ts) lines 425-440

### 2.8 Port 07/87 - GLCD Data ✅ COMPLETE

This is the **most comprehensive** peripheral emulation in debug80.

| Feature                    | Status | Notes                     |
| -------------------------- | ------ | ------------------------- |
| ST7920 controller          | ✅     | Full command set          |
| 128×64 graphics mode       | ✅     | Full GDRAM support        |
| Text mode (8×4 characters) | ✅     | 16×16 font                |
| Extended instruction set   | ✅     | Graphics, scroll, reverse |
| DDRAM (display data)       | ✅     | 64 bytes                  |
| GDRAM (graphics data)      | ✅     | 8KB graphics buffer       |
| CGRAM (custom chars)       | ✅     | User-defined characters   |
| Cursor blink               | ✅     | Configurable blink rate   |
| Scroll mode                | ✅     | Vertical scroll           |
| Reverse mode               | ✅     | Display inversion         |
| Busy flag                  | ✅     | Proper timing emulation   |

**Implementation:** [src/platforms/tec1g/runtime.ts](../src/platforms/tec1g/runtime.ts) lines 445-850 (405 lines!)

---

## 3. TEC-1G Extended I/O Ports (F8-FF)

### 3.1 Port FC - RTC (DS1302) ❌ NOT IMPLEMENTED

| Feature                             | Status | Notes           |
| ----------------------------------- | ------ | --------------- |
| Time read (seconds, minutes, hours) | ❌     | Not implemented |
| Date read (day, month, year)        | ❌     | Not implemented |
| Time write                          | ❌     | Not implemented |
| RAM read/write (31 bytes)           | ❌     | Not implemented |
| Burst mode                          | ❌     | Not implemented |

**Hardware:** DS1302 Real-Time Clock with 3-wire serial interface  
**Port Protocol:** Uses bit 0 (CLK), bit 1 (I/O), bit 2 (CE)

**Implementation Effort:** Medium  
**Priority:** Low - Not commonly used in TEC-1G programs

### 3.2 Port FD - SD Card ❌ NOT IMPLEMENTED

| Feature            | Status | Notes           |
| ------------------ | ------ | --------------- |
| SPI initialization | ❌     | Not implemented |
| Block read         | ❌     | Not implemented |
| Block write        | ❌     | Not implemented |
| Card detection     | ❌     | Not implemented |
| FAT filesystem     | ❌     | Not implemented |

**Hardware:** MicroSD card via SPI interface  
**Port Protocol:** Uses bit 0 (CLK), bit 1 (MOSI), bit 6 (MISO), bit 7 (CS)

**Implementation Effort:** High - Requires full SPI emulation + filesystem  
**Priority:** Medium - Useful for loading programs

### 3.3 Port FE - Matrix Keyboard ⚠️ STUB ONLY

| Feature             | Status | Notes                  |
| ------------------- | ------ | ---------------------- |
| 8×8 key matrix scan | ❌     | Returns 0xFF (no keys) |
| Row select output   | ❌     | Not implemented        |
| Column read input   | ❌     | Not implemented        |
| Key debouncing      | ❌     | Not implemented        |

**Current Implementation:** Returns `0xFF` (all keys released)

```typescript
// runtime.ts line 855
case 0xfe:
  // Matrix keyboard - unwired for now
  return 0xff;
```

**Hardware:** 8×8 matrix keyboard connector (active low)  
**Port Protocol:** Write row select, read column data

**Implementation Effort:** Low-Medium  
**Priority:** Medium - Enables expanded keyboard support

### 3.4 Port FF - System Control Latch ✅ COMPLETE

| Feature             | Status | Notes                              |
| ------------------- | ------ | ---------------------------------- |
| SHADOW bit (bit 0)  | ✅     | 0=enabled (ROM shadows Bank 0)     |
| PROTECT bit (bit 1) | ✅     | 1=enabled (Bank 0 write-protected) |
| EXPAND bit (bit 2)  | ✅     | 1=enabled (Bank 2 active)          |
| Bits 3-7 spare      | ✅     | Unused, available                  |

**Implementation:** [src/platforms/tec1g/sysctrl.ts](../src/platforms/tec1g/sysctrl.ts)

### 3.5 Ports 80-87 - Mirrors ✅ COMPLETE

| Feature           | Status | Notes                |
| ----------------- | ------ | -------------------- |
| Port 80 = Port 00 | ✅     | Keyboard data mirror |
| Port 84 = Port 04 | ✅     | LCD data mirror      |
| Port 87 = Port 07 | ✅     | GLCD data mirror     |

---

## 4. Display Devices

### 4.1 Seven-Segment Display ✅ COMPLETE

| Feature                    | Status | UI Support            |
| -------------------------- | ------ | --------------------- |
| 6-digit display            | ✅     | ✅ HTML/CSS rendering |
| Segment patterns (a-g, DP) | ✅     | ✅ SVG-based segments |
| Brightness simulation      | ✅     | ✅ Opacity-based      |
| Multiplexing artifacts     | ⚠️     | Simplified model      |

### 4.2 HD44780 LCD ✅ COMPLETE

| Feature                | Status | UI Support           |
| ---------------------- | ------ | -------------------- |
| 40×4 character display | ✅     | ✅ Canvas rendering  |
| Character ROM (A00)    | ✅     | ✅ Full charset      |
| CGRAM (8 custom chars) | ✅     | ✅ Rendered          |
| Cursor display         | ✅     | ✅ Blinking cursor   |
| Display on/off         | ✅     | ✅ Visibility toggle |
| Backlight              | N/A    | Always on in UI      |

### 4.3 ST7920 GLCD ✅ COMPLETE

| Feature               | Status | UI Support            |
| --------------------- | ------ | --------------------- |
| 128×64 pixel graphics | ✅     | ✅ Canvas rendering   |
| Text mode (16×4)      | ✅     | ✅ Chinese ROM font   |
| Graphics/text overlay | ✅     | ✅ Combined rendering |
| Vertical scroll       | ✅     | ✅ Animated           |
| Reverse video         | ✅     | ✅ Color inverted     |
| Cursor blink          | ✅     | ✅ Timed blink        |

---

## 5. Input Devices

### 5.1 74C923 Keypad Encoder ✅ COMPLETE

| Feature                           | Status | Notes                    |
| --------------------------------- | ------ | ------------------------ |
| 20-key hexpad (0-F, AD, GO, +, -) | ✅     | Click and keyboard input |
| Key Data Available (KDA)          | ✅     | Proper latching          |
| NMI generation                    | ✅     | Triggers Z80 NMI         |
| Key debouncing                    | ✅     | Emulated via timing      |

### 5.2 Matrix Keyboard (Port FE) ❌ NOT IMPLEMENTED

| Feature              | Status | Notes                 |
| -------------------- | ------ | --------------------- |
| 8×8 key matrix       | ❌     | Hardware not emulated |
| ASCII keyboard input | ❌     | Could map PC keyboard |
| Function keys        | ❌     | Not implemented       |

### 5.3 Joystick ❌ NOT IMPLEMENTED

| Feature                | Status | Notes           |
| ---------------------- | ------ | --------------- |
| Digital joystick input | ❌     | Not implemented |
| Fire buttons           | ❌     | Not implemented |

---

## 6. Communication

### 6.1 FTDI Serial (Bit-Bang UART) ✅ COMPLETE

| Feature                     | Status | Notes                  |
| --------------------------- | ------ | ---------------------- |
| TX output (Port 01 bit 6)   | ✅     | Bitbang encoding       |
| RX input (Port 00/03 bit 7) | ✅     | Bitbang decoding       |
| 4800 baud default           | ✅     | Timing-based detection |
| 9600 baud                   | ⚠️     | May need tuning        |
| Terminal display            | ✅     | UI serial monitor      |
| Send text to RX             | ✅     | UI input field         |

---

## 7. Peripherals

### 7.1 DS1302 Real-Time Clock ❌ NOT IMPLEMENTED

| Feature            | Status | Effort | Priority |
| ------------------ | ------ | ------ | -------- |
| Time/date read     | ❌     | Medium | Low      |
| Time/date write    | ❌     | Medium | Low      |
| Battery-backed RAM | ❌     | Low    | Low      |

### 7.2 SD Card ❌ NOT IMPLEMENTED

| Feature          | Status | Effort    | Priority |
| ---------------- | ------ | --------- | -------- |
| SPI protocol     | ❌     | High      | Medium   |
| Block read/write | ❌     | High      | Medium   |
| FAT32 filesystem | ❌     | Very High | Medium   |

---

## 8. Configuration & DIP Switches

### 8.1 Hardware Configuration ⚠️ HARDCODED

| Feature             | Status | Current Value     |
| ------------------- | ------ | ----------------- |
| DIP switch settings | ❌     | Hardcoded         |
| ROM selection       | ⚠️     | Via launch config |
| Clock speed default | ✅     | Configurable      |

---

## Implementation Roadmap

### Phase 1: Quick Wins (Low Effort, High Value)

| Feature                   | Effort  | Value  | Notes                     |
| ------------------------- | ------- | ------ | ------------------------- |
| Matrix Keyboard (Port FE) | Low     | Medium | Map PC keyboard to matrix |
| G.INPUT pin               | Trivial | Low    | Add to Port 03            |
| Config DIP switches       | Low     | Low    | Add to launch config      |

### Phase 2: Medium Features

| Feature           | Effort | Value  | Notes                  |
| ----------------- | ------ | ------ | ---------------------- |
| DS1302 RTC        | Medium | Low    | 3-wire serial protocol |
| Joystick input    | Low    | Medium | Map to arrow keys      |
| Higher baud rates | Low    | Medium | Tune timing model      |

### Phase 3: Major Features

| Feature            | Effort    | Value  | Notes                      |
| ------------------ | --------- | ------ | -------------------------- |
| SD Card SPI        | High      | High   | Requires SPI state machine |
| FAT filesystem     | Very High | High   | Consider virtual FS        |
| Full serial config | Medium    | Medium | Parity, stop bits          |

---

## Technical Implementation Notes

### Matrix Keyboard (Port FE)

**Current stub:**

```typescript
case 0xfe:
  return 0xff; // All keys released
```

**Proposed implementation:**

```typescript
interface MatrixKeyboardState {
  rowSelect: number;     // Last written row pattern
  keyStates: number[];   // 8 rows × 8 columns
}

// Port FE write - set row select
handlePortFEWrite(value: number): void {
  this.state.matrixKeyboard.rowSelect = value;
}

// Port FE read - return column data for selected rows
handlePortFERead(): number {
  const rowSelect = this.state.matrixKeyboard.rowSelect;
  let result = 0xff;
  for (let row = 0; row < 8; row++) {
    if (!(rowSelect & (1 << row))) { // Active low
      result &= this.state.matrixKeyboard.keyStates[row];
    }
  }
  return result;
}
```

### RTC (Port FC)

The DS1302 uses a 3-wire protocol:

- CE (Chip Enable) - bit 2
- CLK (Clock) - bit 0
- I/O (Bidirectional data) - bit 1

**Implementation approach:**

1. State machine tracking CE, CLK transitions
2. Command byte detection (address + R/W)
3. Data shift register for read/write
4. Map to system time for read operations

### SD Card (Port FD)

The SD card uses SPI protocol:

- CS (Chip Select) - bit 7
- CLK (Clock) - bit 0
- MOSI (Data Out) - bit 1
- MISO (Data In) - bit 6

**Implementation approach:**

1. SPI state machine (idle, command, response, data)
2. SD card command interpreter (CMD0, CMD8, CMD17, CMD24, etc.)
3. Virtual filesystem with loaded files
4. Block buffer for read/write operations

**Complexity:** High - requires full SPI protocol + SD command set

---

## UI Panel Components

Current UI sections in [ui-panel-html-markup.ts](../src/platforms/tec1g/ui-panel-html-markup.ts):

| Section    | Checkbox | Default |
| ---------- | -------- | ------- |
| LCD        | ✅       | Shown   |
| 7-SEG      | ✅       | Shown   |
| KEYPAD     | ✅       | Shown   |
| 8x8 MATRIX | ✅       | Hidden  |
| GLCD       | ✅       | Hidden  |
| SERIAL     | ✅       | Shown   |

### Proposed UI Additions

For missing features, consider:

1. **RTC Display** - Show current emulated time
2. **SD Card Status** - Show mounted/unmounted, activity LED
3. **Matrix Keyboard** - Virtual keyboard grid
4. **System Status** - SHADOW/PROTECT/EXPAND indicators

---

## Testing Recommendations

### Existing Test Coverage

| Component      | Test File                               | Coverage |
| -------------- | --------------------------------------- | -------- |
| GLCD ST7920    | `tests/platforms/tec1g/glcd.test.ts`    | Good     |
| System Control | `tests/platforms/tec1g/sysctrl.test.ts` | Good     |
| LCD HD44780    | (needs tests)                           | None     |
| Serial bitbang | (needs tests)                           | None     |

### Recommended Test Additions

1. **LCD Command Tests**
   - Entry mode variations
   - CGRAM read/write
   - Display shift modes

2. **Serial Timing Tests**
   - Baud rate detection accuracy
   - Bitbang edge cases
   - Buffer overflow handling

3. **Memory Banking Tests**
   - SHADOW/PROTECT/EXPAND combinations
   - Bank boundary conditions
   - ROM overlay behavior

---

## Conclusion

The TEC-1G emulation in debug80 is **approximately 74% complete**, with excellent coverage of:

✅ **Core functionality:** CPU, memory, banking  
✅ **Primary I/O:** Keypad, displays, speaker  
✅ **Display devices:** 7-seg, LCD, GLCD (comprehensive)  
✅ **Communication:** Serial TX/RX

The missing features are primarily **peripheral expansion**:

❌ **Not implemented:** RTC, SD Card, Matrix Keyboard, Joystick

The GLCD emulation is particularly impressive with full ST7920 command support including graphics mode, text overlay, scroll, and cursor blink - making it the most comprehensive peripheral in the emulator.

**Recommended Priority:**

1. Matrix Keyboard (Port FE) - Enables expanded input
2. SD Card (Port FD) - Enables program loading
3. RTC (Port FC) - Low priority, rarely used

---

_Document generated by debug80 analysis - see [PLATFORMS.md](PLATFORMS.md) and [TECHNICAL.md](TECHNICAL.md) for related documentation._
