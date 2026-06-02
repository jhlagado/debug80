/**
 * @file TEC-1G system control register decoder.
 * Port 0xFF controls memory mapping and protection features.
 */

/**
 * Decoded state of the TEC-1G system control register (port 0xFF).
 * U13 74HCT273 latch — all 8 bits are latched on every write.
 */
export type Tec1gSysCtrlState = {
  /** Shadow ROM enabled (bit 0 = 0) - mirrors ROM from 0xC000 to 0x0000 */
  shadowEnabled: boolean;
  /** Write protection enabled (bit 1 = 1) - protects 0x4000-0x7FFF */
  protectEnabled: boolean;
  /** Memory expansion enabled (bit 2 = 1) - enables banked window at 0x8000-0xBFFF */
  expandEnabled: boolean;
  /** Expansion bank A14 (bit 3) - bank select for expansion window */
  bankA14: boolean;
  /** Future memory expansion bank select bits (bits 3-6, bit 3 is also E_A14). */
  memoryExpansionBankBits: [boolean, boolean, boolean, boolean];
  /** Future memory expansion bank value from bits 3-6. */
  memoryExpansionBankValue: number;
  /** Caps lock (bit 7) */
  capsLock: boolean;
};

/**
 * Decodes the TEC-1G system control register value.
 *
 * Bit layout (U13 74HCT273):
 * - Bit 0: ~SHADOW (active low — 0 = shadow on)
 * - Bit 1: PROTECT (1 = write-protect 0x4000-0x7FFF)
 * - Bit 2: EXPAND (1 = expansion window at 0x8000-0xBFFF)
 * - Bit 3: E_A14 / Memory Expansion bit 0
 * - Bit 4: Memory Expansion bit 1
 * - Bit 5: Memory Expansion bit 2
 * - Bit 6: Memory Expansion bit 3
 * - Bit 7: CAPS (caps lock)
 *
 * @param value - Raw port 0xFF value
 * @returns Decoded system control state
 */
export const decodeSysCtrl = (value: number): Tec1gSysCtrlState => {
  const masked = value & 0xff;
  const memoryExpansionBankValue = (masked >> 3) & 0x0f;
  return {
    shadowEnabled: (masked & 0x01) === 0,
    protectEnabled: (masked & 0x02) !== 0,
    expandEnabled: (masked & 0x04) !== 0,
    bankA14: (masked & 0x08) !== 0,
    memoryExpansionBankBits: [
      (masked & 0x08) !== 0,
      (masked & 0x10) !== 0,
      (masked & 0x20) !== 0,
      (masked & 0x40) !== 0,
    ],
    memoryExpansionBankValue,
    capsLock: (masked & 0x80) !== 0,
  };
};
