; Multiplex six distinct glyphs across the TEC-1G seven-segment display.

        .org    0x4000

PORT_DIG        .equ    0x01
PORT_SEG        .equ    0x02
DIG_COUNT       .equ    6
DWELL           .equ    0x40

.routine clobbers A,B,C,DE,HL,F
Start:
_Frame:
        ld      hl,SEG_DATA
        ld      de,DIG_MASKS
        ld      b,DIG_COUNT

_Digit:
        xor     a
        out     (PORT_DIG),a
        ld      a,(hl)
        out     (PORT_SEG),a
        inc     hl
        ld      a,(de)
        out     (PORT_DIG),a
        inc     de

        ld      c,DWELL
_Dwell:
        dec     c
        jp      nz,_Dwell
        djnz    _Digit
        jp      _Frame

SEG_DATA:
        .db     0x3f,0x06,0x5b,0x4f,0x66,0x6d

DIG_MASKS:
        .db     0x01,0x02,0x04,0x08,0x10,0x20
