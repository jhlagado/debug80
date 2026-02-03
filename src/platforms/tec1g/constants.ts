/**
 * @file TEC-1G hardware constants.
 * @fileoverview
 */

// ===== I/O Ports =====
/** Keyboard scan port (active-low, returns key + serial RX). */
export const TEC1G_PORT_KEYBOARD = 0x00;
/** 7-seg digit latch + speaker/serial control. */
export const TEC1G_PORT_DIGIT = 0x01;
/** 7-seg segment latch. */
export const TEC1G_PORT_SEGMENT = 0x02;
/** Status input (shift/protect/expand/etc). */
export const TEC1G_PORT_STATUS = 0x03;
/** LCD command register (HD44780). */
export const TEC1G_PORT_LCD_CMD = 0x04;
/** Matrix keyboard row strobe. */
export const TEC1G_PORT_MATRIX_STROBE = 0x05;
/** Matrix keyboard latch. */
export const TEC1G_PORT_MATRIX_LATCH = 0x06;
/** GLCD command register (ST7920). */
export const TEC1G_PORT_GLCD_CMD = 0x07;
/** LCD data register. */
export const TEC1G_PORT_LCD_DATA = 0x84;
/** GLCD data register. */
export const TEC1G_PORT_GLCD_DATA = 0x87;
/** DS1302 RTC data port. */
export const TEC1G_PORT_RTC = 0xfc;
/** SD SPI data port. */
export const TEC1G_PORT_SD = 0xfd;
/** Matrix keyboard read port (row in high byte). */
export const TEC1G_PORT_MATRIX = 0xfe;
/** System control port (shadow/protect/expand/bank/caps). */
export const TEC1G_PORT_SYSCTRL = 0xff;

// ===== Status Register Bits =====
export const TEC1G_STATUS_SHIFT = 0x01;
export const TEC1G_STATUS_PROTECT = 0x02;
export const TEC1G_STATUS_EXPAND = 0x04;
export const TEC1G_STATUS_CARTRIDGE = 0x08;
export const TEC1G_STATUS_RAW_KEY = 0x10;
export const TEC1G_STATUS_GIMP = 0x20;
export const TEC1G_STATUS_NO_KEY = 0x40;
export const TEC1G_STATUS_SERIAL_RX = 0x80;

// ===== Digit Latch Bits =====
export const TEC1G_DIGIT_SPEAKER = 0x80;
export const TEC1G_DIGIT_SERIAL_TX = 0x40;
