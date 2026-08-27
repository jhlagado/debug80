; Pacmo-local sound event cues.
; Generic speaker service lives in shared/sound.asm.

; PacSndPower —
; Start the power-pill pickup sound cue.
; Loads the Pacmo cue length/divider and delegates to
; SndStart. Flags are inherited from that helper.
;!      out       carry,zero
;!      clobbers  A,C
PS_SNDPW:
        LD      A,PC_SNDP0
        LD      C,PC_SNDPW
        JP      SndStart

; PacSndEatEnemy —
; Start the fleeing-enemy eaten sound cue.
; Loads the Pacmo cue length/divider and delegates to
; SndStart. Flags are inherited from that helper.
;!      out       carry,zero
;!      clobbers  A,C
PS_SNDTN:
        LD      A,PC_SNDT0
        LD      C,PC_SNDTN
        JP      SndStart

; PacSndCaught —
; Start the caught/game-over sound cue.
; Loads the Pacmo cue length/divider and delegates to
; SndStart. Flags are inherited from that helper.
;!      out       carry,zero
;!      clobbers  A,C
PS_SNDCG:
        LD      A,PC_SNDC0
        LD      C,PC_SNDCG
        JP      SndStart

; PacSndLvlDone —
; Start the level-complete sound cue.
; Loads the Pacmo cue length/divider and delegates to
; SndStart. Flags are inherited from that helper.
;!      out       carry,zero
;!      clobbers  A,C
PS_SNDLV:
        LD      A,PC_SNDD0
        LD      C,PC_SNDDN
        JP      SndStart
