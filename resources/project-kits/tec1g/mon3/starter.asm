; Debug80 starter (TEC-1G / MON-3)
; Prints a message on the LCD, then continuously scans "HELLO" on the
; six-digit seven-segment display.

api_scan_segments       .equ 10
api_string_to_lcd       .equ 13
api_command_to_lcd      .equ 15

lcd_clear               .equ 0x01
lcd_row1                .equ 0x80

        ORG 0x4000

start:
        ld      sp,0x7fff

        ld      b,lcd_clear
        ld      c,api_command_to_lcd
        rst     0x10

        ld      b,lcd_row1
        ld      c,api_command_to_lcd
        rst     0x10
        ld      hl,lcd_line1
        ld      c,api_string_to_lcd
        rst     0x10

scan_hello:
        ld      de,seven_seg_hello
        ld      c,api_scan_segments
        rst     0x10
        jr      scan_hello

lcd_line1:
        .db     "Debug80 TEC-1G",0

; MON-3 seven-segment character codes for "HELLO ".
seven_seg_hello:
        .db     0x6e,0xc7,0xc2,0xc2,0xeb,0x00
