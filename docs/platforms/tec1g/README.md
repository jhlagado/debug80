# TEC-1G and MON-3 — Platform and Philosophy

This document reorganises and consolidates the TEC-1G MON-3 documentation into a coherent technical and conceptual overview. It is intended both as a **platform reference** and as a **design brief** for emulation and tooling (e.g. Debug80), not as an introductory user manual.

---

## 1. What This Document Is

This material is grounded primarily in:

- **MON3 User Guide v1.5** (Brian Chiha)
- TEC-1G README and Functional Description
- Historical TEC-1 design lineage

MON-3 is explicitly positioned as the *heart* of the TEC-1G: the resident monitor and runtime environment that makes the board usable both as a beginner trainer and as a serious Z80 development system.

**Credits (as stated in the MON-3 guide):**
- Mark Jelic — TEC-1G designer  
- Brian Chiha — MON-3 programmer  
- John Hardy & Ken Stone — original TEC-1 designers  

---

## 2. What the TEC-1G Is

The TEC-1G is a **trainer-first Z80 single-board computer** that deliberately preserves the classic hex-keypad workflow while extending it into a more capable and recoverable development platform.

Core characteristics:
- Z80 CPU
- Hex keypad and 7-segment LED display (classic trainer interface)
- 20×4 character LCD (primary MON-3 user interface)
- FTDI-based serial interface (Intel HEX load, binary transfer, disassembly export)
- Expansion socket mapped into Z80 address space
- General-purpose I/O header

Optional add-ons supported by MON-3:
- Matrix keyboard
- Real-time clock
- Graphical LCD
- Secure digital flash and general I/O modules

**Key point:**  
The TEC-1G is not merely a trainer. It is a small but extensible Z80 platform whose monitor deliberately exposes system services rather than hiding them.

---

## 3. Memory Architecture

MON-3 documents and depends on a full 64 kilobyte address space with a fixed, intentional layout.

### Default Memory Map

| Address Range | Type     | Purpose |
|--------------|----------|---------|
| 0x0000–0x00FF | RAM | Reserved Z80 instruction area |
| 0x0100–0x07FF | RAM | Free RAM |
| 0x0800–0x087F | RAM | Hardware stack |
| 0x0880–0x0FFF | RAM | MON-3 working RAM |
| 0x1000–0x3FFF | RAM | Free RAM |
| 0x4000–0x7FFF | RAM | Free RAM (Protect-capable) |
| 0x8000–0xBFFF | ROM/RAM | Expansion socket (banked) |
| 0xC000–0xFFFF | ROM | Monitor ROM (MON-3) |

MON-3 places its stack near 0x0800 and strongly encourages user code to live at **0x4000**.

---

## 4. The Three Runtime Modes (System Latch)

Three latch-controlled modes define the personality of the TEC-1G. These are **runtime state**, not just jumpers.

### Shadow
- Low memory (0x0000–0x07FF) mirrors ROM at 0xC000–0xC7FF
- Used for compatibility with older monitors (MON-1, MON-2, JMON, BMON)
- Active by default

### Protect
- When enabled, writes to 0x4000–0x7FFF are blocked
- Prevents runaway code from destroying user programs
- Central to MON-3’s debugging workflow

### Expand
- Expansion devices may be up to 32K
- Only 16K visible at a time at 0x8000–0xBFFF
- Bank selected via latch or software override (Fn-E)

Together, Shadow + Protect + Expand allow the TEC-1G to behave simultaneously as:
- a learning machine
- a safe development environment
- a platform with multiple ROM personalities

---

## 5. Front-Panel Workflow (MON-3’s Intended Use)

MON-3 actively guides the user into a particular development habit:

1. **Data Entry Mode defaults to 0x4000**
   - This address lies inside the Protect-capable region
2. **Protect is enabled before execution**
   - Code becomes effectively read-only
3. **Execution is controlled via breakpoints**
   - Inspection happens after real execution, not single-step illusion

Mental model enforced by MON-3:
> **0x4000–0x7FFF is the workbench.  
Everything else is tools or infrastructure.**

---

## 6. Debugging Model: Literal Breakpoints

Breakpoints in MON-3 are explicit machine instructions.

- Breakpoint opcode: **RST 30H** (byte `F7`)
- Inserted directly into code
- On hit, MON-3 displays:
  - AF, BC, DE, HL
  - IX, IY
  - SP, PC
  - flags

Convenience operations:
- Fn-Plus inserts a NOP (used to patch in F7)
- Fn-Minus deletes a byte

Hardware escape hatch:
- If `+` is connected to `D5` on the G.IMP header, breakpoints are ignored

This design:
- avoids emulation tricks
- reinforces real Z80 semantics
- assumes comfort with binary patching

---

## 7. Serial Tooling as a Core Workflow

Serial I/O is not optional or auxiliary on the TEC-1G.

MON-3 supports:
- Intel HEX loading with PASS/FAIL verification
- Binary memory import/export
- Disassembly export as readable Z80 assembly text

Serial parameters:
- 4800 baud
- 8 data bits
- No parity
- 2 stop bits

TMON (terminal monitor) was removed from MON-3 in v1.5 and is now a standalone program.

**Philosophical implication:**  
The authoritative program is what is in RAM, not what exists on a host machine.

---

## 8. Ports: The Hardware Contract

The TEC-1G is intentionally “bare-metal honest”. MON-3 sits directly on a simple, documented port-mapped machine.

### Core I/O Ports

| Port | Dir | Function |
|------|-----|----------|
| 0x00 | In  | Hex keypad encoder (bits 0–4), Fn key (bit 5, active low) |
| 0x01 | Out | 7-seg digit select, speaker, FTDI RX / disco LEDs |
| 0x02 | Out | 7-seg segment data (A–G, DP) |
| 0x03 | In  | System inputs (keypress flag on bit 6, mode switches) |
| 0x04 | Out | LCD instruction |
| 0x84 | Out | LCD data |
| 0x05 | Out | 8×8 LED matrix horizontal |
| 0x06 | Out | 8×8 LED matrix vertical |
| 0x07 | Out | GLCD instruction |
| 0x87 | Out | GLCD data |
| 0xFE | In  | Matrix keyboard |
| 0xFF | Out | SYS_CTRL latch |

Ports 0xF8–0xFD are reserved for RTC, SD, and general I/O modules.

---

## 9. SYS_CTRL Latch (Port 0xFF)

| Bit | Meaning | Notes |
|-----|---------|-------|
| 0x01 | Shadow | Active-low in MON-3 |
| 0x02 | Protect | Blocks writes to 0x4000–0x7FFF |
| 0x04 | Expand | Selects expansion bank |
| 0x10 | Cartridge flag | Reported by MON-3 |
| 0x80 | Caps lock | MON-3 uses 0x80 |

When documentation conflicts, **MON-3 behaviour is authoritative** unless schematics prove otherwise.

---

## 10. Add-On Devices

### Real-Time Clock
- DS1302 on port 0xFC
- 12/24 hour clock
- Calendar to 2099 with leap year support
- 31 bytes of battery-backed PRAM
- MON-3 stores configuration in PRAM

### Graphical LCD
- Dedicated instruction/data ports
- MON-3 provides a terminal emulation layer
- Supports scrolling history and control characters

These add-ons extend the machine without changing its core mental model.

---

## 11. TEC-1G Philosophy

The TEC-1G is designed around a single disciplined idea:

> **Make the machine legible, controllable, and honest.**

It does not abstract the Z80 away. Instead, it structures interaction so direct contact with the hardware is safe, repeatable, and productive.

### Key Principles

1. **Visibility over abstraction**  
   Code location, writable memory, and executing instructions are always knowable.

2. **Protection without illusion**  
   Coarse-grained containment replaces virtual memory or process models.

3. **Reset as a first-class operation**  
   Reset is expected, safe, and central to iteration.

4. **The monitor as collaborator**  
   MON-3 provides services but does not own the machine.

5. **Constraints as discipline**  
   Fixed windows, banked expansion, and instruction-level breakpoints shape better software habits.

6. **Recoverability over convenience**  
   Disassembly from live memory and serial round-tripping acknowledge that binaries drift and source is not sacred.

---

## 12. Emulation Priorities (Debug80)

For faithful emulation:

1. Correct Shadow / Protect / Expand memory behaviour
2. Stable LCD + 7-segment output with correct addressing
3. Accurate keypad and matrix keyboard input (keypress flag)
4. FTDI serial bit-bang at 4800-8-N-2
5. Expansion modules once the base platform is stable

### Open Questions
- Confirm caps lock bit (0x80 vs 0x20) against schematics
- Clarify cartridge flag behaviour
- Confirm expansion banking semantics for larger devices

---

## 13. Summary

The TEC-1G is neither a retro toy nor a modern abstraction.  
It is a **controlled Z80 environment** whose purpose is to teach and reward correct mental models of real machines.

That philosophy aligns directly with tooling like Debug80: both aim to make the machine explicit, not hidden.
