; Scan eight solid rows in distinct colours on the TEC-1G RGB matrix.

        .org    0x4000

PORT_ROW        .equ    0x05
PORT_RED        .equ    0x06
PORT_GREEN      .equ    0xf8
PORT_BLUE       .equ    0xf9
ROW_COUNT       .equ    8
DWELL           .equ    0x20

.routine clobbers A,B,C,D,HL,F
Start:
        xor     a
        out     (PORT_ROW),a
        out     (PORT_RED),a
        out     (PORT_GREEN),a
        out     (PORT_BLUE),a

_Frame:
        ld      hl,ROW_COLS
        ld      d,0x01
        ld      c,ROW_COUNT

_Row:
        xor     a
        out     (PORT_ROW),a

        ld      a,(hl)
        out     (PORT_RED),a
        inc     hl
        ld      a,(hl)
        out     (PORT_GREEN),a
        inc     hl
        ld      a,(hl)
        out     (PORT_BLUE),a
        inc     hl

        ld      a,d
        out     (PORT_ROW),a
        ld      b,DWELL
_Dwell:
        djnz    _Dwell

        xor     a
        out     (PORT_ROW),a
        ld      a,d
        rlc     a
        ld      d,a
        dec     c
        jp      nz,_Row
        jp      _Frame

ROW_COLS:
        .db     0xff,0x00,0x00
        .db     0x00,0xff,0x00
        .db     0x00,0x00,0xff
        .db     0xff,0xff,0x00
        .db     0xff,0x00,0xff
        .db     0x00,0xff,0xff
        .db     0xff,0xff,0xff
        .db     0x55,0x55,0x55
