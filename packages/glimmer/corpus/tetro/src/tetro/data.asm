; Score delta per line-clear count. Index 0 is unused;
; count 0 skips the lookup.
; counts >=4 clamp to entry 4 ('tetris').
TD_CLRSC:
        DW      0, 100, 300, 500, 800

TD_RWBTT:
        DB      $01
        DB      $02
        DB      $04
        DB      $08
        DB      $10
        DB      $20
        DB      $40
        DB      $80

TD_LCDT0:
        DB      "PRESS ANY KEY",0

TD_LCDTX:
        DB      "NEXT: ",0

TD_LCDT7:
        DB      "TETRO RUNNING",0

TD_LCDT6:
        DB      "TETRO PAUSED",0

TD_LCDT5:
        DB      "TETRO GAME OVER",0

; LcdScript tables: null-terminated (DB row_cmd,
; DW text_ptr)+ DB 0
; HUD scripts leave the cursor at end of "NEXT: "
; on row 2 so the wrapper
; can append the dynamic preview letter via
; LcdAppendPrev.
TD_SCRPT:
        DB      LcdRow1
        DW      TD_LCDT5
        DB      LcdRow2
        DW      TD_LCDT0
        DB      0

TD_SCRP0:
        DB      LcdRow1
        DW      TD_LCDT6
        DB      LcdRow2
        DW      TD_LCDTX
        DB      0

TD_SCRP2:
        DB      LcdRow1
        DW      TD_LCDT1
        DB      LcdRow2
        DW      TD_LCDT2
        DB      LcdRow3
        DW      TD_LCDT3
        DB      LcdRow4
        DW      TD_LCDT4
        DB      0

TD_SCRP1:
        DB      LcdRow1
        DW      TD_LCDT7
        DB      LcdRow2
        DW      TD_LCDTX
        DB      0

TD_PCNMT:
        DB      'I','O','T','S','Z','J','L'

TD_LCDT1:
        DB      "TETRO (PRESS A KEY)",0

TD_LCDT2:
        DB      "< > MOVE",0

TD_LCDT3:
        DB      "AD/C ROTATE",0

TD_LCDT4:
        DB      "GO DROP 0 PAUSE",0

; Default 3x3-scale piece set with precomputed
; clockwise rotations.
; Shapes are centered in a 3x3 local frame where
; practical; the engine still
; stores them as 4 row bytes and shifts them
; horizontally at runtime.
PieceIR0:
        DB      %00000000
        DB      %11100000
        DB      %00000000
        DB      %00000000
PieceIR1:
        DB      %10000000
        DB      %10000000
        DB      %10000000
        DB      %00000000
PieceIR2             EQU PieceIR0
PieceIR3             EQU PieceIR1

PieceOR0:
        DB      %11000000
        DB      %11000000
        DB      %00000000
        DB      %00000000
PieceOR1            EQU PieceOR0
PieceOR2            EQU PieceOR0
PieceOR3            EQU PieceOR0

PieceTR0:
        DB      %11100000
        DB      %01000000
        DB      %00000000
        DB      %00000000
PieceTR1:
        DB      %10000000
        DB      %11000000
        DB      %10000000
        DB      %00000000
PieceTR2:
        DB      %00000000
        DB      %01000000
        DB      %11100000
        DB      %00000000
PieceTR3:
        DB      %01000000
        DB      %11000000
        DB      %01000000
        DB      %00000000

; S/Z and J/L were previously swapped vs SRS
; lettering (same MSB-left row bytes,
; but labels did not match the canonical shapes
; named on LCD / previews).
PieceSR0:
        DB      %11000000
        DB      %01100000
        DB      %00000000
        DB      %00000000
PieceSR1:
        DB      %01000000
        DB      %11000000
        DB      %10000000
        DB      %00000000
PieceSR2:
        DB      %00000000
        DB      %11000000
        DB      %01100000
        DB      %00000000
PieceSR3            EQU PieceSR1

PieceZR0:
        DB      %01100000
        DB      %11000000
        DB      %00000000
        DB      %00000000
PieceZR1:
        DB      %10000000
        DB      %11000000
        DB      %01000000
        DB      %00000000
PieceZR2:
        DB      %00000000
        DB      %01100000
        DB      %11000000
        DB      %00000000
PieceZR3            EQU PieceZR1

PieceJR0:
        DB      %00100000
        DB      %11100000
        DB      %00000000
        DB      %00000000
PieceJR1:
        DB      %10000000
        DB      %10000000
        DB      %11000000
        DB      %00000000
PieceJR2:
        DB      %00000000
        DB      %11100000
        DB      %10000000
        DB      %00000000
PieceJR3:
        DB      %11000000
        DB      %01000000
        DB      %01000000
        DB      %00000000

PieceLR0:
        DB      %10000000
        DB      %11100000
        DB      %00000000
        DB      %00000000
PieceLR1:
        DB      %11000000
        DB      %10000000
        DB      %10000000
        DB      %00000000
PieceLR2:
        DB      %00000000
        DB      %11100000
        DB      %00100000
        DB      %00000000
PieceLR3:
        DB      %01000000
        DB      %01000000
        DB      %11000000
        DB      %00000000

TD_PCPTR:
        DW      PieceIR0, PieceIR1, PieceIR2, PieceIR3
        DW      PieceOR0, PieceOR1, PieceOR2, PieceOR3
        DW      PieceTR0, PieceTR1, PieceTR2, PieceTR3
        DW      PieceSR0, PieceSR1, PieceSR2, PieceSR3
        DW      PieceZR0, PieceZR1, PieceZR2, PieceZR3
        DW      PieceJR0, PieceJR1, PieceJR2, PieceJR3
        DW      PieceLR0, PieceLR1, PieceLR2, PieceLR3

TD_PCRGH:
        DB      2,0,2,0
        DB      1,1,1,1
        DB      2,1,2,1
        DB      2,1,2,1
        DB      2,1,2,1
        DB      2,1,2,1
        DB      2,1,2,1

TD_PCCLR:
        DB      SC_CLRCY ; I = cyan
        DB      SC_CLRWH ; O  = white
        DB      SC_CLRMG ; T  = magenta
        DB      SC_CLRGR ; S  = green
        DB      ColorRed ; Z  = red
        DB      SC_CLRB0 ; J  = blue
        DB      SC_CLRYL ; L  = yellow
