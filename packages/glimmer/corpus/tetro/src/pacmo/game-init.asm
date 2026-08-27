; InitState —
; Cold-start: reset Score, level, and lives.
; Starts PacLevel at 1, restores PacLives, resets
; the enemy speed, builds a fresh level, and shows
; the splash screen. No semantic value is returned.
;!      out       carry
;!      clobbers  A,BC,DE,HL,IX
CM_INTST:
        XOR     A
        LD      (PacScore),A
        LD      (PacScore + 1),A
        LD      A,1
        LD      (PacLevel),A
        LD      A,PC_LVSST
        LD      (PacLives),A
        LD      A,PC_ENMYP
        LD      (PW_ENMYP),A
        CALL    PI_INTLV
        LD      A,1
        LD      (PW_SPLSH),A
        JP      PU_LCDS5

; InitLevelState —
; Start one Pacmo level without touching Score or
; PacLevel. Resets transient game, sound, input, and
; enemy state; clears eaten paths; marks the player
; start cell eaten; then rebuilds the Framebuffer.
;!      clobbers  A,BC,DE,HL,IX
PI_INTLV:
        CALL    PI_INTPL

        XOR     A
        LD      (PW_SPLSH),A
        LD      (PW_PSDAU),A
        LD      (CM_FRMPH),A
        LD      (CM_HDSCN),A
        LD      (CM_SPKRP),A
        LD      (CM_SNDTM),A
        LD      (CM_SNDD0),A
        LD      (CM_SNDDV),A
        LD      (PW_PWRPL),A
        LD      (PW_PWRT1),A
        LD      (PW_PWRT0),A
        LD      (PW_ENMYR),A
        LD      (PW_ENMYS),A
        LD      (PW_ENMY0),A
        LD      (PW_ENMY1),A
        LD      (PW_ENMY5),A
        LD      (PW_ENMY6),A
        LD      (PW_RNDDN),A
        LD      (PW_PLYRC),A
        LD      (PW_GMVRA),A
        LD      (PW_LVLD1),A
        LD      (PW_LVLD0),A
        LD      (PW_GVRG1),A
        LD      (PW_GVRG0),A

        LD      A,SC_SCNMS
        LD      (ScanMask),A
        LD      HL,CM_FRMBF
        LD      (ScanPtr),HL

        CALL    PI_CLRFR
        CALL    PI_CLRT0
        LD      HL,(PacScore)
        PUSH    HL
        LD      A,(PlayerX)
        LD      B,A
        LD      A,(PlayerY)
        LD      C,A
        CALL    PV_MRKTN
        POP     HL
        LD      (PacScore),HL
        CALL    CM_UPDSC
        JP      CM_RBLDF

; InitPlyMons —
; Reset player, all three Monsters, and viewport.
; Places player at (7,7); Monster0 at its ROM
; start position moving right; Monster1 at (1,1)
; moving left; Monster2 at (13,1) moving down.
; Viewport origin is reset to (3,3). Movement repeat,
; caught state, power timer, sound state, and monster
; respawn/flee state are also cleared. Final flags are
; incidental; callers should not use them as status.
;!      out       carry,zero
;!      clobbers  A
PI_INTPL:
        LD      A,7
        LD      (PlayerX),A
        LD      (PlayerY),A
        LD      A,PC_ENMYM
        LD      (EnemyX),A
        LD      A,PC_ENMYY
        LD      (EnemyY),A
        LD      A,PC_DRRGH
        LD      (EnemyDir),A
        LD      A,(PW_ENMYP)
        LD      (PW_ENMYT),A
        LD      A,1
        LD      (Enemy2X),A
        LD      (Enemy2Y),A
        LD      A,PC_DRLFT
        LD      (PW_ENMY2),A
        LD      A,(PW_ENMYP)
        LD      (PW_ENMY3),A
        LD      A,13
        LD      (Enemy3X),A
        LD      A,1
        LD      (Enemy3Y),A
        LD      A,PC_DRDWN
        LD      (PW_ENMY4),A
        LD      A,(PW_ENMYP)
        LD      (PW_ENMY7),A

        LD      A,3
        LD      (ViewX),A
        LD      (ViewY),A

        LD      A,PC_MVPRD
        LD      (CM_MVCLD),A
        LD      A,NoKey
        LD      (LastKey),A

        XOR     A
        LD      (PW_PSDAU),A
        LD      (CM_SPKRP),A
        LD      (CM_SNDTM),A
        LD      (CM_SNDD0),A
        LD      (CM_SNDDV),A
        LD      (PW_PWRT1),A
        LD      (PW_PWRT0),A
        LD      (PW_ENMYR),A
        LD      (PW_ENMYS),A
        LD      (PW_ENMY0),A
        LD      (PW_ENMY1),A
        LD      (PW_ENMY5),A
        LD      (PW_ENMY6),A
        LD      (PW_PLYRC),A
        RET

; ClearFrontBack —
; Zero both Framebuffer and FramebufferBack by clearing
; FramebufferBytes*2 bytes from Framebuffer.
;!      clobbers  A,B,HL
PI_CLRFR:
        LD      HL,CM_FRMBF
        LD      B,SC_FRMBF * 2
        XOR     A
PI_CLRF0:
        LD      (HL),A
        INC     HL
        DJNZ    PI_CLRF0
        RET

; ClearEatenPaths —
; Zero PacEatenRows at level start. MarkEatenBc later
; sets one bit per eaten path cell.
;!      clobbers  A,B,HL
PI_CLRT0:
        LD      HL,PW_ETNRW
        LD      B,PC_ETNBY
        XOR     A
PI_CLRTN:
        LD      (HL),A
        INC     HL
        DJNZ    PI_CLRTN
        RET
