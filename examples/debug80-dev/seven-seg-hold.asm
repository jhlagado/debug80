; Hold any TEC-1G keypad key to illuminate every seven-segment LED.
; Releasing the key blanks the display. Each lit pass scans all six digits,
; exercising the same multiplexing required by the physical display.

        ORG     $4000

PORT_KEY        EQU     $00
PORT_DIG        EQU     $01
PORT_SEG        EQU     $02
NO_KEY          EQU     $7F
ALL_SEGS        EQU     $FF
DIGITS          EQU     6
DWELL           EQU     $40

;@ROUTINE clobbers A,B,C,D,F
Start:
        xor     a
        out     (PORT_DIG),a
        out     (PORT_SEG),a

; GO is still held when MON-3 transfers control here. Do not treat that
; launch key as the first test press; arm only after the keypad is idle.
.Arm:
        in      a,(PORT_KEY)
        and     $7F
        cp      NO_KEY
        jp      nz,.Arm

.Poll:
        in      a,(PORT_KEY)
        and     $7F
        cp      NO_KEY
        jp      nz,.Scan
        jp      .Poll

.Scan:
        ld      a,ALL_SEGS
        out     (PORT_SEG),a
        ld      d,$01
        ld      b,DIGITS

.Digit:
        ld      a,d
        out     (PORT_DIG),a

        ld      c,DWELL
.Dwell:
        dec     c
        jp      nz,.Dwell

        xor     a
        out     (PORT_DIG),a
        sla     d
        djnz    .Digit

        in      a,(PORT_KEY)
        and     $7F
        cp      NO_KEY
        jp      nz,.Scan

        xor     a
        out     (PORT_SEG),a
        jp      .Poll
