/**
 * @file SD card SPI bit-bang emulation (TEC-1G port 0xFD).
 */

type SdCommand = {
  cmd: number;
  arg: number;
  crc: number;
};

export type SdSpiOptions = {
  csMask?: number;
  csActiveLow?: boolean;
};

const MOSI_BIT = 0x01;
const CLK_BIT = 0x02;
const DEFAULT_CS_MASK = 0x04;

/**
 * Bit-banged SD card SPI helper for port 0xFD.
 */
export class SdSpi {
  private csMask: number;
  private csActiveLow: boolean;
  private csActive = false;
  private clk = false;
  private inShift = 0;
  private inBitIndex = 0;
  private outShift = 0xff;
  private outBitIndex = 0;
  private ioOut = 1;
  private commandBytes: number[] = [];
  private lastCommand: SdCommand | undefined;
  private outputQueue: number[] = [];

  /**
   * Creates a new SD SPI bit-bang helper.
   */
  public constructor(options: SdSpiOptions = {}) {
    this.csMask = options.csMask ?? DEFAULT_CS_MASK;
    this.csActiveLow = options.csActiveLow !== false;
  }

  /**
   * Writes a new bus value to the SPI bit-bang interface.
   */
  public write(value: number): void {
    const nextClk = (value & CLK_BIT) !== 0;
    const csLineHigh = (value & this.csMask) !== 0;
    const nextCsActive = this.csActiveLow ? !csLineHigh : csLineHigh;

    if (!nextCsActive) {
      this.resetTransaction();
      this.csActive = false;
      this.clk = nextClk;
      return;
    }

    if (!this.csActive && nextCsActive) {
      this.beginTransaction();
    }

    if (!this.clk && nextClk) {
      const bit = (value & MOSI_BIT) !== 0 ? 1 : 0;
      this.shiftIn(bit);
      this.shiftOut();
    }

    this.csActive = nextCsActive;
    this.clk = nextClk;
  }

  /**
   * Reads the current MISO bit (LSB).
   */
  public read(): number {
    if (!this.csActive) {
      return 0xff;
    }
    return this.ioOut & 0x01;
  }

  /**
   * Returns the last parsed command frame, if any.
   */
  public getLastCommand(): SdCommand | undefined {
    return this.lastCommand;
  }

  private beginTransaction(): void {
    this.inShift = 0;
    this.inBitIndex = 0;
    this.outShift = 0xff;
    this.outBitIndex = 0;
    this.ioOut = 1;
    this.commandBytes = [];
    this.outputQueue = [];
    this.lastCommand = undefined;
    this.csActive = true;
  }

  private resetTransaction(): void {
    this.inShift = 0;
    this.inBitIndex = 0;
    this.outShift = 0xff;
    this.outBitIndex = 0;
    this.ioOut = 1;
    this.commandBytes = [];
    this.outputQueue = [];
    this.lastCommand = undefined;
  }

  private shiftIn(bit: number): void {
    this.inShift |= (bit & 0x01) << this.inBitIndex;
    this.inBitIndex += 1;
    if (this.inBitIndex >= 8) {
      this.commandBytes.push(this.inShift & 0xff);
      if (this.commandBytes.length >= 6) {
        this.captureCommand();
        this.commandBytes = [];
      }
      this.inShift = 0;
      this.inBitIndex = 0;
    }
  }

  private shiftOut(): void {
    this.ioOut = (this.outShift >> this.outBitIndex) & 0x01;
    this.outBitIndex += 1;
    if (this.outBitIndex >= 8) {
      this.outBitIndex = 0;
      this.outShift = this.outputQueue.shift() ?? 0xff;
    }
  }

  private captureCommand(): void {
    const [cmd, a3, a2, a1, a0, crc] = this.commandBytes;
    if (
      cmd === undefined ||
      a3 === undefined ||
      a2 === undefined ||
      a1 === undefined ||
      a0 === undefined ||
      crc === undefined
    ) {
      return;
    }
    if ((cmd & 0xc0) !== 0x40) {
      return;
    }
    const arg = ((a3 << 24) | (a2 << 16) | (a1 << 8) | a0) >>> 0;
    this.lastCommand = { cmd: cmd & 0x3f, arg, crc };
  }
}
