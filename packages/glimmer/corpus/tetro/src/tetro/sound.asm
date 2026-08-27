; SndTrigRotate —
; Start the short rotate-key sound cue.
;!      out       carry,zero
;!      clobbers  A,C
TS_SNDT3:
        LD      A,TC_SNDR1
        LD      C,TC_SNDRT
        JP      SndStart

; SndTrigLock —
; Start the short piece-lock sound cue.
;!      out       carry,zero
;!      clobbers  A,C
TS_SNDT1:
        LD      A,TC_SNDL0
        LD      C,TC_SNDLC
        JP      SndStart

; SndTrigClear —
; Start the line-clear sound cue.
;!      out       carry,zero
;!      clobbers  A,C
TS_SNDTR:
        LD      A,TC_SNDC0
        LD      C,TC_SNDCL
        JP      SndStart

; SndTrigGOver —
; Start the game-over sound cue.
;!      out       carry,zero
;!      clobbers  A,C
TS_SNDT0:
        LD      A,TC_SNDG0
        LD      C,TC_SNDGV
        JP      SndStart

; SndTrigReady —
; Start the short ready-chirp when the game-over
; key-delay expires and input is accepted again.
;!      out       carry,zero
;!      clobbers  A,C
TS_SNDT2:
        LD      A,TC_SNDR0
        LD      C,TC_SNDRD
        JP      SndStart
