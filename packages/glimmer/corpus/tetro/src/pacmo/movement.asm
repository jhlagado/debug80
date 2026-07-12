; Pacmo player input and movement.
;
; Key-to-direction mapping (world coordinates
; are flipped: left key increases world X):
;   KeyLeft / key 1  → PacDirRight (X+1)
;   KeyRight / key 3 → PacDirLeft  (X-1)
;   ADD / key 6      → PacDirUp    (Y-1)
;   GO / key 2       → PacDirDown  (Y+1)
;   key 0            → pause
;
; Raw keypad codes are normalised into PACMO_DIR_*
; intents by NormInputDir before movement dispatch.

; PollInput —
; Read keypad and dispatch movement or game flow.
; Splash and caught states route to their own input
; handlers; a completed round ignores input. During
; normal play, the scanned key is normalised into a
; PacDir value and either drives movement or resets
; key-repeat state. No stable status is returned.
;!      out       E,zero
;!      clobbers  A,BC,D,HL,IX,IY
@PollInput:
        LD      A,(PacSplashActive)
        OR      A
        JP      NZ,PollSplashStart
        LD      A,(PacPlayerCaught)
        OR      A
        JP      NZ,CaughtRestart
        LD      A,(PacRoundDone)
        OR      A
        RET     NZ
        LD      C,ApiScanKeys
        RST     0x10
        JP      NZ,ClearInputRpt
        LD      E,A
        JR      NC,PollNoNewKey
        LD      A,(PacPaused)
        OR      A
        JP      NZ,HandleUnpause
        LD      A,E
        CP      KeyPause
        JP      Z,HandlePauseKey
PollNoNewKey:
        LD      A,(PacPaused)
        OR      A
        JP      NZ,ClearInputRpt

        LD      A,E
        CALL    NormInputDir
        JR      C,HandleDirKey
        JP      ClearInputRpt

; PollSplashStart —
; Wait for any key on the splash screen.
; A fresh key clears PacSplashActive and shows the
; running HUD; a held/no-key scan leaves the splash
; active and returns.
;!      clobbers  A,BC,DE,HL,IX,IY
@PollSplashStart:
        LD      C,ApiScanKeys
        RST     0x10
        RET     NZ
        XOR     A
        LD      (PacSplashActive),A
        JP      LcdShowPacRun

; CaughtRestart —
; Handle input while the player is caught.
; Counts down PacGOverGate before accepting keys.
; Once the gate expires, a fresh key restarts the
; whole game when PacGameOver is set, or resumes the
; current game after a lost life.
;!      out       carry,A
;!      clobbers  HL
@CaughtRestart:
        LD      HL,(PacGOverGateLo)
        LD      A,H
        OR      L
        JR      Z,CaughtRestartKey
        DEC     HL
        LD      (PacGOverGateLo),HL
        RET
CaughtRestartKey:
        LD      C,ApiScanKeys
        RST     0x10
        RET     NZ
        LD      A,(PacGameOver)
        OR      A
        JP      Z,ResumeCaught
        JP      InitState

; ResumeCaught —
; Resume after a life loss (lives remain).
; Resets player and Monsters via InitPlyMons;
; preserves Score, PacLevel, eaten paths, and lives;
; then returns to the running HUD and rebuilds play.
;!      clobbers  A,BC,DE,HL,IX
@ResumeCaught:
        CALL    InitPlyMons
        XOR     A
        LD      (PacGOverGateLo),A
        LD      (PacGOverGateHi),A
        CALL    LcdShowPacRun
        JP      RebuildFb

; HandlePauseKey —
; Pause the game on a fresh pause-key press.
; Sets PacPaused, shows the pause screen, and clears
; key-repeat state before returning to the main loop.
;!      clobbers  A,DE,HL
@HandlePauseKey:
        LD      A,1
        LD      (PacPaused),A
        CALL    LcdShowPacPause
        JP      ClearInputRpt

; HandleUnpause —
; Resume from pause on any new key press.
; Restores power-mode LCD if PacPowerTimer is
; active; otherwise shows the running HUD. Clears
; key-repeat state. The final carry flag is inherited
; from the display path, not an unpause result.
;!      out       carry
;!      clobbers  A,DE,HL
@HandleUnpause:
        XOR     A
        LD      (PacPaused),A
        LD      A,(PacPowerTimerLo)
        LD      E,A
        LD      A,(PacPowerTimerHi)
        OR      E
        JR      Z,UnpauseShowRun
        CALL    LcdShowPower
        JP      ClearInputRpt
UnpauseShowRun:
        CALL    LcdShowPacRun
        JP      ClearInputRpt

HandleDirKey:
        LD      A,(LastKey)
        CP      E
        JR      Z,HeldSameKey

        LD      A,E
        LD      (LastKey),A
        LD      A,1
        LD      (MoveCooldown),A

HeldSameKey:
        LD      A,(MoveCooldown)
        DEC     A
        LD      (MoveCooldown),A
        RET     NZ

        LD      A,PacMovePeriod
        LD      (MoveCooldown),A

        LD      A,E
        CP      PacDirLeft
        JR      Z,MovePlayerLeft
        CP      PacDirRight
        JR      Z,MovePlyRight
        CP      PacDirUp
        JR      Z,MovePlayerUp
        CP      PacDirDown
        JR      Z,MovePlayerDown
        RET

; NormInputDir —
; Map a raw keypad code to a PACMO_DIR_* intent.
; A contains the raw key code. Valid movement keys set
; carry and put the PacDir value in E; all other keys
; clear carry and leave no direction to consume.
;!      in        A
;!      out       A,E,carry,zero
@NormInputDir:
        CP      KeyLeft
        JR      Z,NormalizeLeft
        CP      KeyRight
        JR      Z,NormalizeRight
        CP      PacKey1
        JR      Z,NormalizeLeft
        CP      PacKey3
        JR      Z,NormalizeRight
        CP      KeyRotateCcw
        JR      Z,NormalizeUp
        CP      PacKey6
        JR      Z,NormalizeUp
        CP      KeyRotate
        JR      Z,NormalizeDown
        CP      PacKey2
        JR      Z,NormalizeDown
        OR      A
        RET
NormalizeLeft:
        LD      E,PacDirRight
        SCF
        RET
NormalizeRight:
        LD      E,PacDirLeft
        SCF
        RET
NormalizeUp:
        LD      E,PacDirUp
        SCF
        RET
NormalizeDown:
        LD      E,PacDirDown
        SCF
        RET

; ClearInputRpt —
; Reset key-repeat state to a full period.
; MoveCooldown is reloaded to PacMovePeriod and
; LastKey is set to NoKey.
;!      clobbers  A
@ClearInputRpt:
        LD      A,PacMovePeriod
        LD      (MoveCooldown),A
        LD      A,NoKey
        LD      (LastKey),A
        RET

; MovePlayerLeft —
; Step the player in the PacDirLeft direction.
; In world coordinates this increments X (moving
; left on screen increases world X).
; Builds target B=x, C=y for TryMovePlyBc, or returns
; immediately at the world boundary.
;!      out       zero
;!      clobbers  A,BC,DE,HL,IX
@MovePlayerLeft:
        LD      A,(PlayerX)
        CP      PacWorldMax
        RET     NC
        INC     A
        LD      B,A
        LD      A,(PlayerY)
        LD      C,A
        JP      TryMovePlyBc

; MovePlyRight —
; Step the player in the PacDirRight direction.
; In world coordinates this decrements X (moving
; right on screen decreases world X).
; Builds target B=x, C=y for TryMovePlyBc, or returns
; immediately when PlayerX is 0.
;!      out       zero
;!      clobbers  A,BC,DE,HL,IX
@MovePlyRight:
        LD      A,(PlayerX)
        OR      A
        RET     Z
        DEC     A
        LD      B,A
        LD      A,(PlayerY)
        LD      C,A
        JP      TryMovePlyBc

; MovePlayerUp —
; Step the player upward (decrement PlayerY).
; Builds target B=x, C=y for TryMovePlyBc, or returns
; immediately when PlayerY is 0.
;!      out       zero
;!      clobbers  A,BC,DE,HL,IX
@MovePlayerUp:
        LD      A,(PlayerY)
        OR      A
        RET     Z
        DEC     A
        LD      C,A
        LD      A,(PlayerX)
        LD      B,A
        JP      TryMovePlyBc

; MovePlayerDown —
; Step the player downward (increment PlayerY).
; Builds target B=x, C=y for TryMovePlyBc, or returns
; immediately at PacWorldMax.
;!      out       zero
;!      clobbers  A,BC,DE,HL,IX
@MovePlayerDown:
        LD      A,(PlayerY)
        CP      PacWorldMax
        RET     NC
        INC     A
        LD      C,A
        LD      A,(PlayerX)
        LD      B,A
        JP      TryMovePlyBc

; TryMovePlyBc —
; Try to move the player to world cell B=x, C=y.
; If the cell is a wall, returns without changing
; PlayerX/Y. On an open cell, commits PlayerX/Y,
; consumes items at that cell, checks round completion
; and monster collision, then adjusts the viewport.
; The returned zero flag is incidental to the final
; viewport path, not a move-success result.
;!      in        BC
;!      out       zero
;!      clobbers  A,BC,DE,HL,IX
@TryMovePlyBc:
        CALL    IsWallAtBc
        RET     C
        LD      A,B
        LD      (PlayerX),A
        LD      A,C
        LD      (PlayerY),A
        CALL    EatPwrPillBc
        CALL    MarkEatenBc
        CALL    CheckRoundDone
        LD      IX,Monster0
        CALL    CheckPlyCaught
        LD      IX,Monster1
        CALL    CheckPlyCaught
        CALL    PacIsLevel2Plus
        JP      C,UpdViewPly
        LD      IX,Monster2
        CALL    CheckPlyCaught
        JP      UpdViewPly

; CheckPlyCaught —
; Compare the player with the monster record at IX.
; Returns immediately if the player is already caught,
; the monster is respawning, or the cells differ. On a
; matching cell, fleeing monsters are eaten for score;
; attacking monsters trigger EnterCaught.
;!      in        IX
;!      clobbers  A,BC,DE,HL,IX
@CheckPlyCaught:
        LD      A,(PacPlayerCaught)
        OR      A
        RET     NZ
        LD      A,(IX + MonRespTimer)
        OR      A
        RET     NZ
        LD      A,(PlayerX)
        LD      B,A
        LD      A,(IX + MonsterX)
        CP      B
        RET     NZ
        LD      A,(PlayerY)
        LD      B,A
        LD      A,(IX + MonsterY)
        CP      B
        RET     NZ
        LD      A,(IX + MonsterState)
        CP      PacEnemyFlee
        JR      Z,EatEnemy
        JP      EnterCaught

; EnterCaught —
; Process a player-Monster collision.
; Decrements PacLives; if no lives remain, sets
; PacGameOver and shows the game-over screen. With
; lives remaining, shows the caught screen. Both paths
; rebuild the Framebuffer in the caught colour.
;!      clobbers  A,BC,DE,HL,IX
@EnterCaught:
        LD      A,1
        LD      (PacPlayerCaught),A
        LD      HL,PacGOverTicks
        LD      (PacGOverGateLo),HL
        LD      HL,PacLives
        LD      A,(HL)
        OR      A
        JR      Z,EnterFinalOver
        DEC     (HL)
        LD      A,(HL)
        OR      A
        JR      Z,EnterFinalOver
        CALL    PacSndCaught
        CALL    LcdShowCaught
        JP      RebuildFb
EnterFinalOver:
        LD      A,1
        LD      (PacGameOver),A
        CALL    PacSndCaught
        CALL    LcdShowPacOver
        JP      RebuildFb

; EatEnemy —
; Consume the fleeing monster record at IX. Marks it
; respawning, starts its respawn counters, plays the
; enemy-eaten cue, shows the LCD cue, and awards
; PacScoreEnemy. The BC/HL outputs come from score
; formatting, not from monster logic.
;!      in        IX
;!      out       BC,HL
;!      clobbers  A,DE
@EatEnemy:
        LD      A,PacEnemyRespawn
        LD      (IX + MonsterState),A
        LD      A,PacEnemyRespDiv
        LD      (IX + MonsterTimer),A
        LD      A,PacEnemyRespPer
        LD      (IX + MonRespTimer),A
        CALL    PacSndEatEnemy
        CALL    LcdShowEatEnemy
        LD      A,PacScoreEnemy
        JP      AddScoreA

; EatPwrPillBc —
; Consume a power pill at world cell B=x, C=y when
; present and not already eaten. Sets the pill bit in
; PacPwrPillsEat, awards PacScorePower, starts the
; power timer and sound, and sets all monsters to flee.
;!      in        BC
;!      out       HL,D
;!      clobbers  A,E
@EatPwrPillBc:
        LD      HL,PacPowerPills
        LD      D,1
EatPwrPillLoop:
        LD      A,(HL)
        CP      0xFF
        RET     Z
        CP      B
        INC     HL
        JR      NZ,EatPwrPillNext
        LD      A,(HL)
        CP      C
        JR      NZ,EatPwrPillNext
        LD      A,(PacPwrPillsEat)
        AND     D
        RET     NZ
        LD      A,(PacPwrPillsEat)
        OR      D
        LD      (PacPwrPillsEat),A
        PUSH    BC
        LD      A,PacScorePower
        CALL    AddScoreA
        CALL    PacSndPower
        POP     BC
        LD      HL,PacPwrTimerSet
        LD      (PacPowerTimerLo),HL
        LD      A,PacEnemyFlee
        LD      (EnemyState),A
        LD      (Enemy2State),A
        LD      (Enemy3State),A
        CALL    LcdShowPower
        RET
EatPwrPillNext:
        INC     HL
        SLA     D
        JR      EatPwrPillLoop

; MarkEatenBc —
; Record path consumption at world cell B=x, C=y.
; Sets the column bit in PacEatenRows for row C.
; B < 8 maps to the row high byte; B >= 8 maps to
; the low byte after subtracting 8. First visits add
; PacScorePath; repeat visits do nothing.
;!      in        BC
;!      out       BC,D
;!      clobbers  A,E,HL
@MarkEatenBc:
        LD      A,C
        ADD     A,A
        LD      E,A
        LD      D,0
        LD      HL,PacEatenRows
        ADD     HL,DE

        LD      A,B
        CP      8
        JR      NC,MarkEatenLow
        CALL    MxMask
        LD      E,A
        LD      A,(HL)
        AND     E
        RET     NZ
        PUSH    HL
        PUSH    DE
        LD      A,PacScorePath
        CALL    AddScoreA
        POP     DE
        POP     HL
        LD      A,E
        OR      (HL)
        LD      (HL),A
        RET
MarkEatenLow:
        SUB     8
        INC     HL
        CALL    MxMask
        LD      E,A
        LD      A,(HL)
        AND     E
        RET     NZ
        PUSH    HL
        PUSH    DE
        LD      A,PacScorePath
        CALL    AddScoreA
        POP     DE
        POP     HL
        LD      A,E
        OR      (HL)
        LD      (HL),A
        RET

; AddScoreA —
; Add the 8-bit score delta in A to 16-bit PacScore
; and refresh the score HUD. Score-formatting state is
; returned in BC/HL; it is not game output.
;!      in        A
;!      out       BC,HL
;!      clobbers  A,DE
@AddScoreA:
        LD      E,A
        LD      D,0
        LD      HL,(PacScore)
        ADD     HL,DE
        LD      (PacScore),HL
        JP      UpdScoreDisplay

; CheckRoundDone —
; Detect level completion.
; ORs each PacWorldRows pair with PacEatenRows;
; all rows must be 0xFF to pass (bit 0 of the
; low byte is masked out as it is outside the
; 15-column maze).
; On completion: sets PacRoundDone, starts the
; level-done timer and sound, and shows the complete
; LCD screen. Carry is a display-path residue, not the
; completion result; PacRoundDone is authoritative.
;!      out       carry
;!      clobbers  A,BC,DE,HL
@CheckRoundDone:
        LD      A,(PacRoundDone)
        OR      A
        RET     NZ
        LD      B,RowCount + 7
        LD      DE,PacWorldRows
        LD      HL,PacEatenRows
CheckRoundRow:
        LD      A,(DE)
        OR      (HL)
        CP      0xFF
        RET     NZ
        INC     DE
        INC     HL
        LD      A,(DE)
        OR      (HL)
        OR      0x01                    ; bit 0 is outside the 15-column maze
        CP      0xFF
        RET     NZ
        INC     DE
        INC     HL
        DJNZ    CheckRoundRow
        LD      A,1
        LD      (PacRoundDone),A
        LD      HL,PacLvlDoneTicks
        LD      (PacLvlDoneLo),HL
        CALL    PacSndLvlDone
        CALL    LcdShowComplete
        RET

; IsWallAtBc —
; Test the wall bit at world cell B=x, C=y.
; PacWorldRows stores each row as two bytes: 15
; bits with bit 15 = column 0 (MSB = left wall).
; Shifts the 16-bit pair left B times so column
; B lands in bit 7 of D; tests that bit.
; Returns carry set for wall, clear for open.
;!      in        BC
;!      out       A,E,carry,zero
;!      clobbers  D,HL
@IsWallAtBc:
        LD      A,C
        ADD     A,A
        LD      E,A
        LD      D,0
        LD      HL,PacWorldRows
        ADD     HL,DE
        LD      D,(HL)                  ; D = high byte, bit 7 is world column 0
        INC     HL
        LD      E,(HL)                  ; E = low byte, bit 1 is world column 14

        LD      A,B
        OR      A
        JR      Z,PacWallTest
WallShiftLoop:
        SLA     E
        RL      D
        DEC     A
        JR      NZ,WallShiftLoop
PacWallTest:
        BIT     7,D
        JR      Z,PacWallOpen
        SCF
        RET
PacWallOpen:
        OR      A
        RET

; UpdViewPly —
; Scroll the viewport to keep the player centred.
; Feeds PlayerX/ViewX and PlayerY/ViewY through
; AdjustViewAxis so the player stays near screen
; columns/rows 3-4 within the world boundary. The
; final zero flag is not a viewport status result.
;!      out       zero
;!      clobbers  A,BC
@UpdViewPly:
        LD      A,(PlayerX)
        LD      B,A
        LD      A,(ViewX)
        CALL    AdjustViewAxis
        LD      (ViewX),A

        LD      A,(PlayerY)
        LD      B,A
        LD      A,(ViewY)
        CALL    AdjustViewAxis
        LD      (ViewY),A
        RET

; AdjustViewAxis —
; Adjust one viewport axis to follow the player.
; A contains the current view origin; B contains the
; player coordinate on that axis. The updated origin is
; returned in A. Shifts when B-A is outside the 3..4
; centre band and clamps to 0..PacViewMax.
;!      in        B,A
;!      out       A,zero
;!      clobbers  C
@AdjustViewAxis:
        LD      C,A
        LD      A,B
        SUB     C                       ; A = player screen coordinate
        CP      3
        JR      C,AxisShiftLow
        CP      5
        JR      NC,AxisShiftHigh
        LD      A,C
        RET
AxisShiftLow:
        LD      A,C
        OR      A
        RET     Z
        DEC     A
        RET
AxisShiftHigh:
        LD      A,C
        CP      PacViewMax
        RET     NC
        INC     A
        RET
