; RebuildFb —
; Full Framebuffer rebuild from current world
; and entity state.
; Renders world, power pills, active Monsters
; (Monster2 skipped before level 2), and player into
; FramebufferBack, then copies it to Framebuffer.
;!      clobbers  A,BC,DE,HL,IX
CM_RBLDF:
        CALL    FC_FBCLR
        CALL    PR_RNDWR
        CALL    PR_RNDP6
        LD      IX,Monster0
        CALL    PR_RNDNM
        LD      IX,Monster1
        CALL    PR_RNDNM
        LD      A,(PacLevel)
        CP      2
        JR      C,PR_RBLDM
        LD      IX,Monster2
        CALL    PR_RNDNM
PR_RBLDM:
        CALL    PR_RNDPL
        JP      FC_FBCPY

; RendGOverBack —
; Fill FramebufferBack with PacColorGOver.
; Used as a dramatic full-matrix flash.
;!      clobbers  A,B,HL
PR_RNDGV:
        LD      HL,CM_FRMB0
        LD      B,RowCount
PR_RNDG3:
        LD      A,PC_CLRGV
        AND     ColorRed
        JR      Z,PR_RNDG2
        LD      A,$FF
PR_RNDG2:
        LD      (HL),A
        INC     HL
        LD      A,PC_CLRGV
        AND     SC_CLRGR
        JR      Z,PR_RNDG1
        LD      A,$FF
PR_RNDG1:
        LD      (HL),A
        INC     HL
        LD      A,PC_CLRGV
        AND     SC_CLRB0
        JR      Z,PR_RNDG0
        LD      A,$FF
PR_RNDG0:
        LD      (HL),A
        INC     HL
        XOR     A
        LD      (HL),A ; aux off
        INC     HL
        DJNZ    PR_RNDG3
        RET

; RendLvlDoneBack —
; Fill FramebufferBack with PacColorRound.
; Used as the level-complete visual cue.
;!      clobbers  A,B,HL
PR_RNDL0:
        LD      HL,CM_FRMB0
        LD      B,RowCount
PR_RNDL1:
        LD      A,PC_CLRRN
        AND     ColorRed
        JR      Z,PR_RNDL3
        LD      A,$FF
PR_RNDL3:
        LD      (HL),A
        INC     HL
        LD      A,PC_CLRRN
        AND     SC_CLRGR
        JR      Z,PR_RNDL2
        LD      A,$FF
PR_RNDL2:
        LD      (HL),A
        INC     HL
        LD      A,PC_CLRRN
        AND     SC_CLRB0
        JR      Z,PR_RNDLV
        LD      A,$FF
PR_RNDLV:
        LD      (HL),A
        INC     HL
        XOR     A
        LD      (HL),A ; aux off
        INC     HL
        DJNZ    PR_RNDL1
        RET

; RendWorldBack —
; Render the full 8x8 viewport into back-buffer.
; Calls RendWorldRow with A=screen row for each row
; 0..7. Raw outputs are loop residue, not render state.
;!      out       HL,A,zero
;!      clobbers  B,DE
PR_RNDWR:
        LD      B,0
PR_RNDW0:
        LD      A,B
        PUSH    BC
        CALL    PR_RNDW1
        POP     BC
        INC     B
        LD      A,B
        CP      RowCount
        JR      C,PR_RNDW0
        RET

; RendWorldRow —
; Render screen row A from world and eaten maps.
; Clips PacWorldRows and PacEatenRows to the 8-bit
; viewport window via WindowByteBc.
; Uneaten open path = ~(wall | eaten); both wall
; and path are written via WrWorldColors.
;!      in        A
;!      out       HL
;!      clobbers  A,BC,DE
PR_RNDW1:
        LD      C,A ; C = screen row
        ADD     A,A
        ADD     A,A
        LD      E,A
        LD      D,0
        LD      HL,CM_FRMB0
        ADD     HL,DE
        PUSH    HL ; target Framebuffer row

        LD      A,(ViewY)
        ADD     A,C ; A = world row
        ADD     A,A
        LD      E,A
        LD      D,0
        PUSH    DE ; source byte offset

        LD      HL,PD_WRLDR
        ADD     HL,DE
        LD      A,(HL)
        LD      B,A ; B = high byte of 15-bit row
        INC     HL
        LD      A,(HL)
        LD      C,A ; C = low byte of 15-bit row
        LD      A,(ViewX)
        CALL    PR_WNDWB
        POP     DE
        PUSH    AF ; visible wall mask

        LD      HL,PW_ETNRW
        ADD     HL,DE
        LD      A,(HL)
        LD      B,A
        INC     HL
        LD      A,(HL)
        LD      C,A
        LD      A,(ViewX)
        CALL    PR_WNDWB
        LD      B,A ; B = visible eaten mask
        POP     AF
        LD      C,A ; C = visible wall mask
        OR      B
        CPL ; A = visible uneaten open path mask
        LD      D,A
        POP     HL ; target Framebuffer row
        JP      PR_WRWR1

; WrWorldColors —
; Write R/G/B bytes for one world row.
; HL points to the row's red plane byte. C contains
; the visible wall mask, drawn in the colour selected
; by GetWallColor. D contains the uneaten-path mask,
; drawn in PacColorPath. The row aux-byte address is
; returned in HL.
;!      in        C,D,HL
;!      out       HL
;!      clobbers  A,B
PR_WRWR1:
        XOR     A
        LD      B,A
        CALL    PR_GTWL0
        AND     ColorRed
        JR      Z,PR_WRWR4
        LD      B,C
PR_WRWR4:
        LD      A,PC_CLRPT
        AND     ColorRed
        JR      Z,PR_WRWR5
        LD      A,B
        OR      D
        LD      B,A
PR_WRWR5:
        LD      (HL),B
        INC     HL

        XOR     A
        LD      B,A
        CALL    PR_GTWL0
        AND     SC_CLRGR
        JR      Z,PR_WRWR2
        LD      B,C
PR_WRWR2:
        LD      A,PC_CLRPT
        AND     SC_CLRGR
        JR      Z,PR_WRWR3
        LD      A,B
        OR      D
        LD      B,A
PR_WRWR3:
        LD      (HL),B
        INC     HL

        XOR     A
        LD      B,A
        CALL    PR_GTWL0
        AND     SC_CLRB0
        JR      Z,PR_WRWRL
        LD      B,C
PR_WRWRL:
        LD      A,PC_CLRPT
        AND     SC_CLRB0
        JR      Z,PR_WRWR0
        LD      A,B
        OR      D
        LD      B,A
PR_WRWR0:
        LD      (HL),B
        INC     HL
        RET

; GetWallColor —
; Choose wall colour based on game state.
; Returns PacColorCaught when caught,
; PacColorDone when round is complete,
; PacColorWall otherwise, in A. Flags are incidental.
;!      out       A,carry
PR_GTWL0:
        LD      A,(PW_PLYRC)
        OR      A
        JR      NZ,PR_GTWLL
        LD      A,(PW_RNDDN)
        OR      A
        JR      NZ,PR_GTWL1
        LD      A,PC_CLRWL
        RET
PR_GTWLL:
        LD      A,PC_CLRCG
        RET
PR_GTWL1:
        LD      A,PC_CLRDN
        RET

; WindowByteBc —
; Extract an 8-bit viewport window from a 16-bit row.
; A contains the horizontal window offset. BC contains
; the full 15-column row with bit 15 = column 0.
; The visible byte is returned in A.
;!      in        A,BC
;!      out       A,C,D,carry,zero,sign,parity,halfCarry
;!      clobbers  B
PR_WNDWB:
        LD      D,A
        LD      A,D
        OR      A
        JR      Z,PR_WNDW0
PR_WNDWS:
        SLA     C
        RL      B
        DEC     D
        JR      NZ,PR_WNDWS
PR_WNDW0:
        LD      A,B
        RET

; RendPwrPills —
; Render all uneaten power pills for a full
; frame rebuild.
; Iterates PacPowerPills; skips entries with the
; corresponding PacPwrPillsEat bit set. Raw HL/D
; outputs are table-walk residue.
;!      out       HL,D
;!      clobbers  A,BC
PR_RNDP6:
        LD      HL,PD_PWRPL
        LD      D,1
PR_RNDP3:
        LD      A,(HL)
        CP      $FF
        RET     Z
        LD      B,A ; B = world x
        INC     HL
        LD      A,(HL)
        INC     HL
        LD      C,A ; C = world y
        LD      A,(PW_PWRPL)
        AND     D
        JR      NZ,PR_RNDP4
        PUSH    HL
        PUSH    DE
        CALL    PR_RNDPW
        POP     DE
        POP     HL
PR_RNDP4:
        SLA     D
        JR      PR_RNDP3

; RendPwrPillRow —
; Render uneaten power pills on screen row A.
; Used in the per-row cooperative render path; skips
; table entries whose world Y does not map to A.
;!      in        A
;!      out       HL,D
;!      clobbers  A,BC,E
PR_RNDP5:
        LD      E,A ; E = target screen row
        LD      HL,PD_PWRPL
        LD      D,1
PR_RNDP7:
        LD      A,(HL)
        CP      $FF
        RET     Z
        LD      B,A ; B = world x
        INC     HL
        LD      A,(HL)
        INC     HL
        LD      C,A ; C = world y
        LD      A,(PW_PWRPL)
        AND     D
        JR      NZ,PR_RNDP8
        LD      A,(ViewY)
        ADD     A,E
        CP      C
        JR      NZ,PR_RNDP8
        PUSH    HL
        PUSH    DE
        CALL    PR_RNDPW
        POP     DE
        POP     HL
PR_RNDP8:
        SLA     D
        JR      PR_RNDP7

; RendPwrPillBc —
; Render one power pill if it is in the viewport.
; B=x and C=y identify the pill's world cell. Skips
; silently when off screen; otherwise maps to a
; FramebufferBack row and calls FbSetCell with
; PacColorPwrPill.
;!      in        BC
;!      clobbers  A,BC,DE,HL
PR_RNDPW:
        LD      A,(ViewY)
        LD      E,A
        LD      A,C
        SUB     E ; A = screenY
        CP      RowCount
        RET     NC
        ADD     A,A
        ADD     A,A
        LD      E,A
        LD      D,0
        LD      HL,CM_FRMB0
        ADD     HL,DE

        LD      A,(ViewX)
        LD      E,A
        LD      A,B
        SUB     E ; A = screenX
        CP      RowCount
        RET     NC
        CALL    MxMask
        LD      C,A

        LD      A,PC_CLRPW
        JP      FD_FBSTC

; RendEnemyBack —
; Render the monster record at IX into FramebufferBack.
; Respawning monsters are skipped. Flee colour is used
; only while the monster is in flee state and the power
; timer is still visibly active; otherwise attack
; colour is written with FbSetCell.
;!      in        IX
;!      clobbers  A,BC,DE,HL
PR_RNDNM:
        LD      A,(IX + PC_MNRSP)
        OR      A
        RET     NZ
        LD      A,(IX + MonsterY)
        LD      B,A
        LD      A,(ViewY)
        LD      C,A
        LD      A,B
        SUB     C ; A = screenY
        CP      RowCount
        RET     NC
        ADD     A,A
        ADD     A,A
        LD      E,A
        LD      D,0
        LD      HL,CM_FRMB0
        ADD     HL,DE

        LD      A,(IX + MonsterX)
        LD      B,A
        LD      A,(ViewX)
        LD      C,A
        LD      A,B
        SUB     C ; A = screenX
        CP      RowCount
        RET     NC
        CALL    MxMask
        LD      C,A

        PUSH    HL
        LD      A,(IX + PC_MNST1)
        CP      PC_ENMYF
        JR      NZ,PR_RNDNT
        LD      HL,(PW_PWRT1)
        LD      A,H
        OR      L
        JR      Z,PR_RNDNT
        LD      A,H
        OR      A
        JR      NZ,PR_RNDNF
        LD      A,L
        AND     PC_PWRWR
        JR      Z,PR_RNDNT
PR_RNDNF:
        POP     HL
        JR      PR_RNDN0
PR_RNDNT:
        POP     HL
        LD      A,PC_CLRNT
        JP      FD_FBSTC
PR_RNDN0:
        LD      A,PC_CLRNF
        JP      FD_FBSTC

; RendMonsRow —
; Render active monsters that map to screen row A.
; Calls RendEnemyIfRow for Monster0 and Monster1;
; Monster2 is skipped before level 2.
;!      in        A
;!      clobbers  A,BC,E,HL,IX
PR_RNDMN:
        LD      C,A
        PUSH    BC
        LD      E,C
        LD      IX,Monster0
        CALL    PR_RNDN1
        POP     BC
        PUSH    BC
        LD      E,C
        LD      IX,Monster1
        CALL    PR_RNDN1
        POP     BC
        PUSH    BC
        CALL    PL_ISLVL
        POP     BC
        RET     C
        LD      E,C
        LD      IX,Monster2
        JP      PR_RNDN1

; RendEnemyIfRow —
; Render the monster record at IX only when its world
; Y maps to screen row E. Respawning or off-row
; monsters return without drawing.
;!      in        IX,E
;!      clobbers  A,BC,HL
PR_RNDN1:
        LD      A,(IX + PC_MNRSP)
        OR      A
        RET     NZ
        LD      A,(IX + MonsterY)
        LD      B,A
        LD      A,(ViewY)
        LD      C,A
        LD      A,B
        SUB     C
        CP      RowCount
        RET     NC
        CP      E
        RET     NZ
        PUSH    DE
        CALL    PR_RNDNM
        POP     DE
        RET

; RendPlyBack —
; Render the player pixel into FramebufferBack.
; Colour: yellow (PacColorPlayer) normally;
; white (PacColorRound) when round is complete;
; red (PacColorEnAtk) when caught.
; Skips silently when the player is off-screen.
;!      clobbers  A,BC,DE,HL
PR_RNDPL:
        LD      A,(PlayerY)
        LD      B,A
        LD      A,(ViewY)
        LD      C,A
        LD      A,B
        SUB     C ; A = screenY
        CP      RowCount
        RET     NC
        ADD     A,A
        ADD     A,A
        LD      E,A
        LD      D,0
        LD      HL,CM_FRMB0
        ADD     HL,DE

        LD      A,(PlayerX)
        LD      B,A
        LD      A,(ViewX)
        LD      C,A
        LD      A,B
        SUB     C ; A = screenX
        CP      RowCount
        RET     NC
        CALL    MxMask
        LD      C,A

        LD      A,(PW_PLYRC)
        OR      A
        JR      NZ,PR_RNDP0

        LD      A,(PW_RNDDN)
        OR      A
        JR      NZ,PR_RNDP2
        LD      A,PC_CLRPL
        JP      FD_FBSTC
PR_RNDP2:
        LD      A,PC_CLRRN
        JP      FD_FBSTC
PR_RNDP0:
        LD      A,PC_CLRNT
        JP      FD_FBSTC

; RendPlyRow —
; Render the player only when PlayerY maps to screen
; row A. Matching rows delegate to RendPlyBack;
; other rows return without drawing.
;!      in        A
;!      clobbers  A,BC,DE,HL
PR_RNDP1:
        LD      E,A
        LD      A,(PlayerY)
        LD      B,A
        LD      A,(ViewY)
        LD      C,A
        LD      A,B
        SUB     C
        CP      RowCount
        RET     NC
        CP      E
        RET     NZ
        JP      PR_RNDPL
