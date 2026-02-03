/**
 * @file TEC-1G hardware constants.
 * @fileoverview
 */

export const TEC1G_PORT_KEYBOARD = 0x00;
export const TEC1G_PORT_DIGIT = 0x01;
export const TEC1G_PORT_SEGMENT = 0x02;
export const TEC1G_PORT_STATUS = 0x03;
export const TEC1G_PORT_LCD_CMD = 0x04;
export const TEC1G_PORT_MATRIX_STROBE = 0x05;
export const TEC1G_PORT_MATRIX_LATCH = 0x06;
export const TEC1G_PORT_GLCD_CMD = 0x07;
export const TEC1G_PORT_LCD_DATA = 0x84;
export const TEC1G_PORT_GLCD_DATA = 0x87;
export const TEC1G_PORT_RTC = 0xfc;
export const TEC1G_PORT_SD = 0xfd;
export const TEC1G_PORT_MATRIX = 0xfe;
export const TEC1G_PORT_SYSCTRL = 0xff;

export const TEC1G_STATUS_SHIFT = 0x01;
export const TEC1G_STATUS_PROTECT = 0x02;
export const TEC1G_STATUS_EXPAND = 0x04;
export const TEC1G_STATUS_CARTRIDGE = 0x08;
export const TEC1G_STATUS_RAW_KEY = 0x10;
export const TEC1G_STATUS_GIMP = 0x20;
export const TEC1G_STATUS_NO_KEY = 0x40;
export const TEC1G_STATUS_SERIAL_RX = 0x80;

export const TEC1G_DIGIT_SPEAKER = 0x80;
export const TEC1G_DIGIT_SERIAL_TX = 0x40;
