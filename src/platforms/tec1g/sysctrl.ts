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
  /** Reserved latch bit (bit 4) */
  ffD4: boolean;
  /** Caps lock (bit 5) */
  capsLock: boolean;
  /** Reserved latch bit (bit 6) */
  ffD5: boolean;
  /** Reserved latch bit (bit 7) */
  ffD6: boolean;
};

/**
 * Decodes the TEC-1G system control register value.
 *
 * Bit layout (U13 74HCT273):
 * - Bit 0: ~SHADOW (active low — 0 = shadow on)
 * - Bit 1: PROTECT (1 = write-protect 0x4000-0x7FFF)
 * - Bit 2: EXPAND (1 = expansion window at 0x8000-0xBFFF)
 * - Bit 3: E_A14 (expansion bank select)
 * - Bit 4: FF-D4 (reserved)
 * - Bit 5: CAPS (caps lock)
 * - Bit 6: FF-D5 (reserved)
 * - Bit 7: FF-D6 (reserved)
 *
 * @param value - Raw port 0xFF value
 * @returns Decoded system control state
 */
export const decodeSysCtrl = (value: number): Tec1gSysCtrlState => {
  const masked = value & 0xff;
  return {
    shadowEnabled: (masked & 0x01) === 0,
    protectEnabled: (masked & 0x02) !== 0,
    expandEnabled: (masked & 0x04) !== 0,
    bankA14: (masked & 0x08) !== 0,
    ffD4: (masked & 0x10) !== 0,
    capsLock: (masked & 0x20) !== 0,
    ffD5: (masked & 0x40) !== 0,
    ffD6: (masked & 0x80) !== 0,
  };
};
