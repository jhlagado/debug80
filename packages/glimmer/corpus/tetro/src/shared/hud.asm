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
@HudScanDig:
        LD      A,(HudScanIndex)
        LD      C,A
        LD      A,(SpeakerPort)
        OUT     (PortDigits),A
        LD      A,C
        LD      L,A
        LD      H,0
        LD      DE,HudSegBuffer
        ADD     HL,DE
        LD      A,(HL)
        OUT     (PortSegs),A

        LD      A,C
        LD      L,A
        LD      H,0
        LD      DE,HudMaskTbl
        ADD     HL,DE
        LD      A,(HL)
        LD      B,A
        LD      A,(SpeakerPort)
        OR      B
        OUT     (PortDigits),A

        LD      A,C
        INC     A
        CP      6
        JR      C,HudScanSave
        XOR     A
HudScanSave:
        LD      (HudScanIndex),A
        RET

; HudBlankDig —
; Zero all six bytes of HudSegBuffer.
;!      clobbers  A,B,HL
@HudBlankDig:
        LD      HL,HudSegBuffer
        LD      B,6
        XOR     A
HudBlankLp:
        LD      (HL),A
        INC     HL
        DJNZ    HudBlankLp
        RET

; HudWriteU16 —
; Encode a 16-bit value as decimal into
; HudSegBuffer. HL contains the value.
; Slot 0 always shows the zero glyph; slots 1–5
; hold the 10000, 1000, 100, 10, and 1 digits.
;!      in        HL
;!      out       BC,HL
;!      clobbers  A,DE
@HudWriteU16:
        LD      A,(HudGlyphTbl)
        LD      (HudSegBuffer),A
        LD      BC,HudSegBuffer + 1

        LD      DE,0x2710      ; 10000
        CALL    HudDecDigit
        LD      DE,0x03E8      ; 1000
        CALL    HudDecDigit
        LD      DE,0x0064      ; 100
        CALL    HudDecDigit
        LD      DE,0x000A      ; 10
        CALL    HudDecDigit
        LD      DE,0x0001      ; 1
        CALL    HudDecDigit
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
@HudDecDigit:
        XOR     A
HudDecLp:
        PUSH    AF
        LD      A,H
        CP      D
        JR      C,HudDecDone
        JR      NZ,HudDecSub
        LD      A,L
        CP      E
        JR      C,HudDecDone
HudDecSub:
        POP     AF
        OR      A
        SBC     HL,DE
        INC     A
        JR      HudDecLp
HudDecDone:
        POP     AF
        PUSH    HL
        PUSH    BC
        LD      L,A
        LD      H,0
        LD      DE,HudGlyphTbl
        ADD     HL,DE
        LD      A,(HL)
        POP     BC
        LD      (BC),A
        INC     BC
        POP     HL
        RET

HudMaskTbl:
        .db      0x20
        .db      0x10
        .db      0x08
        .db      0x04
        .db      0x02
        .db      0x01

HudGlyphTbl:
        .db      0xEB
        .db      0x28
        .db      0xCD
        .db      0xAD
        .db      0x2E
        .db      0xA7
        .db      0xE7
        .db      0x29
        .db      0xEF
        .db      0x2F
        .db      0x6F
        .db      0xE6
        .db      0xC3
        .db      0xEC
        .db      0xC7
        .db      0x47
