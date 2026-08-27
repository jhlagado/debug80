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
CM_PLLNP:
        LD      A,(PW_SPLSH)
        OR      A
        JP      NZ,PV_PLLSP
        LD      A,(PW_PLYRC)
        OR      A
        JP      NZ,PV_CGHTR
        LD      A,(PW_RNDDN)
        OR      A
        RET     NZ
        LD      C,SC_APSCN
        RST     $10
        JP      NZ,CM_CLRNP
        LD      E,A
        JR      NC,PV_PLLNN
        LD      A,(PW_PSDAU)
        OR      A
        JP      NZ,CM_HNDLN
        LD      A,E
        CP      KeyPause
        JP      Z,CM_HNDLP
PV_PLLNN:
        LD      A,(PW_PSDAU)
        OR      A
        JP      NZ,CM_CLRNP

        LD      A,E
        CALL    PV_NRMNP
        JR      C,CM_HNDLD
        JP      CM_CLRNP

; PollSplashStart —
; Wait for any key on the splash screen.
; A fresh key clears PacSplashActive and shows the
; running HUD; a held/no-key scan leaves the splash
; active and returns.
;!      clobbers  A,BC,DE,HL,IX,IY
PV_PLLSP:
        LD      C,SC_APSCN
        RST     $10
        RET     NZ
        XOR     A
        LD      (PW_SPLSH),A
        JP      PU_LCDS4

; CaughtRestart —
; Handle input while the player is caught.
; Counts down PacGOverGate before accepting keys.
; Once the gate expires, a fresh key restarts the
; whole game when PacGameOver is set, or resumes the
; current game after a lost life.
;!      out       carry,A
;!      clobbers  HL
PV_CGHTR:
        LD      HL,(PW_GVRG1)
        LD      A,H
        OR      L
        JR      Z,PV_CGHT0
        DEC     HL
        LD      (PW_GVRG1),HL
        RET
PV_CGHT0:
        LD      C,SC_APSCN
        RST     $10
        RET     NZ
        LD      A,(PW_GMVRA)
        OR      A
        JP      Z,PV_RSMCG
        JP      CM_INTST

; ResumeCaught —
; Resume after a life loss (lives remain).
; Resets player and Monsters via InitPlyMons;
; preserves Score, PacLevel, eaten paths, and lives;
; then returns to the running HUD and rebuilds play.
;!      clobbers  A,BC,DE,HL,IX
PV_RSMCG:
        CALL    PI_INTPL
        XOR     A
        LD      (PW_GVRG1),A
        LD      (PW_GVRG0),A
        CALL    PU_LCDS4
        JP      CM_RBLDF

; HandlePauseKey —
; Pause the game on a fresh pause-key press.
; Sets PacPaused, shows the pause screen, and clears
; key-repeat state before returning to the main loop.
;!      clobbers  A,DE,HL
CM_HNDLP:
        LD      A,1
        LD      (PW_PSDAU),A
        CALL    PU_LCDS3
        JP      CM_CLRNP

; HandleUnpause —
; Resume from pause on any new key press.
; Restores power-mode LCD if PacPowerTimer is
; active; otherwise shows the running HUD. Clears
; key-repeat state. The final carry flag is inherited
; from the display path, not an unpause result.
;!      out       carry
;!      clobbers  A,DE,HL
CM_HNDLN:
        XOR     A
        LD      (PW_PSDAU),A
        LD      A,(PW_PWRT1)
        LD      E,A
        LD      A,(PW_PWRT0)
        OR      E
        JR      Z,PV_UNPSS
        CALL    PU_LCDS6
        JP      CM_CLRNP
PV_UNPSS:
        CALL    PU_LCDS4
        JP      CM_CLRNP

CM_HNDLD:
        LD      A,(LastKey)
        CP      E
        JR      Z,CM_HLDSM

        LD      A,E
        LD      (LastKey),A
        LD      A,1
        LD      (CM_MVCLD),A

CM_HLDSM:
        LD      A,(CM_MVCLD)
        DEC     A
        LD      (CM_MVCLD),A
        RET     NZ

        LD      A,PC_MVPRD
        LD      (CM_MVCLD),A

        LD      A,E
        CP      PC_DRLFT
        JR      Z,PV_MVPL0
        CP      PC_DRRGH
        JR      Z,PV_MVPL2
        CP      PacDirUp
        JR      Z,PV_MVPL1
        CP      PC_DRDWN
        JR      Z,PV_MVPLY
        RET

; NormInputDir —
; Map a raw keypad code to a PACMO_DIR_* intent.
; A contains the raw key code. Valid movement keys set
; carry and put the PacDir value in E; all other keys
; clear carry and leave no direction to consume.
;!      in        A
;!      out       A,E,carry,zero
PV_NRMNP:
        CP      KeyLeft
        JR      Z,PV_NRML0
        CP      KeyRight
        JR      Z,PV_NRML1
        CP      PacKey1
        JR      Z,PV_NRML0
        CP      PacKey3
        JR      Z,PV_NRML1
        CP      SC_KYRT0
        JR      Z,PV_NRML2
        CP      PacKey6
        JR      Z,PV_NRML2
        CP      SC_KYRTT
        JR      Z,PV_NRMLZ
        CP      PacKey2
        JR      Z,PV_NRMLZ
        OR      A
        RET
PV_NRML0:
        LD      E,PC_DRRGH
        SCF
        RET
PV_NRML1:
        LD      E,PC_DRLFT
        SCF
        RET
PV_NRML2:
        LD      E,PacDirUp
        SCF
        RET
PV_NRMLZ:
        LD      E,PC_DRDWN
        SCF
        RET

; ClearInputRpt —
; Reset key-repeat state to a full period.
; MoveCooldown is reloaded to PacMovePeriod and
; LastKey is set to NoKey.
;!      clobbers  A
CM_CLRNP:
        LD      A,PC_MVPRD
        LD      (CM_MVCLD),A
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
PV_MVPL0:
        LD      A,(PlayerX)
        CP      PC_WRLDM
        RET     NC
        INC     A
        LD      B,A
        LD      A,(PlayerY)
        LD      C,A
        JP      PV_TRYMV

; MovePlyRight —
; Step the player in the PacDirRight direction.
; In world coordinates this decrements X (moving
; right on screen decreases world X).
; Builds target B=x, C=y for TryMovePlyBc, or returns
; immediately when PlayerX is 0.
;!      out       zero
;!      clobbers  A,BC,DE,HL,IX
PV_MVPL2:
        LD      A,(PlayerX)
        OR      A
        RET     Z
        DEC     A
        LD      B,A
        LD      A,(PlayerY)
        LD      C,A
        JP      PV_TRYMV

; MovePlayerUp —
; Step the player upward (decrement PlayerY).
; Builds target B=x, C=y for TryMovePlyBc, or returns
; immediately when PlayerY is 0.
;!      out       zero
;!      clobbers  A,BC,DE,HL,IX
PV_MVPL1:
        LD      A,(PlayerY)
        OR      A
        RET     Z
        DEC     A
        LD      C,A
        LD      A,(PlayerX)
        LD      B,A
        JP      PV_TRYMV

; MovePlayerDown —
; Step the player downward (increment PlayerY).
; Builds target B=x, C=y for TryMovePlyBc, or returns
; immediately at PacWorldMax.
;!      out       zero
;!      clobbers  A,BC,DE,HL,IX
PV_MVPLY:
        LD      A,(PlayerY)
        CP      PC_WRLDM
        RET     NC
        INC     A
        LD      C,A
        LD      A,(PlayerX)
        LD      B,A
        JP      PV_TRYMV

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
PV_TRYMV:
        CALL    PV_ISWLL
        RET     C
        LD      A,B
        LD      (PlayerX),A
        LD      A,C
        LD      (PlayerY),A
        CALL    PV_ETPWR
        CALL    PV_MRKTN
        CALL    PV_CHCKR
        LD      IX,Monster0
        CALL    PV_CHCKP
        LD      IX,Monster1
        CALL    PV_CHCKP
        CALL    PL_ISLVL
        JP      C,PV_UPDVW
        LD      IX,Monster2
        CALL    PV_CHCKP
        JP      PV_UPDVW

; CheckPlyCaught —
; Compare the player with the monster record at IX.
; Returns immediately if the player is already caught,
; the monster is respawning, or the cells differ. On a
; matching cell, fleeing monsters are eaten for score;
; attacking monsters trigger EnterCaught.
;!      in        IX
;!      clobbers  A,BC,DE,HL,IX
PV_CHCKP:
        LD      A,(PW_PLYRC)
        OR      A
        RET     NZ
        LD      A,(IX + PC_MNRSP)
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
        LD      A,(IX + PC_MNST1)
        CP      PC_ENMYF
        JR      Z,EatEnemy
        JP      PV_ENTRC

; EnterCaught —
; Process a player-Monster collision.
; Decrements PacLives; if no lives remain, sets
; PacGameOver and shows the game-over screen. With
; lives remaining, shows the caught screen. Both paths
; rebuild the Framebuffer in the caught colour.
;!      clobbers  A,BC,DE,HL,IX
PV_ENTRC:
        LD      A,1
        LD      (PW_PLYRC),A
        LD      HL,PC_GVRTC
        LD      (PW_GVRG1),HL
        LD      HL,PacLives
        LD      A,(HL)
        OR      A
        JR      Z,PV_ENTRF
        DEC     (HL)
        LD      A,(HL)
        OR      A
        JR      Z,PV_ENTRF
        CALL    PS_SNDCG
        CALL    PU_LCDSH
        JP      CM_RBLDF
PV_ENTRF:
        LD      A,1
        LD      (PW_GMVRA),A
        CALL    PS_SNDCG
        CALL    PU_LCDS2
        JP      CM_RBLDF

; EatEnemy —
; Consume the fleeing monster record at IX. Marks it
; respawning, starts its respawn counters, plays the
; enemy-eaten cue, shows the LCD cue, and awards
; PacScoreEnemy. The BC/HL outputs come from score
; formatting, not from monster logic.
;!      in        IX
;!      out       BC,HL
;!      clobbers  A,DE
EatEnemy:
        LD      A,PC_ENMYR
        LD      (IX + PC_MNST1),A
        LD      A,PC_ENMY3
        LD      (IX + PC_MNST2),A
        LD      A,PC_ENMY4
        LD      (IX + PC_MNRSP),A
        CALL    PS_SNDTN
        CALL    PU_LCDS1
        LD      A,PC_SCRNM
        JP      PV_ADDSC

; EatPwrPillBc —
; Consume a power pill at world cell B=x, C=y when
; present and not already eaten. Sets the pill bit in
; PacPwrPillsEat, awards PacScorePower, starts the
; power timer and sound, and sets all monsters to flee.
;!      in        BC
;!      out       HL,D
;!      clobbers  A,E
PV_ETPWR:
        LD      HL,PD_PWRPL
        LD      D,1
PV_ETPW0:
        LD      A,(HL)
        CP      $FF
        RET     Z
        CP      B
        INC     HL
        JR      NZ,PV_ETPW1
        LD      A,(HL)
        CP      C
        JR      NZ,PV_ETPW1
        LD      A,(PW_PWRPL)
        AND     D
        RET     NZ
        LD      A,(PW_PWRPL)
        OR      D
        LD      (PW_PWRPL),A
        PUSH    BC
        LD      A,PC_SCRPW
        CALL    PV_ADDSC
        CALL    PS_SNDPW
        POP     BC
        LD      HL,PC_PWRTM
        LD      (PW_PWRT1),HL
        LD      A,PC_ENMYF
        LD      (PW_ENMYS),A
        LD      (PW_ENMY1),A
        LD      (PW_ENMY6),A
        CALL    PU_LCDS6
        RET
PV_ETPW1:
        INC     HL
        SLA     D
        JR      PV_ETPW0

; MarkEatenBc —
; Record path consumption at world cell B=x, C=y.
; Sets the column bit in PacEatenRows for row C.
; B < 8 maps to the row high byte; B >= 8 maps to
; the low byte after subtracting 8. First visits add
; PacScorePath; repeat visits do nothing.
;!      in        BC
;!      out       BC,D
;!      clobbers  A,E,HL
PV_MRKTN:
        LD      A,C
        ADD     A,A
        LD      E,A
        LD      D,0
        LD      HL,PW_ETNRW
        ADD     HL,DE

        LD      A,B
        CP      8
        JR      NC,PV_MRKT0
        CALL    MxMask
        LD      E,A
        LD      A,(HL)
        AND     E
        RET     NZ
        PUSH    HL
        PUSH    DE
        LD      A,PC_SCRPT
        CALL    PV_ADDSC
        POP     DE
        POP     HL
        LD      A,E
        OR      (HL)
        LD      (HL),A
        RET
PV_MRKT0:
        SUB     8
        INC     HL
        CALL    MxMask
        LD      E,A
        LD      A,(HL)
        AND     E
        RET     NZ
        PUSH    HL
        PUSH    DE
        LD      A,PC_SCRPT
        CALL    PV_ADDSC
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
PV_ADDSC:
        LD      E,A
        LD      D,0
        LD      HL,(PacScore)
        ADD     HL,DE
        LD      (PacScore),HL
        JP      CM_UPDSC

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
PV_CHCKR:
        LD      A,(PW_RNDDN)
        OR      A
        RET     NZ
        LD      B,RowCount + 7
        LD      DE,PD_WRLDR
        LD      HL,PW_ETNRW
PV_CHCK0:
        LD      A,(DE)
        OR      (HL)
        CP      $FF
        RET     NZ
        INC     DE
        INC     HL
        LD      A,(DE)
        OR      (HL)
        OR      $01 ; bit 0 is outside the 15-column maze
        CP      $FF
        RET     NZ
        INC     DE
        INC     HL
        DJNZ    PV_CHCK0
        LD      A,1
        LD      (PW_RNDDN),A
        LD      HL,PC_LVLDN
        LD      (PW_LVLD1),HL
        CALL    PS_SNDLV
        CALL    PU_LCDS0
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
PV_ISWLL:
        LD      A,C
        ADD     A,A
        LD      E,A
        LD      D,0
        LD      HL,PD_WRLDR
        ADD     HL,DE
        LD      D,(HL) ; D = high byte, bit 7 is world column 0
        INC     HL
        LD      E,(HL) ; E = low byte, bit 1 is world column 14

        LD      A,B
        OR      A
        JR      Z,PV_WLLTS
PV_WLLSH:
        SLA     E
        RL      D
        DEC     A
        JR      NZ,PV_WLLSH
PV_WLLTS:
        BIT     7,D
        JR      Z,PV_WLLPN
        SCF
        RET
PV_WLLPN:
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
PV_UPDVW:
        LD      A,(PlayerX)
        LD      B,A
        LD      A,(ViewX)
        CALL    PV_ADJST
        LD      (ViewX),A

        LD      A,(PlayerY)
        LD      B,A
        LD      A,(ViewY)
        CALL    PV_ADJST
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
PV_ADJST:
        LD      C,A
        LD      A,B
        SUB     C ; A = player screen coordinate
        CP      3
        JR      C,PV_AXSS0
        CP      5
        JR      NC,PV_AXSSH
        LD      A,C
        RET
PV_AXSS0:
        LD      A,C
        OR      A
        RET     Z
        DEC     A
        RET
PV_AXSSH:
        LD      A,C
        CP      PC_VWMXI
        RET     NC
        INC     A
        RET
