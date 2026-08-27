; Pacmo cooperative frame dispatcher.

; LogicTick —
; Run one Pacmo logic frame while the matrix is
; blank. Game duties update input, timers, Monsters,
; and collision state; then the full Framebuffer is
; rebuilt for the next visible ScanFrame. The final
; flags are not a caller status convention.
;!      out       carry,zero
;!      clobbers  A,BC,DE,HL,IX,IY
CM_LGCTC:
        CALL    PL_FRMDT
        JP      CM_RBLDF

; PacFrameDuties —
; Per-frame Pacmo logic while the matrix is off.
; Polls input; if not paused: ticks the level-done
; gate, power timer, and each active Monster.
; Then checks player collision against each active
; monster. Monster2 is skipped before level 2.
;!      clobbers  A,BC,DE,HL,IX,IY
PL_FRMDT:
        CALL    CM_PLLNP
        LD      A,(PW_PSDAU)
        OR      A
        RET     NZ
        CALL    PL_TCKLV
        CALL    PL_TCKPW
        LD      IX,Monster0
        CALL    PL_TCKNM
        LD      IX,Monster1
        CALL    PL_TCKNM
        CALL    PL_ISLVL
        JR      C,PL_FRMTC
        LD      IX,Monster2
        CALL    PL_TCKNM
PL_FRMTC:
        LD      IX,Monster0
        CALL    PV_CHCKP
        LD      IX,Monster1
        CALL    PV_CHCKP
        CALL    PL_ISLVL
        JR      C,PL_FRMCL
        LD      IX,Monster2
        CALL    PV_CHCKP
PL_FRMCL:
        RET

; PacRenderRowA —
; Update screen row A in the live Framebuffer.
; Copies the completed back row to the front FB,
; clears the back row, then rebuilds it from
; world, power pills, Monsters, and player.
; A is expected to be 0..7.
;!      in        A
;!      clobbers  A,BC,DE,HL,IX
PL_RNDRR:
        PUSH    AF
        ADD     A,A
        ADD     A,A
        CALL    FC_FBCP0
        POP     AF
        PUSH    AF
        ADD     A,A
        ADD     A,A
        CALL    FC_FBCL0
        POP     AF
        PUSH    AF
        CALL    PR_RNDW1
        POP     AF
        PUSH    AF
        CALL    PR_RNDP5
        POP     AF
        PUSH    AF
        CALL    PR_RNDMN
        POP     AF
        JP      PR_RNDP1

; TickLvlDoneGate —
; Count down the level-completion delay.
; Active only when PacRoundDone is set.
; On expiry, advances to the next level. Otherwise it
; only decrements PacLvlDoneLo/Hi.
;!      clobbers  A,BC,DE,HL,IX
PL_TCKLV:
        LD      A,(PW_RNDDN)
        OR      A
        RET     Z
        LD      HL,(PW_LVLD1)
        LD      A,H
        OR      L
        JP      Z,PL_ADVNC
        DEC     HL
        LD      (PW_LVLD1),HL
        RET

; TickPowerTimer —
; Decrement the 16-bit PacPowerTimer each frame.
; On expiry: sets all three Monster states to
; PacEnemyAtk and restores the running LCD.
;!      clobbers  A,DE,HL
PL_TCKPW:
        LD      HL,(PW_PWRT1)
        LD      A,H
        OR      L
        RET     Z
        DEC     HL
        LD      (PW_PWRT1),HL
        LD      A,H
        OR      L
        RET     NZ
        LD      A,PC_ENMYT
        LD      (PW_ENMYS),A
        LD      (PW_ENMY1),A
        LD      (PW_ENMY6),A
        JP      PU_LCDS4

; PacIsLevel2Plus —
; Check whether the third Monster is active.
; Returns carry clear when PacLevel >= 2,
; carry set when PacLevel < 2. A contains PacLevel
; after the comparison.
;!      out       A,carry,zero
PL_ISLVL:
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
PL_TCKNM:
        LD      A,(PW_SPLSH)
        OR      A
        RET     NZ
        LD      A,(PW_PLYRC)
        OR      A
        RET     NZ
        LD      A,(PW_RNDDN)
        OR      A
        RET     NZ
        CALL    PL_TCKN1
        RET     C
        LD      A,(IX + PC_MNST2)
        DEC     A
        LD      (IX + PC_MNST2),A
        RET     NZ
        LD      A,(PW_ENMYP)
        LD      (IX + PC_MNST2),A
        LD      A,(IX + PC_MNST1)
        CP      PC_ENMYT
        JP      Z,PL_ENMYT
        JP      PL_ENMYW

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
PL_ENMYT:
        CALL    PL_ENMY0
        LD      A,(IX + PC_MNSTR)
        CALL    PL_ENMYG
        LD      L,A ; L = immediate reverse direction
        LD      A,D
        PUSH    DE
        PUSH    HL
        CALL    PL_ENM10
        POP     HL
        POP     DE
        RET     C
        LD      A,E
        CALL    PL_ENM10
        RET     C
        JP      PL_ENMYW

; EnemyTryChase —
; Try chase direction A for the monster at IX.
; L holds the immediate reverse direction to forbid.
; Returns carry clear when A is zero, when A equals L,
; or when the resulting move is blocked; carry set
; means EnemyTryMove committed the step.
;!      in        A,L,IX
;!      out       BC,A,carry,zero
;!      clobbers  E
PL_ENM10:
        OR      A
        RET     Z
        CP      L
        JR      Z,PL_ENMYC
        CALL    PL_ENM13
        RET
PL_ENMYC:
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
PL_ENMY0:
        CALL    PL_ENMY9
        LD      H,A ; H = horizontal distance
        LD      D,B ; D = horizontal reducing direction
        CALL    PL_ENM17
        LD      L,A ; L = vertical distance
        LD      E,B ; E = vertical reducing direction
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
PL_ENMY9:
        LD      A,(IX + MonsterX)
        LD      C,A
        LD      A,(PlayerX)
        CP      C
        JR      Z,PL_ENMYH
        JR      C,PL_ENMYA
        SUB     C
        LD      B,PC_DRLFT
        RET
PL_ENMYA:
        LD      A,C
        LD      B,A
        LD      A,(PlayerX)
        LD      C,A
        LD      A,B
        SUB     C
        LD      B,PC_DRRGH
        RET
PL_ENMYH:
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
PL_ENM17:
        LD      A,(IX + MonsterY)
        LD      C,A
        LD      A,(PlayerY)
        CP      C
        JR      Z,PL_ENM16
        JR      C,PL_ENM18
        SUB     C
        LD      B,PC_DRDWN
        RET
PL_ENM18:
        LD      A,C
        LD      B,A
        LD      A,(PlayerY)
        LD      C,A
        LD      A,B
        SUB     C
        LD      B,PacDirUp
        RET
PL_ENM16:
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
PL_ENMYW:
        LD      A,(IX + MonsterX)
        LD      B,A
        LD      A,(IX + MonsterY)
        LD      C,A
        LD      A,(IX + PC_MNSTR)
        CALL    PL_ENMYG
        LD      D,A ; D = reverse direction fallback
        LD      A,B
        ADD     A,C
        LD      E,A
        LD      A,(PacLevel)
        ADD     A,E
        LD      E,A
        LD      A,(IX + PC_MNSTR)
        ADD     A,E
        AND     $03
        INC     A ; A = first candidate direction, 1..4
        LD      E,A
        LD      H,4
PL_ENMYQ:
        LD      A,E
        CP      D
        JR      Z,PL_ENMYU
        PUSH    DE
        PUSH    HL
        CALL    PL_ENM13
        POP     HL
        POP     DE
        RET     C
PL_ENMYU:
        INC     E
        LD      A,E
        CP      5
        JR      C,PL_ENMYV
        LD      E,1
PL_ENMYV:
        DEC     H
        JR      NZ,PL_ENMYQ
        LD      A,D
        CALL    PL_ENM13
        RET

; EnemyOpposite —
; A contains a PacDir value. The opposite direction is
; returned in A: up/down or left/right. Flags are
; incidental.
;!      in        A
;!      out       A,carry
PL_ENMYG:
        CP      PacDirUp
        JR      Z,PL_ENMYP
        CP      PC_DRDWN
        JR      Z,PL_ENMYJ
        CP      PC_DRLFT
        JR      Z,PL_ENMYI
        LD      A,PC_DRLFT
        RET
PL_ENMYP:
        LD      A,PC_DRDWN
        RET
PL_ENMYJ:
        LD      A,PacDirUp
        RET
PL_ENMYI:
        LD      A,PC_DRRGH
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
PL_ENM13:
        LD      E,A
        LD      A,(IX + MonsterX)
        LD      B,A
        LD      A,(IX + MonsterY)
        LD      C,A
        LD      A,E
        CP      PC_DRLFT
        JR      Z,PL_ENM12
        CP      PC_DRRGH
        JR      Z,PL_ENM14
        CP      PacDirUp
        JR      Z,PL_ENM15
        CP      PC_DRDWN
        JR      Z,PL_ENM11
        OR      A
        RET
PL_ENM12:
        LD      A,B
        CP      PC_WRLDM
        JR      NC,PL_ENMYZ
        INC     B
        JR      PL_ENMY1
PL_ENM14:
        LD      A,B
        OR      A
        JR      Z,PL_ENMYZ
        DEC     B
        JR      PL_ENMY1
PL_ENM15:
        LD      A,C
        OR      A
        JR      Z,PL_ENMYZ
        DEC     C
        JR      PL_ENMY1
PL_ENM11:
        LD      A,C
        CP      PC_WRLDM
        JR      NC,PL_ENMYZ
        INC     C
PL_ENMY1:
        PUSH    DE
        CALL    PV_ISWLL
        POP     DE
        JR      C,PL_ENMYZ
        LD      A,B
        LD      (IX + MonsterX),A
        LD      A,C
        LD      (IX + MonsterY),A
        LD      A,E
        LD      (IX + PC_MNSTR),A
        SCF
        RET
PL_ENMYZ:
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
PL_TCKN1:
        LD      A,(IX + PC_MNRSP)
        OR      A
        RET     Z
        LD      A,(IX + PC_MNST2)
        OR      A
        JR      Z,PL_TCKN2
        DEC     A
        LD      (IX + PC_MNST2),A
        JR      Z,PL_TCKN2
        SCF
        RET
PL_TCKN2:
        LD      A,PC_ENMY3
        LD      (IX + PC_MNST2),A
        LD      A,(IX + PC_MNRSP)
        DEC     A
        LD      (IX + PC_MNRSP),A
        JR      Z,PL_TCKN0
        SCF
        RET
PL_TCKN0:
        LD      A,PC_ENMYT
        LD      (IX + PC_MNST1),A
        CALL    PL_ENMYX
        LD      A,PC_DRRGH
        LD      (IX + PC_MNSTR),A
        LD      A,(PW_ENMYP)
        LD      (IX + PC_MNST2),A
        CALL    PU_LCDS4
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
PL_ENMYX:
        LD      HL,PD_ENMYS
        LD      B,$FF ; B = best distance; 0xFF means no best yet
        LD      DE,0 ; D = best x, E = best y
PL_ENMYY:
        LD      A,(HL)
        CP      $FF
        JR      Z,PL_ENMYR
        LD      C,A ; C = candidate x
        INC     HL
        LD      A,(HL) ; A = candidate y
        INC     HL
        PUSH    HL
        LD      H,A ; H = candidate y
        LD      L,C ; L = candidate x
        PUSH    DE
        CALL    PL_ENMYF
        POP     DE
        JR      C,PL_ENMYK
        PUSH    BC
        CALL    PL_ENMYM
        POP     BC
        LD      C,A ; C = candidate distance
        LD      A,B
        CP      $FF
        JR      Z,PL_ENMYL
        LD      A,C
        CP      B
        JR      Z,PL_ENMYK
        JR      C,PL_ENMYK
PL_ENMYL:
        LD      B,C
        LD      D,L
        LD      E,H
PL_ENMYK:
        POP     HL
        JR      PL_ENMYY
PL_ENMYR:
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
PL_ENMYM:
        PUSH    DE
        CALL    PL_ENMYS
        JR      C,PL_ENMYO
        CALL    PL_ENMY5
        CP      8
        JR      C,PL_ENMYO
        LD      C,A
        PUSH    BC
        CALL    PL_ENMY4
        POP     BC
        ADD     A,C
        POP     DE
        RET
PL_ENMYO:
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
PL_ENMYS:
        LD      A,(ViewX)
        LD      C,A
        LD      A,L
        CP      C
        JR      C,PL_ENMYN
        SUB     C
        CP      RowCount
        JR      NC,PL_ENMYN
        LD      A,(ViewY)
        LD      C,A
        LD      A,H
        CP      C
        JR      C,PL_ENMYN
        SUB     C
        CP      RowCount
        JR      NC,PL_ENMYN
        SCF
        RET
PL_ENMYN:
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
PL_ENMYF:
        LD      DE,Monster0
        CALL    PL_ENMYB
        RET     C
        LD      DE,Monster1
        CALL    PL_ENMYB
        RET     C
        CALL    PL_ISLVL
        JR      C,PL_ENMYE
        LD      DE,Monster2
        JP      PL_ENMYB

; EnemyOccByDe —
; Test monster record DE against candidate cell
; L=x, H=y. IX identifies the current monster to
; ignore. Returns carry set when DE is another active
; monster at that cell; otherwise carry clear.
;!      in        IX,DE,HL
;!      out       A,carry,zero
;!      clobbers  DE
PL_ENMYB:
        PUSH    HL
        PUSH    DE
        PUSH    IX
        POP     HL
        OR      A
        SBC     HL,DE
        POP     DE
        POP     HL
        JR      Z,PL_ENMYE
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
        CP      PC_ENMYR
        JR      Z,PL_ENMYE
        LD      A,(DE)
        CP      L
        JR      NZ,PL_ENMYE
        INC     DE
        LD      A,(DE)
        CP      H
        JR      NZ,PL_ENMYE
        SCF
        RET
PL_ENMYE:
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
PL_ENMY4:
        LD      B,0 ; B = accumulated distance Score
        LD      DE,Monster0
        CALL    PL_ENMYD
        LD      DE,Monster1
        CALL    PL_ENMYD
        LD      A,B
        LD      C,A
        CALL    PL_ISLVL
        LD      B,C
        LD      A,B
        RET     C
        LD      DE,Monster2
        CALL    PL_ENMYD
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
PL_ENMYD:
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
        CALL    PL_ENMY3
        ADD     A,B
        LD      B,A
        RET

; EnemyDistPlayer —
; Return in A the Manhattan distance from cell
; L=x, H=y to the player.
;!      in        HL
;!      out       A
;!      clobbers  C
PL_ENMY5:
        PUSH    DE
        LD      A,(PlayerX)
        LD      E,A
        LD      A,(PlayerY)
        LD      D,A
        CALL    PL_ENMY3
        POP     DE
        RET

; EnemyDistDe —
; Return in A the Manhattan distance from cell
; L=x, H=y to cell E=x, D=y.
;!      in        DE,HL
;!      out       A
;!      clobbers  C
PL_ENMY3:
        LD      A,L
        LD      C,A
        LD      A,E
        CP      C
        JR      NC,PL_ENMY7
        LD      A,C
        LD      C,A
        LD      A,E
        SUB     C
        NEG
        LD      C,A
        JR      PL_ENMY2
PL_ENMY7:
        SUB     C
        LD      C,A
PL_ENMY2:
        LD      A,H
        PUSH    BC
        LD      C,A
        LD      A,D
        CP      C
        JR      NC,PL_ENMY8
        LD      A,C
        LD      C,A
        LD      A,D
        SUB     C
        NEG
        JR      PL_ENMY6
PL_ENMY8:
        SUB     C
PL_ENMY6:
        POP     BC
        ADD     A,C
        RET

; PacAdvanceLevel —
; Increment PacLevel and speed up the Monsters.
; Reduces EnemyPeriodCur by PacEnemyPerStep down
; to PacEnemyPerMin, then restarts the level via
; InitLevelState and shows the running screen.
;!      clobbers  A,BC,DE,HL,IX
PL_ADVNC:
        LD      HL,PacLevel
        INC     (HL)
        LD      A,(PW_ENMYP)
        CP      PC_ENMY1 + PC_ENMY2
        JR      C,PL_ADVN0
        SUB     PC_ENMY2
        LD      (PW_ENMYP),A
        CALL    PI_INTLV
        JP      PU_LCDS4
PL_ADVN0:
        LD      A,PC_ENMY1
        LD      (PW_ENMYP),A
        CALL    PI_INTLV
        JP      PU_LCDS4
