; TEC-1G 8x8 matrix scan demo (RAM @ 0x4000, MON-3 layout).
; - Target platform: TEC-1G (debug80 "tec1g")
; - Uses the current mono 8x8 ports only:
;     OUT 0x06 = column data latch
;     OUT 0x05 = row select
; - Intentionally rescans every row with a visible delay. That makes it a better
;   baseline for future scan-aware display emulation than a one-shot pattern write.

        ORG     0x4000

PORT_ROW:       EQU     0x05
PORT_DATA:      EQU     0x06
ROW_COUNT:      EQU     8

START:  LD      HL,ROW_DATA
        LD      DE,ROW_MASKS

FRAME:  LD      B,ROW_COUNT
ROWLP:  LD      A,(HL)
        OUT     (PORT_DATA),A
        LD      A,(DE)
        OUT     (PORT_ROW),A
        CALL    DELAY
        INC     HL
        INC     DE
        DJNZ    ROWLP

        LD      HL,ROW_DATA
        LD      DE,ROW_MASKS
        JR      FRAME

; Short single-register delay.
; With B=0xFF this loop runs 255 DJNZ iterations, which is about 0.84 ms
; per row at 4 MHz, or about 6.7 ms per full 8-row frame (~120 Hz).
DELAY:  PUSH    BC
        LD      B,0xFF
D1:     DJNZ    D1
        POP     BC
        RET

; One byte per row. Keep every row different so scan artifacts are easy to spot.
ROW_DATA:
        DB      0x81,0x42,0x24,0x18,0x18,0x24,0x42,0x81

ROW_MASKS:
        DB      0x01,0x02,0x04,0x08,0x10,0x20,0x40,0x80