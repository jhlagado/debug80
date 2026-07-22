; Hold any TEC-1G keypad key to illuminate every seven-segment LED.
; Releasing the key blanks the display. Each lit pass scans all six digits,
; exercising the same multiplexing required by the physical display.

        .org    0x4000

PORT_KEY        .equ    0x00
PORT_DIG        .equ    0x01
PORT_SEG        .equ    0x02
NO_KEY          .equ    0x7f
ALL_SEGMENTS    .equ    0xff
DIGIT_COUNT     .equ    6
DWELL           .equ    0x40

.routine clobbers A,B,C,D,F
Start:
_Poll:
        in      a,(PORT_KEY)
        and     0x7f
        cp      NO_KEY
        jp      nz,_Scan

        xor     a
        out     (PORT_DIG),a
        out     (PORT_SEG),a
        jp      _Poll

_Scan:
        ld      a,ALL_SEGMENTS
        out     (PORT_SEG),a
        ld      d,0x01
        ld      b,DIGIT_COUNT

_Digit:
        ld      a,d
        out     (PORT_DIG),a

        ld      c,DWELL
_Dwell:
        dec     c
        jp      nz,_Dwell

        xor     a
        out     (PORT_DIG),a
        sla     d
        djnz    _Digit
        jp      _Poll
