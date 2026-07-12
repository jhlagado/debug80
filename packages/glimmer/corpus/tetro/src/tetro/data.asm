; Score delta per line-clear count. Index 0 is unused;
; count 0 skips the lookup.
; counts >=4 clamp to entry 4 ('tetris').
ClearScoreTbl:
        .dw      0, 100, 300, 500, 800

RowBitTable:
        .db      0x01
        .db      0x02
        .db      0x04
        .db      0x08
        .db      0x10
        .db      0x20
        .db      0x40
        .db      0x80

LcdTextReset:
        .db      "PRESS ANY KEY",0

LcdTextNext:
        .db      "NEXT: ",0

LcdTextTetRun:
        .db      "TETRO RUNNING",0

LcdTextTetPause:
        .db      "TETRO PAUSED",0

LcdTextTetOver:
        .db      "TETRO GAME OVER",0

; LcdScript tables: null-terminated (DB row_cmd,
; DW text_ptr)+ DB 0
; HUD scripts leave the cursor at end of "NEXT: "
; on row 2 so the wrapper
; can append the dynamic preview letter via
; LcdAppendPrev.
ScriptGameOver:
        .db      LcdRow1
        .dw      LcdTextTetOver
        .db      LcdRow2
        .dw      LcdTextReset
        .db      0

ScriptPaused:
        .db      LcdRow1
        .dw      LcdTextTetPause
        .db      LcdRow2
        .dw      LcdTextNext
        .db      0

ScriptSplash:
        .db      LcdRow1
        .dw      LcdTextSplash1
        .db      LcdRow2
        .dw      LcdTextSplash2
        .db      LcdRow3
        .dw      LcdTextSplash3
        .db      LcdRow4
        .dw      LcdTextSplash4
        .db      0

ScriptRunning:
        .db      LcdRow1
        .dw      LcdTextTetRun
        .db      LcdRow2
        .dw      LcdTextNext
        .db      0

PieceNameTable:
        .db      'I','O','T','S','Z','J','L'

LcdTextSplash1:
        .db      "TETRO (PRESS A KEY)",0

LcdTextSplash2:
        .db      "< > MOVE",0

LcdTextSplash3:
        .db      "AD/C ROTATE",0

LcdTextSplash4:
        .db      "GO DROP 0 PAUSE",0

; Default 3x3-scale piece set with precomputed
; clockwise rotations.
; Shapes are centered in a 3x3 local frame where
; practical; the engine still
; stores them as 4 row bytes and shifts them
; horizontally at runtime.
PieceIR0:
        .db      %00000000
        .db      %11100000
        .db      %00000000
        .db      %00000000
PieceIR1:
        .db      %10000000
        .db      %10000000
        .db      %10000000
        .db      %00000000
PieceIR2             .equ PieceIR0
PieceIR3             .equ PieceIR1

PieceOR0:
        .db      %11000000
        .db      %11000000
        .db      %00000000
        .db      %00000000
PieceOR1            .equ PieceOR0
PieceOR2            .equ PieceOR0
PieceOR3            .equ PieceOR0

PieceTR0:
        .db      %11100000
        .db      %01000000
        .db      %00000000
        .db      %00000000
PieceTR1:
        .db      %10000000
        .db      %11000000
        .db      %10000000
        .db      %00000000
PieceTR2:
        .db      %00000000
        .db      %01000000
        .db      %11100000
        .db      %00000000
PieceTR3:
        .db      %01000000
        .db      %11000000
        .db      %01000000
        .db      %00000000

; S/Z and J/L were previously swapped vs SRS
; lettering (same MSB-left row bytes,
; but labels did not match the canonical shapes
; named on LCD / previews).
PieceSR0:
        .db      %11000000
        .db      %01100000
        .db      %00000000
        .db      %00000000
PieceSR1:
        .db      %01000000
        .db      %11000000
        .db      %10000000
        .db      %00000000
PieceSR2:
        .db      %00000000
        .db      %11000000
        .db      %01100000
        .db      %00000000
PieceSR3            .equ PieceSR1

PieceZR0:
        .db      %01100000
        .db      %11000000
        .db      %00000000
        .db      %00000000
PieceZR1:
        .db      %10000000
        .db      %11000000
        .db      %01000000
        .db      %00000000
PieceZR2:
        .db      %00000000
        .db      %01100000
        .db      %11000000
        .db      %00000000
PieceZR3            .equ PieceZR1

PieceJR0:
        .db      %00100000
        .db      %11100000
        .db      %00000000
        .db      %00000000
PieceJR1:
        .db      %10000000
        .db      %10000000
        .db      %11000000
        .db      %00000000
PieceJR2:
        .db      %00000000
        .db      %11100000
        .db      %10000000
        .db      %00000000
PieceJR3:
        .db      %11000000
        .db      %01000000
        .db      %01000000
        .db      %00000000

PieceLR0:
        .db      %10000000
        .db      %11100000
        .db      %00000000
        .db      %00000000
PieceLR1:
        .db      %11000000
        .db      %10000000
        .db      %10000000
        .db      %00000000
PieceLR2:
        .db      %00000000
        .db      %11100000
        .db      %00100000
        .db      %00000000
PieceLR3:
        .db      %01000000
        .db      %01000000
        .db      %11000000
        .db      %00000000

PiecePtrTable:
        .dw      PieceIR0, PieceIR1, PieceIR2, PieceIR3
        .dw      PieceOR0, PieceOR1, PieceOR2, PieceOR3
        .dw      PieceTR0, PieceTR1, PieceTR2, PieceTR3
        .dw      PieceSR0, PieceSR1, PieceSR2, PieceSR3
        .dw      PieceZR0, PieceZR1, PieceZR2, PieceZR3
        .dw      PieceJR0, PieceJR1, PieceJR2, PieceJR3
        .dw      PieceLR0, PieceLR1, PieceLR2, PieceLR3

PieceRightTbl:
        .db      2,0,2,0
        .db      1,1,1,1
        .db      2,1,2,1
        .db      2,1,2,1
        .db      2,1,2,1
        .db      2,1,2,1
        .db      2,1,2,1

PieceColorTbl:
        .db      ColorCyan                         ; I = cyan
        .db      ColorWhite                        ; O  = white
        .db      ColorMagenta                      ; T  = magenta
        .db      ColorGreen                        ; S  = green
        .db      ColorRed                          ; Z  = red
        .db      ColorBlue                         ; J  = blue
        .db      ColorYellow                       ; L  = yellow
