; Debug80 starter (TEC-1G / MON-3)
; Prints a message on the LCD, then continuously scans "HELLO " on the
; six-digit seven-segment display.

API_SCAN_SEGMENTS       .equ 10
API_STRING_TO_LCD       .equ 13
API_COMMAND_TO_LCD      .equ 15

LCD_CLEAR               .equ 0x01
LCD_ROW1                .equ 0x80

        .org    0x4000

Start:
        LD      B,LCD_CLEAR
        LD      C,API_COMMAND_TO_LCD
        RST     0x10

        LD      B,LCD_ROW1
        LD      C,API_COMMAND_TO_LCD
        RST     0x10

        LD      HL,LcdLine1
        LD      C,API_STRING_TO_LCD
        RST     0x10

ScanHello:
        LD      DE,SevenSegHello
        LD      C,API_SCAN_SEGMENTS
        RST     0x10
        JR      ScanHello

LcdLine1:
        .db     "Debug80 TEC-1G",0

; MON-3 seven-segment character codes for "HELLO ".
SevenSegHello:
        .db     0x6e,0xc7,0xc2,0xc2,0xeb,0x00
