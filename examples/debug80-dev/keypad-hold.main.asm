; Hold any TEC-1G keypad key to light all six seven-segment digits.
; Releasing the key blanks the display. This polls the hardware keypad latch
; directly, so it tests key-down and key-up without MON-3 key buffering.

        .org    0x4000

PORT_KEY        .equ    0x00
PORT_DIG        .equ    0x01
PORT_SEG        .equ    0x02
NO_KEY          .equ    0x7f
ALL_DIG         .equ    0x3f
ALL_SEG         .equ    0x7f

.routine clobbers A,F
Start:
        xor     a
        out     (PORT_DIG),a
        out     (PORT_SEG),a

_Poll:
        in      a,(PORT_KEY)
        and     0x7f
        cp      NO_KEY
        jp      z,_Released

_Held:
        ld      a,ALL_SEG
        out     (PORT_SEG),a
        ld      a,ALL_DIG
        out     (PORT_DIG),a
        jp      _Poll

_Released:
        xor     a
        out     (PORT_DIG),a
        out     (PORT_SEG),a
        jp      _Poll
