; Multiplex six distinct glyphs across the TEC-1G seven-segment display.

        ORG     $4000

PORT_DIG        EQU     $01
PORT_SEG        EQU     $02
DIGITS          EQU     6
DWELL           EQU     $40

;@ROUTINE clobbers A,B,C,DE,HL,F
Start:
.Frame:
        ld      hl,SEG_DATA
        ld      de,DIGMASK
        ld      b,DIGITS

.Digit:
        xor     a
        out     (PORT_DIG),a
        ld      a,(hl)
        out     (PORT_SEG),a
        inc     hl
        ld      a,(de)
        out     (PORT_DIG),a
        inc     de

        ld      c,DWELL
.Dwell:
        dec     c
        jp      nz,.Dwell
        djnz    .Digit
        jp      .Frame

SEG_DATA:
        DB      $3F,$06,$5B,$4F,$66,$6D

DIGMASK:
        DB      $01,$02,$04,$08,$10,$20
