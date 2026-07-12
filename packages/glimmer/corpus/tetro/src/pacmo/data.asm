PacWorldMax     .equ    14
PacViewMax      .equ    7
PacScanDwell    .equ   255
PacMovePeriod   .equ   128
PacEatenBytes   .equ  30
PacPwrPillCount .equ 4
PacPwrTimerSet  .equ 0x0300
PacPwrWarnMask  .equ 0x20
PacGOverTicks   .equ 0x0266
PacLvlDoneTicks .equ 0x0300
PacLivesStart   .equ 3
PacScorePath    .equ 10
PacScorePower   .equ 50
PacScoreEnemy   .equ 200
PacSndPowerLen  .equ 64
PacSndPowerDiv  .equ 1
PacSndEatEnLen  .equ 96
PacSndEatEnDiv  .equ 4
PacSndCaughtLen .equ 240
PacSndCaughtDiv .equ 10
PacSndDoneLen   .equ 112
PacSndDoneDiv   .equ 2
PacColorWall    .equ ColorBlue
PacColorPath    .equ ColorGreen
PacColorPlayer  .equ ColorYellow
PacColorPwrPill .equ ColorWhite
PacColorEnAtk   .equ ColorRed
PacColorEnFlee  .equ ColorMagenta
PacColorGOver   .equ ColorRed
PacColorCaught  .equ ColorRed
PacColorDone    .equ ColorWhite
PacColorRound   .equ ColorWhite
PacEnemyY       .equ 13
PacEnemyMinX    .equ 1
PacEnemyMaxX    .equ 13
PacEnemyPeriod  .equ 24
PacEnemyPerMin  .equ 10
PacEnemyPerStep .equ 2
PacEnemyRespPer .equ 72
PacEnemyRespDiv .equ 3
PacEnemyAtk     .equ 0
PacEnemyFlee    .equ 1
PacEnemyRespawn .equ 2
PacMonsterCount .equ 3
MonsterX        .equ 0
MonsterY        .equ 1
MonsterDir      .equ 2
MonsterTimer    .equ 3
MonRespTimer    .equ 4
MonsterState    .equ 5
MonsterSize     .equ 6
PacDirUp        .equ    1
PacDirDown      .equ    2
PacDirLeft      .equ    3
PacDirRight     .equ    4

PacKey1         .equ 0x01
PacKey2         .equ 0x02
PacKey3         .equ 0x03
PacKey6         .equ 0x06

LcdTextPacTitle:
        .db      "PACMO",0

LcdTextPacStart:
        .db      "PRESS ANY KEY",0

LcdTextPacKeys1:
        .db      "ARROWS OR 6/1/2/3",0

LcdTextPacKeys2:
        .db      "6 UP  2 DOWN",0

LcdTextPacRun:
        .db      "PACMO RUNNING",0

LcdTextPacPause:
        .db      "PACMO PAUSED",0

LcdTextPacPower:
        .db      "POWER MODE",0

LcdTextPacEaten:
        .db      "ENEMY EATEN",0

LcdTextPacLevel:
        .db      "LEVEL ",0

LcdTextPacLives:
        .db      "LIVES ",0

LcdTextPacCaught:
        .db      "PACMO CAUGHT",0

LcdTextPacOver:
        .db      "GAME OVER",0

LcdTextPacDone:
        .db      "LEVEL COMPLETE",0

LcdTextPacWait:
        .db      "WAIT...",0

PacLevelChars:
        .db      "0123456789ABCDEF"

ScriptPacSplash:
        .db      LcdRow1
        .dw      LcdTextPacTitle
        .db      LcdRow2
        .dw      LcdTextPacStart
        .db      LcdRow3
        .dw      LcdTextPacKeys1
        .db      LcdRow4
        .dw      LcdTextPacKeys2
        .db      0

ScriptPacRun:
        .db      LcdRow1
        .dw      LcdTextPacRun
        .db      LcdRow2
        .dw      LcdTextPacLevel
        .db      0

ScriptPacPause:
        .db      LcdRow1
        .dw      LcdTextPacPause
        .db      LcdRow2
        .dw      LcdTextPacLevel
        .db      0

ScriptPacPower:
        .db      LcdRow1
        .dw      LcdTextPacPower
        .db      LcdRow2
        .dw      LcdTextPacLevel
        .db      0

ScriptPacEaten:
        .db      LcdRow1
        .dw      LcdTextPacEaten
        .db      LcdRow2
        .dw      LcdTextPacLevel
        .db      0

ScriptPacCaught:
        .db      LcdRow1
        .dw      LcdTextPacCaught
        .db      0

ScriptPacOver:
        .db      LcdRow1
        .dw      LcdTextPacOver
        .db      LcdRow2
        .dw      LcdTextPacStart
        .db      0

ScriptPacDone:
        .db      LcdRow1
        .dw      LcdTextPacDone
        .db      LcdRow2
        .dw      LcdTextPacWait
        .db      0

; 15-bit scrolling test bitmap. Bit 15 is world
; column 0; bit 1 is column 14.
; This is deliberately a visual pattern, not a
; colliding maze yet.
; Each row is stored high byte first, low byte
; second for RendWorldBack.
PacWorldRows:
        .db      %11111111,%11111110
        .db      %10000010,%00000010
        .db      %10111010,%11101010
        .db      %10001000,%00100010
        .db      %11101011,%10101110
        .db      %10000000,%10000010
        .db      %10111110,%10111010
        .db      %10000010,%00001010
        .db      %10111011,%11101010
        .db      %10001000,%00000010
        .db      %11101110,%11101110
        .db      %10000010,%00000010
        .db      %10111010,%11101010
        .db      %10000000,%00000010
        .db      %11111111,%11111110

; Power-pill coordinates, stored as x,y pairs and
; terminated by 0xFF.
; These are placed on open cells away from the
; player Start and near broad
; maze regions so they are visible test landmarks
; before consumption exists.
PacPowerPills:
        .db      1,3
        .db      13,3
        .db      1,11
        .db      13,11
        .db      0xFF

; Enemy respawn candidates, stored as x,y pairs
; and terminated by 0xFF.
; All entries must be open maze cells. The respawn
; routine picks the entry
; with the largest Manhattan distance from the
; current player position.
PacEnemySpawns:
        .db      1,3
        .db      13,3
        .db      1,11
        .db      13,11
        .db      7,1
        .db      7,13
        .db      0xFF
