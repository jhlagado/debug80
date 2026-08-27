; Hold any TEC-1G keypad key to show an LCD marker.
; Releasing the key removes it. This polls the hardware keypad latch directly,
; so it tests key-down and key-up without MON-3 key buffering.
; MON-3 initializes the LCD and stack before launching this program.

        ORG     $4000

PORT_KEY        EQU     $00
LCD_CMD         EQU     $04
LCD_DATA        EQU     $84
NO_KEY          EQU     $7F
LCD_CLR         EQU     $01
LCD_MARK        EQU     $8A
NO_STATE        EQU     $FF
CHAR_OFF        EQU     $20
CHAR_ON         EQU     $2A

;@ROUTINE clobbers A,B,HL,F
Start:
        ld      a,LCD_CLR
        call    WriteCmd

        ld      hl,TITLE
.PutTitle:
        ld      a,(hl)
        inc     hl
        or      a
        jp      z,.Ready
        call    PutData
        jp      .PutTitle

.Ready:
        ld      b,NO_STATE

.Poll:
        in      a,(PORT_KEY)
        and     $7F
        cp      NO_KEY
        ld      a,CHAR_OFF
        jp      z,.StateRdy
        ld      a,CHAR_ON

.StateRdy:
        cp      b
        jp      z,.Poll
        ld      b,a

        push    af
        ld      a,LCD_MARK
        call    WriteCmd
        pop     af
        call    PutData
        jp      .Poll

;@ROUTINE in A
WriteCmd:
        push    af
        call    WaitLcd
        pop     af
        out     (LCD_CMD),a
        ret

;@ROUTINE in A
PutData:
        push    af
        call    WaitLcd
        pop     af
        out     (LCD_DATA),a
        ret

;@ROUTINE clobbers A,F
WaitLcd:
        in      a,(LCD_CMD)
        rlca
        jp      c,WaitLcd
        ret

TITLE:
        DB      "KEY DOWN: ",0
