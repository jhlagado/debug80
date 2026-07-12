; Tetro gameplay tuning constants.
; These are intentionally game-local so new games
; can share hardware/display
; constants without inheriting Tetro's movement,
; gravity, scoring, or sounds.
MovePeriod      .equ     128
DropPeriod      .equ     1
ScanDwellPeriod .equ     255
TetKeyLeftAlt   .equ 0x01
TetKeyDropAlt   .equ 0x02
TetKeyRightAlt  .equ 0x03
TetKeyRotAlt    .equ 0x06
; Decremented once per full frame. Larger = slower
; fall.
GravityPeriod   .equ     32
GravPeriodStep1 .equ 28
GravScore1Hi    .equ 0x07       ; 2000 decimal
GravScore1Lo    .equ 0xD0
LineClearHold   .equ    24
; Full frames before PRESS ANY KEY during GameOver;
; tuned down from the old scan-pass counter.
GOverGateTicks  .equ  0x0180

RngSeedInit     .equ     0x5A
XMin            .equ     0
YMax            .equ     7
SpawnY          .equ     0xFD
PieceCount      .equ     7

SoundRotateLen  .equ   24
SoundRotateDiv  .equ   2
SoundLockLen    .equ     32
SoundLockDiv    .equ     4
SoundClearLen   .equ    72
SoundClearDiv   .equ    2
; Game over  noticeably longer tone than clears;
; DIV sets half-period in scan ticks.
SndGOverLen     .equ 232
SndGOverDiv     .equ 8
; When key gate opens (PRESS ANY KEY window
; starts); short higher chirp.
SndReadyLen     .equ    36
SndReadyDiv  .equ    3
