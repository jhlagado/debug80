; Scan eight solid rows in distinct colours on the TEC-1G RGB matrix.

        ORG     $4000

PORT_ROW        EQU     $05
PORT_RED        EQU     $06
P_GREEN         EQU     $F8
P_BLUE          EQU     $F9
ROWS            EQU     8
DWELL           EQU     $20

;@ROUTINE clobbers A,B,C,D,HL,F
Start:
        xor     a
        out     (PORT_ROW),a
        out     (PORT_RED),a
        out     (P_GREEN),a
        out     (P_BLUE),a

.Frame:
        ld      hl,ROW_COLS
        ld      d,$01
        ld      c,ROWS

.Row:
        xor     a
        out     (PORT_ROW),a

        ld      a,(hl)
        out     (PORT_RED),a
        inc     hl
        ld      a,(hl)
        out     (P_GREEN),a
        inc     hl
        ld      a,(hl)
        out     (P_BLUE),a
        inc     hl

        ld      a,d
        out     (PORT_ROW),a
        ld      b,DWELL
.Dwell:
        djnz    .Dwell

        xor     a
        out     (PORT_ROW),a
        ld      a,d
        rlc     a
        ld      d,a
        dec     c
        jp      nz,.Row
        jp      .Frame

ROW_COLS:
        DB      $FF,$00,$00
        DB      $00,$FF,$00
        DB      $00,$00,$FF
        DB      $FF,$FF,$00
        DB      $FF,$00,$FF
        DB      $00,$FF,$FF
        DB      $FF,$FF,$FF
        DB      $55,$55,$55
