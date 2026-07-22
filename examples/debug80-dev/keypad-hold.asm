; Hold any TEC-1G keypad key to show an LCD marker.
; Releasing the key removes it. This polls the hardware keypad latch directly,
; so it tests key-down and key-up without MON-3 key buffering.
; MON-3 initializes the LCD and stack before launching this program.

        .org    0x4000

PORT_KEY        .equ    0x00
PORT_LCD_CMD    .equ    0x04
PORT_LCD_DATA   .equ    0x84
NO_KEY          .equ    0x7f
LCD_CLEAR       .equ    0x01
LCD_MARK        .equ    0x8a
STATE_NONE      .equ    0xff
CHAR_OFF        .equ    0x20
CHAR_ON         .equ    0x2a

.routine clobbers A,B,HL,F
Start:
        ld      a,LCD_CLEAR
        call    WriteCommand

        ld      hl,TITLE
_WriteTitle:
        ld      a,(hl)
        inc     hl
        or      a
        jp      z,_Ready
        call    WriteData
        jp      _WriteTitle

_Ready:
        ld      b,STATE_NONE

_Poll:
        in      a,(PORT_KEY)
        and     0x7f
        cp      NO_KEY
        ld      a,CHAR_OFF
        jp      z,_StateReady
        ld      a,CHAR_ON

_StateReady:
        cp      b
        jp      z,_Poll
        ld      b,a

        push    af
        ld      a,LCD_MARK
        call    WriteCommand
        pop     af
        call    WriteData
        jp      _Poll

.routine in A
WriteCommand:
        push    af
        call    WaitLcd
        pop     af
        out     (PORT_LCD_CMD),a
        ret

.routine in A
WriteData:
        push    af
        call    WaitLcd
        pop     af
        out     (PORT_LCD_DATA),a
        ret

.routine clobbers A,F
WaitLcd:
        in      a,(PORT_LCD_CMD)
        rlca
        jp      c,WaitLcd
        ret

TITLE:
        .db     "KEY DOWN: ",0
