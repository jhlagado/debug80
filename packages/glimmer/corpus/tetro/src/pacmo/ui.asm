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
PU_LCDS5:
        LD      HL,PD_SCRP6
        JP      SL_LCDS0

; LcdShowPacRun —
; Show the running HUD script, then refresh the
; dynamic LEVEL and LIVES rows.
;!      clobbers  A,DE,HL
PU_LCDS4:
        LD      HL,PD_SCRP5
        CALL    SL_LCDS0
        JP      PU_LCDR1

; LcdShowPacPause —
; Show the paused HUD script, then refresh the
; dynamic LEVEL and LIVES rows.
;!      clobbers  A,DE,HL
PU_LCDS3:
        LD      HL,PD_SCRP3
        CALL    SL_LCDS0
        JP      PU_LCDR1

; LcdShowPower —
; Show the power-mode HUD script while the power timer
; is active, then refresh LEVEL and LIVES rows.
;!      clobbers  A,DE,HL
PU_LCDS6:
        LD      HL,PD_SCRP4
        CALL    SL_LCDS0
        JP      PU_LCDR1

; LcdShowEatEnemy —
; Show the monster-eaten scripted cue, then refresh
; LEVEL and LIVES rows.
;!      clobbers  A,DE,HL
PU_LCDS1:
        LD      HL,PD_SCRP1
        CALL    SL_LCDS0
        JP      PU_LCDR1

; LcdShowCaught —
; Show the life-loss script, then refresh only the
; LIVES row because the level did not change.
;!      clobbers  A,DE,HL
PU_LCDSH:
        LD      HL,PD_SCRPT
        CALL    SL_LCDS0
        JP      PU_LCDR0

; LcdShowPacOver —
; Show the Pacmo game-over screen.
; LcdScript's carry result is not a Pacmo status
; value.
;!      out       carry
;!      clobbers  A,HL
PU_LCDS2:
        LD      HL,PD_SCRP2
        JP      SL_LCDS0

; LcdShowComplete —
; Show the round-complete / maze-clear screen.
; LcdScript's carry result is not a Pacmo status
; value.
;!      out       carry
;!      clobbers  A,HL
PU_LCDS0:
        LD      HL,PD_SCRP0
        JP      SL_LCDS0

; LcdRefStatus —
; Refresh LCD rows 2 and 3 from PacLevel and PacLives.
;!      clobbers  A,DE,HL
PU_LCDR1:
        CALL    PU_LCDRF
        JP      PU_LCDR0

; LcdRefLevel —
; Write row 2 LEVEL banner plus PacLevel digit.
; PacLevel is masked to a nybble and looked up through
; PacLevelChars.
;!      clobbers  A,DE,HL
PU_LCDRF:
        PUSH    BC
        LD      B,LcdRow2
        LD      HL,PD_LCDT4
        CALL    SL_LCDRW
        LD      A,(PacLevel)
        AND     $0F
        LD      DE,PD_LVLCH
        CALL    SL_LCDPT
        POP     BC
        RET

; LcdRefLives —
; Write row 3 LIVES banner plus PacLives digit.
; PacLives is masked to a nybble and looked up through
; PacLevelChars.
;!      clobbers  A,DE,HL
PU_LCDR0:
        PUSH    BC
        LD      B,LcdRow3
        LD      HL,PD_LCDT5
        CALL    SL_LCDRW
        LD      A,(PacLives)
        AND     $0F
        LD      DE,PD_LVLCH
        CALL    SL_LCDPT
        POP     BC
        RET
