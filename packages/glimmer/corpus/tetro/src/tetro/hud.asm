; UpdScoreDisplay —
; Format the current Score into HudSegBuffer.
; ScoreLo/Hi is passed to HudWriteU16 in HL.
;!      out       BC,HL
;!      clobbers  A,DE
CM_UPDSC:
        LD      HL,(ScoreLo)
        JP      SH_HDWRT
