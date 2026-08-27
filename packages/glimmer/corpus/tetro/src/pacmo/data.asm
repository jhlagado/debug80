PD_LCDTB:
        DB      "PACMO",0

PD_LCDTA:
        DB      "PRESS ANY KEY",0

PD_LCDT2:
        DB      "ARROWS OR 6/1/2/3",0

PD_LCDT3:
        DB      "6 UP  2 DOWN",0

PD_LCDT9:
        DB      "PACMO RUNNING",0

PD_LCDT7:
        DB      "PACMO PAUSED",0

PD_LCDT8:
        DB      "POWER MODE",0

PD_LCDT1:
        DB      "ENEMY EATEN",0

PD_LCDT4:
        DB      "LEVEL ",0

PD_LCDT5:
        DB      "LIVES ",0

PD_LCDTX:
        DB      "PACMO CAUGHT",0

PD_LCDT6:
        DB      "GAME OVER",0

PD_LCDT0:
        DB      "LEVEL COMPLETE",0

PD_LCDTC:
        DB      "WAIT...",0

PD_LVLCH:
        DB      "0123456789ABCDEF"

PD_SCRP6:
        DB      LcdRow1
        DW      PD_LCDTB
        DB      LcdRow2
        DW      PD_LCDTA
        DB      LcdRow3
        DW      PD_LCDT2
        DB      LcdRow4
        DW      PD_LCDT3
        DB      0

PD_SCRP5:
        DB      LcdRow1
        DW      PD_LCDT9
        DB      LcdRow2
        DW      PD_LCDT4
        DB      0

PD_SCRP3:
        DB      LcdRow1
        DW      PD_LCDT7
        DB      LcdRow2
        DW      PD_LCDT4
        DB      0

PD_SCRP4:
        DB      LcdRow1
        DW      PD_LCDT8
        DB      LcdRow2
        DW      PD_LCDT4
        DB      0

PD_SCRP1:
        DB      LcdRow1
        DW      PD_LCDT1
        DB      LcdRow2
        DW      PD_LCDT4
        DB      0

PD_SCRPT:
        DB      LcdRow1
        DW      PD_LCDTX
        DB      0

PD_SCRP2:
        DB      LcdRow1
        DW      PD_LCDT6
        DB      LcdRow2
        DW      PD_LCDTA
        DB      0

PD_SCRP0:
        DB      LcdRow1
        DW      PD_LCDT0
        DB      LcdRow2
        DW      PD_LCDTC
        DB      0

; 15-bit scrolling test bitmap. Bit 15 is world
; column 0; bit 1 is column 14.
; This is deliberately a visual pattern, not a
; colliding maze yet.
; Each row is stored high byte first, low byte
; second for RendWorldBack.
PD_WRLDR:
        DB      %11111111,%11111110
        DB      %10000010,%00000010
        DB      %10111010,%11101010
        DB      %10001000,%00100010
        DB      %11101011,%10101110
        DB      %10000000,%10000010
        DB      %10111110,%10111010
        DB      %10000010,%00001010
        DB      %10111011,%11101010
        DB      %10001000,%00000010
        DB      %11101110,%11101110
        DB      %10000010,%00000010
        DB      %10111010,%11101010
        DB      %10000000,%00000010
        DB      %11111111,%11111110

; Power-pill coordinates, stored as x,y pairs and
; terminated by 0xFF.
; These are placed on open cells away from the
; player Start and near broad
; maze regions so they are visible test landmarks
; before consumption exists.
PD_PWRPL:
        DB      1,3
        DB      13,3
        DB      1,11
        DB      13,11
        DB      $FF

; Enemy respawn candidates, stored as x,y pairs
; and terminated by 0xFF.
; All entries must be open maze cells. The respawn
; routine picks the entry
; with the largest Manhattan distance from the
; current player position.
PD_ENMYS:
        DB      1,3
        DB      13,3
        DB      1,11
        DB      13,11
        DB      7,1
        DB      7,13
        DB      $FF
