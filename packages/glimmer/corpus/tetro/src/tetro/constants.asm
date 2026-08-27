; Tetro gameplay tuning constants.
; These are intentionally game-local so new games
; can share hardware/display
; constants without inheriting Tetro's movement,
; gravity, scoring, or sounds.
TC_MVPRD      EQU     128
TC_DRPPR      EQU     1
TC_SCNDW EQU     255
TC_TTKYL   EQU $01
TC_TTKYD   EQU $02
TC_TTKYR  EQU $03
TC_TTKY0    EQU $06
; Decremented once per full frame. Larger = slower
; fall.
TC_GRVTY   EQU     32
TC_GRVPR EQU 28
TC_GRVSC    EQU $07 ; 2000 decimal
TC_GRVS0    EQU $D0
TC_LNCLR   EQU    24
; Full frames before PRESS ANY KEY during GameOver;
; tuned down from the old scan-pass counter.
TC_GVRGT  EQU  $0180

TC_RNGSD     EQU     $5A
XMin            EQU     0
YMax            EQU     7
SpawnY          EQU     $FD
TC_PCCNT      EQU     7

TC_SNDR1  EQU   24
TC_SNDRT  EQU   2
TC_SNDL0    EQU     32
TC_SNDLC    EQU     4
TC_SNDC0   EQU    72
TC_SNDCL   EQU    2
; Game over  noticeably longer tone than clears;
; DIV sets half-period in scan ticks.
TC_SNDG0     EQU 232
TC_SNDGV     EQU 8
; When key gate opens (PRESS ANY KEY window
; starts); short higher chirp.
TC_SNDR0     EQU    36
TC_SNDRD  EQU    3
