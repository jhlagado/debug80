/**
 * @file DS1302 RTC bit-bang emulation.
 */

type Ds1302Mode = 'idle' | 'command' | 'read' | 'write';

const CE_BIT = 0x10;
const CLK_BIT = 0x40;
const IO_BIT = 0x01;
const REGISTER_COUNT = 0x20;

/**
 * Minimal DS1302 bit-bang implementation.
 */
export class Ds1302 {
  private registers = new Uint8Array(REGISTER_COUNT);
  private ce = false;
  private clk = false;
  private ioOut = 1;
  private mode: Ds1302Mode = 'idle';
  private bitIndex = 0;
  private command = 0;
  private address = 0;
  private dataShift = 0;

  /**
   * Writes a new IO bus value (bit-bang).
   */
  write(value: number): void {
    const nextCe = (value & CE_BIT) !== 0;
    const nextClk = (value & CLK_BIT) !== 0;
    const ioIn = (value & IO_BIT) !== 0 ? 1 : 0;

    if (!nextCe) {
      this.resetTransaction();
      this.ce = false;
      this.clk = nextClk;
      return;
    }

    if (!this.ce && nextCe) {
      this.beginTransaction();
    }

    if (!this.clk && nextClk) {
      this.handleClockRise(ioIn);
    }

    this.ce = nextCe;
    this.clk = nextClk;
  }

  /**
   * Reads the current data line bit.
   */
  read(): number {
    return this.ioOut & 0x01;
  }

  private beginTransaction(): void {
    this.mode = 'command';
    this.bitIndex = 0;
    this.command = 0;
    this.dataShift = 0;
    this.address = 0;
    this.ioOut = 1;
    this.ce = true;
  }

  private resetTransaction(): void {
    this.mode = 'idle';
    this.bitIndex = 0;
    this.command = 0;
    this.dataShift = 0;
    this.address = 0;
    this.ioOut = 1;
  }

  private handleClockRise(ioIn: number): void {
    if (this.mode === 'command') {
      this.command |= (ioIn & 0x01) << this.bitIndex;
      this.bitIndex += 1;
      if (this.bitIndex >= 8) {
        this.address = (this.command >> 1) & 0x1f;
        const readMode = (this.command & 0x01) !== 0;
        this.bitIndex = 0;
        this.dataShift = 0;
        this.command = 0;
        if (readMode) {
          this.mode = 'read';
          this.dataShift = this.registers[this.address] ?? 0;
        } else {
          this.mode = 'write';
        }
      }
      return;
    }

    if (this.mode === 'write') {
      this.dataShift |= (ioIn & 0x01) << this.bitIndex;
      this.bitIndex += 1;
      if (this.bitIndex >= 8) {
        this.registers[this.address] = this.dataShift & 0xff;
        this.mode = 'command';
        this.bitIndex = 0;
        this.dataShift = 0;
      }
      return;
    }

    if (this.mode === 'read') {
      const bit = (this.dataShift >> this.bitIndex) & 0x01;
      this.ioOut = bit;
      this.bitIndex += 1;
      if (this.bitIndex >= 8) {
        this.mode = 'command';
        this.bitIndex = 0;
        this.ioOut = 1;
      }
    }
  }
}
