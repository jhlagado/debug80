; Pacmo-local Score formatting helpers.
; Seven-segment scan helpers live in
; shared/hud.asm.

; UpdScoreDisplay —
; Format 16-bit PacScore into HudSegBuffer for the
; seven-segment HUD. Formatter state is returned in
; BC/HL; it is not Pacmo game output.
;!      out       BC,HL
;!      clobbers  A,DE
@UpdScoreDisplay:
        LD      HL,(PacScore)
        JP      HudWriteU16
