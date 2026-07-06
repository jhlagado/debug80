; InitState —
; Cold-start: reset Score, level, and lives.
; Starts PacLevel at 1, restores PacLives, resets
; the enemy speed, builds a fresh level, and shows
; the splash screen. No semantic value is returned.
;!      out       carry
;!      clobbers  A,BC,DE,HL,IX
@InitState:
        XOR     A
        LD      (PacScore),A
        LD      (PacScore + 1),A
        LD      A,1
        LD      (PacLevel),A
        LD      A,PacLivesStart
        LD      (PacLives),A
        LD      A,PacEnemyPeriod
        LD      (EnemyPeriodCur),A
        CALL    InitLevelState
        LD      A,1
        LD      (PacSplashActive),A
        JP      LcdShowPacSplash

; InitLevelState —
; Start one Pacmo level without touching Score or
; PacLevel. Resets transient game, sound, input, and
; enemy state; clears eaten paths; marks the player
; start cell eaten; then rebuilds the Framebuffer.
;!      clobbers  A,BC,DE,HL,IX
@InitLevelState:
        CALL    InitPlyMons

        XOR     A
        LD      (PacSplashActive),A
        LD      (PacPaused),A
        LD      (FramePhase),A
        LD      (HudScanIndex),A
        LD      (SpeakerPort),A
        LD      (SoundTimer),A
        LD      (SndDivReload),A
        LD      (SndDivCount),A
        LD      (PacPwrPillsEat),A
        LD      (PacPowerTimerLo),A
        LD      (PacPowerTimerHi),A
        LD      (EnemyRespTimer),A
        LD      (EnemyState),A
        LD      (Enemy2RespTimer),A
        LD      (Enemy2State),A
        LD      (Enemy3RespTimer),A
        LD      (Enemy3State),A
        LD      (PacRoundDone),A
        LD      (PacPlayerCaught),A
        LD      (PacGameOver),A
        LD      (PacLvlDoneLo),A
        LD      (PacLvlDoneHi),A
        LD      (PacGOverGateLo),A
        LD      (PacGOverGateHi),A

        LD      A,ScanMaskStart
        LD      (ScanMask),A
        LD      HL,Framebuffer
        LD      (ScanPtr),HL

        CALL    ClearFrontBack
        CALL    ClearEatenPaths
        LD      HL,(PacScore)
        PUSH    HL
        LD      A,(PlayerX)
        LD      B,A
        LD      A,(PlayerY)
        LD      C,A
        CALL    MarkEatenBc
        POP     HL
        LD      (PacScore),HL
        CALL    UpdScoreDisplay
        JP      RebuildFb

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
@InitPlyMons:
        LD      A,7
        LD      (PlayerX),A
        LD      (PlayerY),A
        LD      A,PacEnemyMaxX
        LD      (EnemyX),A
        LD      A,PacEnemyY
        LD      (EnemyY),A
        LD      A,PacDirRight
        LD      (EnemyDir),A
        LD      A,(EnemyPeriodCur)
        LD      (EnemyTimer),A
        LD      A,1
        LD      (Enemy2X),A
        LD      (Enemy2Y),A
        LD      A,PacDirLeft
        LD      (Enemy2Dir),A
        LD      A,(EnemyPeriodCur)
        LD      (Enemy2Timer),A
        LD      A,13
        LD      (Enemy3X),A
        LD      A,1
        LD      (Enemy3Y),A
        LD      A,PacDirDown
        LD      (Enemy3Dir),A
        LD      A,(EnemyPeriodCur)
        LD      (Enemy3Timer),A

        LD      A,3
        LD      (ViewX),A
        LD      (ViewY),A

        LD      A,PacMovePeriod
        LD      (MoveCooldown),A
        LD      A,NoKey
        LD      (LastKey),A

        XOR     A
        LD      (PacPaused),A
        LD      (SpeakerPort),A
        LD      (SoundTimer),A
        LD      (SndDivReload),A
        LD      (SndDivCount),A
        LD      (PacPowerTimerLo),A
        LD      (PacPowerTimerHi),A
        LD      (EnemyRespTimer),A
        LD      (EnemyState),A
        LD      (Enemy2RespTimer),A
        LD      (Enemy2State),A
        LD      (Enemy3RespTimer),A
        LD      (Enemy3State),A
        LD      (PacPlayerCaught),A
        RET

; ClearFrontBack —
; Zero both Framebuffer and FramebufferBack by clearing
; FramebufferBytes*2 bytes from Framebuffer.
;!      clobbers  A,B,HL
@ClearFrontBack:
        LD      HL,Framebuffer
        LD      B,FramebufferBytes * 2
        XOR     A
ClearFrontBackLp:
        LD      (HL),A
        INC     HL
        DJNZ    ClearFrontBackLp
        RET

; ClearEatenPaths —
; Zero PacEatenRows at level start. MarkEatenBc later
; sets one bit per eaten path cell.
;!      clobbers  A,B,HL
@ClearEatenPaths:
        LD      HL,PacEatenRows
        LD      B,PacEatenBytes
        XOR     A
ClearEatenLp:
        LD      (HL),A
        INC     HL
        DJNZ    ClearEatenLp
        RET
