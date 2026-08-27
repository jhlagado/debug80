; InitState —
; Cold-start entry point.
; Calls InitStateBase, sets SplashTimer=1, shows
; the splash screen, then rebuilds the Framebuffer.
; Use for first launch only; restart uses
; InitRestart.
;!      clobbers  A,BC,DE,HL
CM_INTST:
        CALL    TI_INTST
        LD      A,1
        LD      (TW_SPLSH),A
        CALL    TU_LCDS3
        JP      CM_RBLDF

; InitRestart —
; Restart entry point (after game-over).
; Calls InitStateBase then immediately spawns the
; first piece and shows the running HUD.
; Skips the splash screen; RNG state is preserved
; from when the seed was set at splash time.
;!      clobbers  A,BC,DE,HL
TI_INTRS:
        CALL    TI_INTST
        XOR     A
        LD      (TW_SPLSH),A
        CALL    TP_RNGN1
        LD      (TW_NXTPC),A
        CALL    TP_SPWNC
        CALL    CM_UPDSC
        CALL    TU_LCDS2
        JP      CM_RBLDF

; InitStateBase —
; Zero or reset all mutable play-state variables.
; Sets movement and gravity periods, clears all
; game flags, resets score, initialises scan
; state, and clears the board and HUD buffer.
;!      clobbers  A,B,HL
TI_INTST:
        LD      A,TC_MVPRD
        LD      (CM_MVCLD),A
        LD      A,TC_GRVTY
        LD      (TW_CRGRV),A
        LD      (TW_GRVTY),A

        XOR     A
        LD      (GameOver),A
        LD      HL,0
        LD      (TW_GVRK1),HL
        LD      (TW_ACTPC),A
        LD      (TW_CLRPN),A
        LD      (TW_CLRMS),A
        LD      (TW_CLRTM),A
        LD      (TW_DRPLC),A
        LD      (CM_FRMPH),A
        LD      (Paused),A
        LD      (TW_CRRNT),A
        LD      (TW_CRPCN),A
        LD      (TW_NXTPC),A
        LD      (TW_LNSCL),A
        LD      (ScoreLo),A
        LD      (ScoreHi),A
        LD      A,1
        LD      (TW_INPTL),A
        LD      A,NoKey
        LD      (LastKey),A
        XOR     A
        LD      (CM_HDSCN),A
        LD      (CM_SPKRP),A
        LD      (CM_SNDTM),A
        LD      (CM_SNDD0),A
        LD      (CM_SNDDV),A

        LD      A,SC_SCNMS
        LD      (ScanMask),A

        LD      HL,CM_FRMBF
        LD      (ScanPtr),HL

        CALL    TR_CLRBR
        CALL    SH_HDBLN
        RET
