; Pacmo cooperative frame dispatcher.

; LogicTick —
; Run one Pacmo logic frame while the matrix is
; blank. Game duties update input, timers, Monsters,
; and collision state; then the full Framebuffer is
; rebuilt for the next visible ScanFrame. The final
; flags are not a caller status convention.
;!      out       carry,zero
;!      clobbers  A,BC,DE,HL,IX,IY
@LogicTick:
        CALL    PacFrameDuties
        JP      RebuildFb

; PacFrameDuties —
; Per-frame Pacmo logic while the matrix is off.
; Polls input; if not paused: ticks the level-done
; gate, power timer, and each active Monster.
; Then checks player collision against each active
; monster. Monster2 is skipped before level 2.
;!      clobbers  A,BC,DE,HL,IX,IY
@PacFrameDuties:
        CALL    PollInput
        LD      A,(PacPaused)
        OR      A
        RET     NZ
        CALL    TickLvlDoneGate
        CALL    TickPowerTimer
        LD      IX,Monster0
        CALL    TickEnemy
        LD      IX,Monster1
        CALL    TickEnemy
        CALL    PacIsLevel2Plus
        JR      C,PacFrameTickDone
        LD      IX,Monster2
        CALL    TickEnemy
PacFrameTickDone:
        LD      IX,Monster0
        CALL    CheckPlyCaught
        LD      IX,Monster1
        CALL    CheckPlyCaught
        CALL    PacIsLevel2Plus
        JR      C,PacFrameCollDone
        LD      IX,Monster2
        CALL    CheckPlyCaught
PacFrameCollDone:
        RET

; PacRenderRowA —
; Update screen row A in the live Framebuffer.
; Copies the completed back row to the front FB,
; clears the back row, then rebuilds it from
; world, power pills, Monsters, and player.
; A is expected to be 0..7.
;!      in        A
;!      clobbers  A,BC,DE,HL,IX
@PacRenderRowA:
        PUSH    AF
        ADD     A,A
        ADD     A,A
        CALL    FbCopyRow
        POP     AF
        PUSH    AF
        ADD     A,A
        ADD     A,A
        CALL    FbClearRow
        POP     AF
        PUSH    AF
        CALL    RendWorldRow
        POP     AF
        PUSH    AF
        CALL    RendPwrPillRow
        POP     AF
        PUSH    AF
        CALL    RendMonsRow
        POP     AF
        JP      RendPlyRow

; TickLvlDoneGate —
; Count down the level-completion delay.
; Active only when PacRoundDone is set.
; On expiry, advances to the next level. Otherwise it
; only decrements PacLvlDoneLo/Hi.
;!      clobbers  A,BC,DE,HL,IX
@TickLvlDoneGate:
        LD      A,(PacRoundDone)
        OR      A
        RET     Z
        LD      HL,(PacLvlDoneLo)
        LD      A,H
        OR      L
        JP      Z,PacAdvanceLevel
        DEC     HL
        LD      (PacLvlDoneLo),HL
        RET

; TickPowerTimer —
; Decrement the 16-bit PacPowerTimer each frame.
; On expiry: sets all three Monster states to
; PacEnemyAtk and restores the running LCD.
;!      clobbers  A,DE,HL
@TickPowerTimer:
        LD      HL,(PacPowerTimerLo)
        LD      A,H
        OR      L
        RET     Z
        DEC     HL
        LD      (PacPowerTimerLo),HL
        LD      A,H
        OR      L
        RET     NZ
        LD      A,PacEnemyAtk
        LD      (EnemyState),A
        LD      (Enemy2State),A
        LD      (Enemy3State),A
        JP      LcdShowPacRun

; PacIsLevel2Plus —
; Check whether the third Monster is active.
; Returns carry clear when PacLevel >= 2,
; carry set when PacLevel < 2. A contains PacLevel
; after the comparison.
;!      out       A,carry,zero
@PacIsLevel2Plus:
        LD      A,(PacLevel)
        CP      2
        RET

; TickEnemy —
; Drive the monster record at IX for this frame.
; Returns immediately on splash, caught, or
; round-done. Delegates to TickEnemyResp when
; the Monster is respawning.
; When timer expires: attack state calls
; EnemyAttackStep; roam calls EnemyRoamStep. Carry is
; inherited from respawn/move paths and is not used by
; the frame dispatcher as a public result.
;!      in        IX
;!      out       BC,A,H,carry,zero
;!      clobbers  DE,L
@TickEnemy:
        LD      A,(PacSplashActive)
        OR      A
        RET     NZ
        LD      A,(PacPlayerCaught)
        OR      A
        RET     NZ
        LD      A,(PacRoundDone)
        OR      A
        RET     NZ
        CALL    TickEnemyResp
        RET     C
        LD      A,(IX + MonsterTimer)
        DEC     A
        LD      (IX + MonsterTimer),A
        RET     NZ
        LD      A,(EnemyPeriodCur)
        LD      (IX + MonsterTimer),A
        LD      A,(IX + MonsterState)
        CP      PacEnemyAtk
        JP      Z,EnemyAttackStep
        JP      EnemyRoamStep

; EnemyAttackStep —
; Take one greedy chase step for the monster at IX.
; Tries the preferred then secondary chase
; direction from EnemyChaseDirs, skipping the
; immediate reverse direction.
; Falls through to EnemyRoamStep when both chase
; directions are blocked. Carry set means a step was
; committed by the chosen movement path.
;!      in        IX
;!      out       BC,A,H,carry,zero
;!      clobbers  DE,L
@EnemyAttackStep:
        CALL    EnemyChaseDirs
        LD      A,(IX + MonsterDir)
        CALL    EnemyOpposite
        LD      L,A                     ; L = immediate reverse direction
        LD      A,D
        PUSH    DE
        PUSH    HL
        CALL    EnemyTryChase
        POP     HL
        POP     DE
        RET     C
        LD      A,E
        CALL    EnemyTryChase
        RET     C
        JP      EnemyRoamStep

; EnemyTryChase —
; Try chase direction A for the monster at IX.
; L holds the immediate reverse direction to forbid.
; Returns carry clear when A is zero, when A equals L,
; or when the resulting move is blocked; carry set
; means EnemyTryMove committed the step.
;!      in        A,L,IX
;!      out       BC,A,carry,zero
;!      clobbers  E
@EnemyTryChase:
        OR      A
        RET     Z
        CP      L
        JR      Z,EnemyChaseBlock
        CALL    EnemyTryMove
        RET
EnemyChaseBlock:
        OR      A
        RET

; EnemyChaseDirs —
; Compute chase directions for the monster at IX.
; Returns D as the preferred reducing direction and E
; as the secondary direction, ordered by the larger
; Manhattan distance axis. Either direction may be 0
; when already aligned on that axis.
;!      in        IX
;!      out       DE,zero,HL
;!      clobbers  A,BC
@EnemyChaseDirs:
        CALL    EnemyHorizChase
        LD      H,A                     ; H = horizontal distance
        LD      D,B                     ; D = horizontal reducing direction
        CALL    EnemyVertChase
        LD      L,A                     ; L = vertical distance
        LD      E,B                     ; E = vertical reducing direction
        LD      A,H
        CP      L
        RET     NC
        LD      A,D
        LD      D,E
        LD      E,A
        RET

; EnemyHorizChase —
; Compare monster X from IX with PlayerX.
; Returns A as the absolute horizontal distance and B
; as the reducing direction, or B=0 when aligned.
;!      in        IX
;!      out       A,B,carry,zero
;!      clobbers  C
@EnemyHorizChase:
        LD      A,(IX + MonsterX)
        LD      C,A
        LD      A,(PlayerX)
        CP      C
        JR      Z,EnemyHorizAlign
        JR      C,EnemyHorizRight
        SUB     C
        LD      B,PacDirLeft
        RET
EnemyHorizRight:
        LD      A,C
        LD      B,A
        LD      A,(PlayerX)
        LD      C,A
        LD      A,B
        SUB     C
        LD      B,PacDirRight
        RET
EnemyHorizAlign:
        LD      B,0
        XOR     A
        RET

; EnemyVertChase —
; Compare monster Y from IX with PlayerY.
; Returns A as the absolute vertical distance and B
; as the reducing direction, or B=0 when aligned.
;!      in        IX
;!      out       A,B,carry,zero
;!      clobbers  C
@EnemyVertChase:
        LD      A,(IX + MonsterY)
        LD      C,A
        LD      A,(PlayerY)
        CP      C
        JR      Z,EnemyVertAlign
        JR      C,EnemyVertUp
        SUB     C
        LD      B,PacDirDown
        RET
EnemyVertUp:
        LD      A,C
        LD      B,A
        LD      A,(PlayerY)
        LD      C,A
        LD      A,B
        SUB     C
        LD      B,PacDirUp
        RET
EnemyVertAlign:
        LD      B,0
        XOR     A
        RET

; EnemyRoamStep —
; Roam the monster at IX into an adjacent open cell.
; The first candidate direction is derived from level,
; position, and current direction for varied routing.
; Avoids the immediate reverse unless all other
; directions are blocked. Carry set means a move was
; committed.
;!      in        IX
;!      out       BC,A,H,carry,zero
;!      clobbers  DE
@EnemyRoamStep:
        LD      A,(IX + MonsterX)
        LD      B,A
        LD      A,(IX + MonsterY)
        LD      C,A
        LD      A,(IX + MonsterDir)
        CALL    EnemyOpposite
        LD      D,A                     ; D = reverse direction fallback
        LD      A,B
        ADD     A,C
        LD      E,A
        LD      A,(PacLevel)
        ADD     A,E
        LD      E,A
        LD      A,(IX + MonsterDir)
        ADD     A,E
        AND     0x03
        INC     A                       ; A = first candidate direction, 1..4
        LD      E,A
        LD      H,4
EnemyRoamLoop:
        LD      A,E
        CP      D
        JR      Z,EnemyRoamNext
        PUSH    DE
        PUSH    HL
        CALL    EnemyTryMove
        POP     HL
        POP     DE
        RET     C
EnemyRoamNext:
        INC     E
        LD      A,E
        CP      5
        JR      C,EnemyRoamReady
        LD      E,1
EnemyRoamReady:
        DEC     H
        JR      NZ,EnemyRoamLoop
        LD      A,D
        CALL    EnemyTryMove
        RET

; EnemyOpposite —
; A contains a PacDir value. The opposite direction is
; returned in A: up/down or left/right. Flags are
; incidental.
;!      in        A
;!      out       A,carry
@EnemyOpposite:
        CP      PacDirUp
        JR      Z,EnemyOppDown
        CP      PacDirDown
        JR      Z,EnemyOppUp
        CP      PacDirLeft
        JR      Z,EnemyOppRight
        LD      A,PacDirLeft
        RET
EnemyOppDown:
        LD      A,PacDirDown
        RET
EnemyOppUp:
        LD      A,PacDirUp
        RET
EnemyOppRight:
        LD      A,PacDirRight
        RET

; EnemyTryMove —
; Try one step in direction A for the monster at IX.
; Builds candidate B=x, C=y, checks bounds and walls,
; then commits MonsterX/Y and MonsterDir on success.
; Returns carry set for a committed move, carry clear
; when blocked, out of bounds, or passed no direction.
;!      in        IX,A
;!      out       A,carry,zero,BC
;!      clobbers  E
@EnemyTryMove:
        LD      E,A
        LD      A,(IX + MonsterX)
        LD      B,A
        LD      A,(IX + MonsterY)
        LD      C,A
        LD      A,E
        CP      PacDirLeft
        JR      Z,EnemyTryLeft
        CP      PacDirRight
        JR      Z,EnemyTryRight
        CP      PacDirUp
        JR      Z,EnemyTryUp
        CP      PacDirDown
        JR      Z,EnemyTryDown
        OR      A
        RET
EnemyTryLeft:
        LD      A,B
        CP      PacWorldMax
        JR      NC,EnemyTryBlocked
        INC     B
        JR      EnemyCommitOpen
EnemyTryRight:
        LD      A,B
        OR      A
        JR      Z,EnemyTryBlocked
        DEC     B
        JR      EnemyCommitOpen
EnemyTryUp:
        LD      A,C
        OR      A
        JR      Z,EnemyTryBlocked
        DEC     C
        JR      EnemyCommitOpen
EnemyTryDown:
        LD      A,C
        CP      PacWorldMax
        JR      NC,EnemyTryBlocked
        INC     C
EnemyCommitOpen:
        PUSH    DE
        CALL    IsWallAtBc
        POP     DE
        JR      C,EnemyTryBlocked
        LD      A,B
        LD      (IX + MonsterX),A
        LD      A,C
        LD      (IX + MonsterY),A
        LD      A,E
        LD      (IX + MonsterDir),A
        SCF
        RET
EnemyTryBlocked:
        OR      A
        RET

; TickEnemyResp —
; Manage respawn countdown for the monster at IX.
; Returns carry set while the monster remains hidden.
; When the countdown expires, selects a new spawn
; cell, restores attack state/direction/timer, refreshes
; the LCD, and returns carry clear.
;!      in        IX
;!      out       B,carry,zero
;!      clobbers  A
@TickEnemyResp:
        LD      A,(IX + MonRespTimer)
        OR      A
        RET     Z
        LD      A,(IX + MonsterTimer)
        OR      A
        JR      Z,TickEnemyRespDec
        DEC     A
        LD      (IX + MonsterTimer),A
        JR      Z,TickEnemyRespDec
        SCF
        RET
TickEnemyRespDec:
        LD      A,PacEnemyRespDiv
        LD      (IX + MonsterTimer),A
        LD      A,(IX + MonRespTimer)
        DEC     A
        LD      (IX + MonRespTimer),A
        JR      Z,TickEnemyDone
        SCF
        RET
TickEnemyDone:
        LD      A,PacEnemyAtk
        LD      (IX + MonsterState),A
        CALL    EnemySelectResp
        LD      A,PacDirRight
        LD      (IX + MonsterDir),A
        LD      A,(EnemyPeriodCur)
        LD      (IX + MonsterTimer),A
        CALL    LcdShowPacRun
        OR      A
        RET

; EnemySelectResp —
; Pick the best spawn cell for the monster at IX.
; Scores each PacEnemySpawns entry as distance
; from the player plus distance from other active
; monsters. Rejects occupied or in-view cells. Ties
; favour the earlier table entry. Writes the selected
; cell back to MonsterX/Y; no value is returned to the
; caller.
;!      in        IX
;!      out       HL,B
;!      clobbers  A,C,DE
@EnemySelectResp:
        LD      HL,PacEnemySpawns
        LD      B,0xFF                  ; B = best distance; 0xFF means no best yet
        LD      DE,0                    ; D = best x, E = best y
EnemySelRespLp:
        LD      A,(HL)
        CP      0xFF
        JR      Z,EnemyRespCommit
        LD      C,A                     ; C = candidate x
        INC     HL
        LD      A,(HL)                  ; A = candidate y
        INC     HL
        PUSH    HL
        LD      H,A                     ; H = candidate y
        LD      L,C                     ; L = candidate x
        PUSH    DE
        CALL    EnemyOccOther
        POP     DE
        JR      C,EnemyRespKeep
        PUSH    BC
        CALL    EnemyRespScore
        POP     BC
        LD      C,A                     ; C = candidate distance
        LD      A,B
        CP      0xFF
        JR      Z,EnemyRespNewBest
        LD      A,C
        CP      B
        JR      Z,EnemyRespKeep
        JR      C,EnemyRespKeep
EnemyRespNewBest:
        LD      B,C
        LD      D,L
        LD      E,H
EnemyRespKeep:
        POP     HL
        JR      EnemySelRespLp
EnemyRespCommit:
        LD      A,D
        LD      (IX + MonsterX),A
        LD      A,E
        LD      (IX + MonsterY),A
        RET

; EnemyRespScore —
; Score spawn candidate cell L=x, H=y for the monster
; at IX.
; Returns 0 when the cell is in the viewport or
; within 8 tiles of the player.
; Otherwise returns player distance +
; summed distance to other active monsters in A.
;!      in        HL,IX
;!      out       A,carry,zero
;!      clobbers  C
@EnemyRespScore:
        PUSH    DE
        CALL    EnemyIsInView
        JR      C,EnemyRespZero
        CALL    EnemyDistPlayer
        CP      8
        JR      C,EnemyRespZero
        LD      C,A
        PUSH    BC
        CALL    EnemyDistOther
        POP     BC
        ADD     A,C
        POP     DE
        RET
EnemyRespZero:
        XOR     A
        POP     DE
        RET

; EnemyIsInView —
; Test whether world cell L=x, H=y is visible in the
; current 8x8 viewport.
; Returns carry set when in view, clear otherwise.
;!      in        HL
;!      out       A,carry,zero
;!      clobbers  C
@EnemyIsInView:
        LD      A,(ViewX)
        LD      C,A
        LD      A,L
        CP      C
        JR      C,EnemyNotVisible
        SUB     C
        CP      RowCount
        JR      NC,EnemyNotVisible
        LD      A,(ViewY)
        LD      C,A
        LD      A,H
        CP      C
        JR      C,EnemyNotVisible
        SUB     C
        CP      RowCount
        JR      NC,EnemyNotVisible
        SCF
        RET
EnemyNotVisible:
        OR      A
        RET

; EnemyOccOther —
; Test whether spawn cell L=x, H=y is occupied by
; another active monster. IX identifies the monster to
; ignore. Respawning monsters do not count. Returns
; carry set when occupied.
;!      in        IX,HL
;!      out       A,carry,zero
;!      clobbers  DE
@EnemyOccOther:
        LD      DE,Monster0
        CALL    EnemyOccByDe
        RET     C
        LD      DE,Monster1
        CALL    EnemyOccByDe
        RET     C
        CALL    PacIsLevel2Plus
        JR      C,EnemyOccNo
        LD      DE,Monster2
        JP      EnemyOccByDe

; EnemyOccByDe —
; Test monster record DE against candidate cell
; L=x, H=y. IX identifies the current monster to
; ignore. Returns carry set when DE is another active
; monster at that cell; otherwise carry clear.
;!      in        IX,DE,HL
;!      out       A,carry,zero
;!      clobbers  DE
@EnemyOccByDe:
        PUSH    HL
        PUSH    DE
        PUSH    IX
        POP     HL
        OR      A
        SBC     HL,DE
        POP     DE
        POP     HL
        JR      Z,EnemyOccNo
        PUSH    HL
        LD      H,D
        LD      L,E
        INC     HL
        INC     HL
        INC     HL
        INC     HL
        INC     HL
        LD      A,(HL)
        POP     HL
        CP      PacEnemyRespawn
        JR      Z,EnemyOccNo
        LD      A,(DE)
        CP      L
        JR      NZ,EnemyOccNo
        INC     DE
        LD      A,(DE)
        CP      H
        JR      NZ,EnemyOccNo
        SCF
        RET
EnemyOccNo:
        OR      A
        RET

; EnemyDistOther —
; Sum Manhattan distances from cell L=x, H=y to all
; other active monsters. IX identifies the monster to
; exclude. Respawning monsters and inactive Monster2
; are skipped. Returns the sum in A.
;!      in        IX,HL
;!      out       A
;!      clobbers  BC,DE
@EnemyDistOther:
        LD      B,0                     ; B = accumulated distance Score
        LD      DE,Monster0
        CALL    EnemyAddDistDe
        LD      DE,Monster1
        CALL    EnemyAddDistDe
        LD      A,B
        LD      C,A
        CALL    PacIsLevel2Plus
        LD      B,C
        LD      A,B
        RET     C
        LD      DE,Monster2
        CALL    EnemyAddDistDe
        LD      A,B
        RET

; EnemyAddDistDe —
; Add one candidate monster's distance into B.
; DE points to the candidate monster record, IX is the
; monster to exclude, and HL is the reference cell
; L=x, H=y. Respawning candidates are skipped.
;!      in        IX,DE,HL,B
;!      out       B
;!      clobbers  A,C,DE
@EnemyAddDistDe:
        PUSH    HL
        PUSH    DE
        PUSH    IX
        POP     HL
        OR      A
        SBC     HL,DE
        POP     DE
        POP     HL
        RET     Z
        PUSH    HL
        LD      H,D
        LD      L,E
        INC     HL
        INC     HL
        INC     HL
        INC     HL
        LD      A,(HL)
        POP     HL
        OR      A
        RET     NZ
        LD      A,(DE)
        LD      C,A
        INC     DE
        LD      A,(DE)
        LD      D,A
        LD      E,C
        CALL    EnemyDistDe
        ADD     A,B
        LD      B,A
        RET

; EnemyDistPlayer —
; Return in A the Manhattan distance from cell
; L=x, H=y to the player.
;!      in        HL
;!      out       A
;!      clobbers  C
@EnemyDistPlayer:
        PUSH    DE
        LD      A,(PlayerX)
        LD      E,A
        LD      A,(PlayerY)
        LD      D,A
        CALL    EnemyDistDe
        POP     DE
        RET

; EnemyDistDe —
; Return in A the Manhattan distance from cell
; L=x, H=y to cell E=x, D=y.
;!      in        DE,HL
;!      out       A
;!      clobbers  C
@EnemyDistDe:
        LD      A,L
        LD      C,A
        LD      A,E
        CP      C
        JR      NC,EnemyDistXHigh
        LD      A,C
        LD      C,A
        LD      A,E
        SUB     C
        NEG
        LD      C,A
        JR      EnemyDistanceY
EnemyDistXHigh:
        SUB     C
        LD      C,A
EnemyDistanceY:
        LD      A,H
        PUSH    BC
        LD      C,A
        LD      A,D
        CP      C
        JR      NC,EnemyDistYHigh
        LD      A,C
        LD      C,A
        LD      A,D
        SUB     C
        NEG
        JR      EnemyDistSum
EnemyDistYHigh:
        SUB     C
EnemyDistSum:
        POP     BC
        ADD     A,C
        RET

; PacAdvanceLevel —
; Increment PacLevel and speed up the Monsters.
; Reduces EnemyPeriodCur by PacEnemyPerStep down
; to PacEnemyPerMin, then restarts the level via
; InitLevelState and shows the running screen.
;!      clobbers  A,BC,DE,HL,IX
@PacAdvanceLevel:
        LD      HL,PacLevel
        INC     (HL)
        LD      A,(EnemyPeriodCur)
        CP      PacEnemyPerMin + PacEnemyPerStep
        JR      C,PacAdvanceMin
        SUB     PacEnemyPerStep
        LD      (EnemyPeriodCur),A
        CALL    InitLevelState
        JP      LcdShowPacRun
PacAdvanceMin:
        LD      A,PacEnemyPerMin
        LD      (EnemyPeriodCur),A
        CALL    InitLevelState
        JP      LcdShowPacRun
