; UpdScoreDisplay —
; Format the current Score into HudSegBuffer.
; ScoreLo/Hi is passed to HudWriteU16 in HL.
;!      out       BC,HL
;!      clobbers  A,DE
@UpdScoreDisplay:
        LD      HL,(ScoreLo)
        JP      HudWriteU16
