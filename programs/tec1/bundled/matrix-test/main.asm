; TEC-1 8x8 LED Matrix Test
; Target: TEC-1 platform (ports 0x05 row select, 0x06 data latch)
; Loads at 0x0900 so it is safe for MON-2/JMON RAM layout.
; Run by setting the address to 0x0900 and pressing GO.

        .org 0x0900

PORT_ROW        EQU   0x05
PORT_DATA       EQU   0x06

START:  LD   HL,PATTERN
        LD   DE,ROWMASKS

FRAME:  LD   B,8
ROWLP:  LD   A,(HL)
        OUT  (PORT_DATA),A
        LD   A,(DE)
        OUT  (PORT_ROW),A
        CALL DELAY
        INC  HL
        INC  DE
        DJNZ ROWLP
        LD   HL,PATTERN
        LD   DE,ROWMASKS
        JR   FRAME

DELAY:  LD   B,0x10
D1:     LD   C,0xFF
D2:     DEC  C
        JR   NZ,D2
        DJNZ D1
        RET

; Simple X pattern.
PATTERN:
        DB   0x81,0x42,0x24,0x18,0x18,0x24,0x42,0x81

ROWMASKS:
        DB   0x01,0x02,0x04,0x08,0x10,0x20,0x40,0x80
