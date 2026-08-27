; Debug80 starter (TEC-1G / MON-3)
; Prints a message on the LCD, then continuously scans "HELLO " on the
; six-digit seven-segment display.

API_SCAN        EQU     10
API_LSTR        EQU     13
API_LCMD        EQU     15

LCDCLEAR        EQU     01H
LCDROW1         EQU     80H

        ORG     4000H

START:
        LD      B,LCDCLEAR
        LD      C,API_LCMD
        RST     10H

        LD      B,LCDROW1
        LD      C,API_LCMD
        RST     10H

        LD      HL,LCDLINE1
        LD      C,API_LSTR
        RST     10H

SCANLOOP:
        LD      DE,SEVHELLO
        LD      C,API_SCAN
        RST     10H
        JR      SCANLOOP

LCDLINE1:
        DB      "Debug80 TEC-1G",0

; MON-3 seven-segment character codes for "HELLO ".
SEVHELLO:
        DB      6EH,0C7H,0C2H,0C2H,0EBH,00H
