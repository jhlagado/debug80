/**
 * @fileoverview TEC-1G system control register decoder.
 * Port 0xFF controls memory mapping and protection features.
 */

/**
 * Decoded state of the TEC-1G system control register (port 0xFF).
 */
export type Tec1gSysCtrlState = {
  /** Shadow ROM enabled (bit 0 = 0) - mirrors ROM from 0xC000 to 0x0000 */
  shadowEnabled: boolean;
  /** Write protection enabled (bit 1 = 1) - protects low memory */
  protectEnabled: boolean;
  /** Memory expansion enabled (bit 2 = 1) - enables banked RAM */
  expandEnabled: boolean;
};

/**
 * Decodes the TEC-1G system control register value.
 *
 * Bit layout:
 * - Bit 0: Shadow ROM (0 = enabled, 1 = disabled)
 * - Bit 1: Write protect (0 = disabled, 1 = enabled)
 * - Bit 2: Expand enable (0 = disabled, 1 = enabled)
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
  };
};
