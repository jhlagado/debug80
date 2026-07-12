; Pacmo-specific LCD status screens.
; Shared LCD primitives live in src/shared/lcd.asm;
; this file selects Pacmo scripts and writes
; Pacmo-specific dynamic LCD rows.

; LcdShowPacSplash —
; Show the Pacmo splash and control-hint screen.
; LcdScript's carry result is not a Pacmo status
; value.
;!      out       carry
;!      clobbers  A,HL
@LcdShowPacSplash:
        LD      HL,ScriptPacSplash
        JP      LcdScript

; LcdShowPacRun —
; Show the running HUD script, then refresh the
; dynamic LEVEL and LIVES rows.
;!      clobbers  A,DE,HL
@LcdShowPacRun:
        LD      HL,ScriptPacRun
        CALL    LcdScript
        JP      LcdRefStatus

; LcdShowPacPause —
; Show the paused HUD script, then refresh the
; dynamic LEVEL and LIVES rows.
;!      clobbers  A,DE,HL
@LcdShowPacPause:
        LD      HL,ScriptPacPause
        CALL    LcdScript
        JP      LcdRefStatus

; LcdShowPower —
; Show the power-mode HUD script while the power timer
; is active, then refresh LEVEL and LIVES rows.
;!      clobbers  A,DE,HL
@LcdShowPower:
        LD      HL,ScriptPacPower
        CALL    LcdScript
        JP      LcdRefStatus

; LcdShowEatEnemy —
; Show the monster-eaten scripted cue, then refresh
; LEVEL and LIVES rows.
;!      clobbers  A,DE,HL
@LcdShowEatEnemy:
        LD      HL,ScriptPacEaten
        CALL    LcdScript
        JP      LcdRefStatus

; LcdShowCaught —
; Show the life-loss script, then refresh only the
; LIVES row because the level did not change.
;!      clobbers  A,DE,HL
@LcdShowCaught:
        LD      HL,ScriptPacCaught
        CALL    LcdScript
        JP      LcdRefLives

; LcdShowPacOver —
; Show the Pacmo game-over screen.
; LcdScript's carry result is not a Pacmo status
; value.
;!      out       carry
;!      clobbers  A,HL
@LcdShowPacOver:
        LD      HL,ScriptPacOver
        JP      LcdScript

; LcdShowComplete —
; Show the round-complete / maze-clear screen.
; LcdScript's carry result is not a Pacmo status
; value.
;!      out       carry
;!      clobbers  A,HL
@LcdShowComplete:
        LD      HL,ScriptPacDone
        JP      LcdScript

; LcdRefStatus —
; Refresh LCD rows 2 and 3 from PacLevel and PacLives.
;!      clobbers  A,DE,HL
@LcdRefStatus:
        CALL    LcdRefLevel
        JP      LcdRefLives

; LcdRefLevel —
; Write row 2 LEVEL banner plus PacLevel digit.
; PacLevel is masked to a nybble and looked up through
; PacLevelChars.
;!      clobbers  A,DE,HL
@LcdRefLevel:
        PUSH    BC
        LD      B,LcdRow2
        LD      HL,LcdTextPacLevel
        CALL    LcdRowStr
        LD      A,(PacLevel)
        AND     0x0F
        LD      DE,PacLevelChars
        CALL    LcdPutcTbl
        POP     BC
        RET

; LcdRefLives —
; Write row 3 LIVES banner plus PacLives digit.
; PacLives is masked to a nybble and looked up through
; PacLevelChars.
;!      clobbers  A,DE,HL
@LcdRefLives:
        PUSH    BC
        LD      B,LcdRow3
        LD      HL,LcdTextPacLives
        CALL    LcdRowStr
        LD      A,(PacLives)
        AND     0x0F
        LD      DE,PacLevelChars
        CALL    LcdPutcTbl
        POP     BC
        RET
