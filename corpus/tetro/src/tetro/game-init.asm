; InitState —
; Cold-start entry point.
; Calls InitStateBase, sets SplashTimer=1, shows
; the splash screen, then rebuilds the Framebuffer.
; Use for first launch only; restart uses
; InitRestart.
;!      clobbers  A,BC,DE,HL
@InitState:
        CALL    InitStateBase
        LD      A,1
        LD      (SplashTimer),A
        CALL    LcdShowSplash
        JP      RebuildFb

; InitRestart —
; Restart entry point (after game-over).
; Calls InitStateBase then immediately spawns the
; first piece and shows the running HUD.
; Skips the splash screen; RNG state is preserved
; from when the seed was set at splash time.
;!      clobbers  A,BC,DE,HL
@InitRestart:
        CALL    InitStateBase
        XOR     A
        LD      (SplashTimer),A
        CALL    RngNextPiece
        LD      (NextPieceIndex),A
        CALL    SpawnActPiece
        CALL    UpdScoreDisplay
        CALL    LcdShowRunning
        JP      RebuildFb

; InitStateBase —
; Zero or reset all mutable play-state variables.
; Sets movement and gravity periods, clears all
; game flags, resets score, initialises scan
; state, and clears the board and HUD buffer.
;!      clobbers  A,B,HL
@InitStateBase:
        LD      A,MovePeriod
        LD      (MoveCooldown),A
        LD      A,GravityPeriod
        LD      (CurGravPeriod),A
        LD      (GravityCooldown),A

        XOR     A
        LD      (GameOver),A
        LD      HL,0
        LD      (GOverKeyGateLo),HL
        LD      (ActPieceEnabled),A
        LD      (ClearPending),A
        LD      (ClearMask),A
        LD      (ClearTimer),A
        LD      (DropLockout),A
        LD      (FramePhase),A
        LD      (Paused),A
        LD      (CurrentRotation),A
        LD      (CurPieceIndex),A
        LD      (NextPieceIndex),A
        LD      (LinesClearTotal),A
        LD      (ScoreLo),A
        LD      (ScoreHi),A
        LD      A,1
        LD      (InputLockout),A
        LD      A,NoKey
        LD      (LastKey),A
        XOR     A
        LD      (HudScanIndex),A
        LD      (SpeakerPort),A
        LD      (SoundTimer),A
        LD      (SndDivReload),A
        LD      (SndDivCount),A

        LD      A,ScanMaskStart
        LD      (ScanMask),A

        LD      HL,Framebuffer
        LD      (ScanPtr),HL

        CALL    ClearBoard
        CALL    HudBlankDig
        RET
