; Generic HD44780 LCD primitives for the TEC-1G
; MON-3 hardware mapping.

; LcdBusy —
; Spin until the HD44780 busy flag clears.
; AF is preserved with PUSH/POP.
;!      in        A
@LcdBusy:
        PUSH    AF
LcdBusyLp:
        IN      A,(PortLcdInst)
        RLCA
        JR      C,LcdBusyLp
        POP     AF
        RET

; LcdCmd —
; Wait for LCD ready then send B as an
; instruction byte to PortLcdInst.
;!      in        B
@LcdCmd:
        PUSH    AF
        CALL    LcdBusy
        LD      A,B
        OUT     (PortLcdInst),A
        POP     AF
        RET

; LcdClear —
; Send the clear-display command (0x01).
; Cursor homes to position 0 after the command.
; B contains the command byte for LcdCmd.
;!      clobbers  B
@LcdClear:
        LD      B,0x01
        JP      LcdCmd

; LcdString —
; Write a zero-terminated string to the LCD.
; HL points to the string. Writing starts at the
; current LCD cursor and stops after the NUL byte.
;!      in        HL
;!      out       HL,carry
;!      clobbers  A
@LcdString:
        LD      A,(HL)
        INC     HL
        OR      A
        RET     Z
        CALL    LcdBusy
        OUT     (PortLcdData),A
        JR      LcdString

; LcdScript —
; Execute an LCD screen script from ROM.
; Script format: DB row_cmd, DW text_ptr, …,
; terminated by DB 0.
; Clears the display first, then for each entry
; positions the cursor and writes the string.
;!      in        HL
;!      out       carry
;!      clobbers  A
@LcdScript:
        PUSH    BC
        PUSH    DE
        PUSH    HL
        EX      DE,HL                   ; DE = script cursor
        CALL    LcdClear
LcdScrLp:
        LD      A,(DE)                  ; row cmd (0 = end of script)
        OR      A
        JR      Z,LcdScrDone
        LD      B,A
        INC     DE
        CALL    LcdCmd
        LD      A,(DE)                  ; text ptr lo
        LD      L,A
        INC     DE
        LD      A,(DE)                  ; text ptr hi
        LD      H,A
        INC     DE
        CALL    LcdString
        JR      LcdScrLp
LcdScrDone:
        POP     HL
        POP     DE
        POP     BC
        RET

; LcdPutc —
; Write one character to the LCD at the current
; cursor position.
;!      in        A
@LcdPutc:
        PUSH    AF
        CALL    LcdBusy
        POP     AF
        OUT     (PortLcdData),A
        RET

; LcdRowStr —
; Position cursor via DDRAM command in B then
; write the zero-terminated string from HL.
; The updated string pointer is returned in HL.
;!      in        B,HL
;!      out       HL,carry
;!      clobbers  A
@LcdRowStr:
        CALL    LcdCmd
        JP      LcdString

; LcdPutcTbl —
; Write the byte at DE+A to the LCD cursor.
; No bounds check on A.
; A contains the table index; DE points to the table.
;!      in        A,DE
;!      clobbers  A,HL
@LcdPutcTbl:
        LD      L,A
        LD      H,0
        ADD     HL,DE
        LD      A,(HL)
        JP      LcdPutc
