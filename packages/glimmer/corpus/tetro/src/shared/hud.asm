; Generic seven-segment HUD scan helpers.

; HudScanDig —
; Strobe one seven-segment digit.
; Clears PortDigits first to suppress ghosting,
; outputs the segment byte from HudSegBuffer,
; then asserts the digit-select bit from
; HudMaskTbl. Advances HudScanIndex 0..5,
; wrapping to 0 after digit 5.
;!      out       carry,zero
;!      clobbers  A,BC,DE,HL
SH_HDSCN:
        LD      A,(CM_HDSCN)
        LD      C,A
        LD      A,(CM_SPKRP)
        OUT     (SC_PRTDG),A
        LD      A,C
        LD      L,A
        LD      H,0
        LD      DE,CM_HDSGB
        ADD     HL,DE
        LD      A,(HL)
        OUT     (PortSegs),A

        LD      A,C
        LD      L,A
        LD      H,0
        LD      DE,SH_HDMSK
        ADD     HL,DE
        LD      A,(HL)
        LD      B,A
        LD      A,(CM_SPKRP)
        OR      B
        OUT     (SC_PRTDG),A

        LD      A,C
        INC     A
        CP      6
        JR      C,SH_HDSC0
        XOR     A
SH_HDSC0:
        LD      (CM_HDSCN),A
        RET

; HudBlankDig —
; Zero all six bytes of HudSegBuffer.
;!      clobbers  A,B,HL
SH_HDBLN:
        LD      HL,CM_HDSGB
        LD      B,6
        XOR     A
SH_HDBL0:
        LD      (HL),A
        INC     HL
        DJNZ    SH_HDBL0
        RET

; HudWriteU16 —
; Encode a 16-bit value as decimal into
; HudSegBuffer. HL contains the value.
; Slot 0 always shows the zero glyph; slots 1–5
; hold the 10000, 1000, 100, 10, and 1 digits.
;!      in        HL
;!      out       BC,HL
;!      clobbers  A,DE
SH_HDWRT:
        LD      A,(SH_HDGLY)
        LD      (CM_HDSGB),A
        LD      BC,CM_HDSGB + 1

        LD      DE,$2710 ; 10000
        CALL    SH_HDDCD
        LD      DE,$03E8 ; 1000
        CALL    SH_HDDCD
        LD      DE,$0064 ; 100
        CALL    SH_HDDCD
        LD      DE,$000A ; 10
        CALL    SH_HDDCD
        LD      DE,$0001 ; 1
        CALL    SH_HDDCD
        RET

; HudDecDigit —
; Extract one decimal place-value digit from HL.
; HL contains the remaining value. DE contains the
; place value. BC points to the output slot. The
; glyph is written to (BC), BC advances to the next
; slot, and the reduced remainder is returned in HL.
;!      in        HL,DE,BC
;!      out       BC,HL
;!      clobbers  A,DE
SH_HDDCD:
        XOR     A
HudDecLp:
        PUSH    AF
        LD      A,H
        CP      D
        JR      C,SH_HDDC0
        JR      NZ,SH_HDDCS
        LD      A,L
        CP      E
        JR      C,SH_HDDC0
SH_HDDCS:
        POP     AF
        OR      A
        SBC     HL,DE
        INC     A
        JR      HudDecLp
SH_HDDC0:
        POP     AF
        PUSH    HL
        PUSH    BC
        LD      L,A
        LD      H,0
        LD      DE,SH_HDGLY
        ADD     HL,DE
        LD      A,(HL)
        POP     BC
        LD      (BC),A
        INC     BC
        POP     HL
        RET

SH_HDMSK:
        DB      $20
        DB      $10
        DB      $08
        DB      $04
        DB      $02
        DB      $01

SH_HDGLY:
        DB      $EB
        DB      $28
        DB      $CD
        DB      $AD
        DB      $2E
        DB      $A7
        DB      $E7
        DB      $29
        DB      $EF
        DB      $2F
        DB      $6F
        DB      $E6
        DB      $C3
        DB      $EC
        DB      $C7
        DB      $47
