; LcdShowGOver —
; Show the game-over LCD script.
; No NEXT preview row is appended.
;!      out       carry
;!      clobbers  A,HL
TU_LCDSH:
        LD      HL,TD_SCRPT
        JP      SL_LCDS0

; LcdShowPaused —
; Show the PAUSED HUD; falls into LcdShowHud
; which appends the NEXT preview on row 2.
;!      out       HL
TU_LCDS1:
        LD      HL,TD_SCRP0
        JR      TU_LCDS0

; LcdShowSplash —
; Show the splash screen with control hints.
; LcdScript's carry result is not Tetro status.
;!      out       carry
;!      clobbers  A,HL
TU_LCDS3:
        LD      HL,TD_SCRP2
        JP      SL_LCDS0

; LcdAppendPrev —
; Emit the NextPieceIndex letter glyph to the LCD.
; The LCD cursor is positioned after the NEXT: banner.
;!      clobbers  A,DE,HL
TU_LCDPP:
        LD      A,(TW_NXTPC)
        LD      DE,TD_PCNMT
        JP      SL_LCDPT

; LcdRefNextPrev —
; Rewrite row 2 NEXT: label plus preview letter.
; Row 1 is left untouched.
;!      clobbers  A,DE
TU_LCDRF:
        PUSH    BC
        PUSH    HL
        LD      B,LcdRow2
        LD      HL,TD_LCDTX
        CALL    SL_LCDRW
        CALL    TU_LCDPP
        POP     HL
        POP     BC
        RET

; LcdShowRunning —
; Show the running HUD; falls through to
; LcdShowHud, which appends the NEXT preview.
;!      out       HL
;!      clobbers  A
TU_LCDS2:
        LD      HL,TD_SCRP1
        ; fall through

; LcdShowHud —
; Shared tail: run LcdScript then append NEXT
; preview letter on row 2.
TU_LCDS0:
        PUSH    BC
        PUSH    DE
        PUSH    HL
        CALL    SL_LCDS0
        CALL    TU_LCDPP
        POP     HL
        POP     DE
        POP     BC
        RET
