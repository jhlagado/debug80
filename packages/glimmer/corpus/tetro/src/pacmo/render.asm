; RebuildFb —
; Full Framebuffer rebuild from current world
; and entity state.
; Renders world, power pills, active Monsters
; (Monster2 skipped before level 2), and player into
; FramebufferBack, then copies it to Framebuffer.
;!      clobbers  A,BC,DE,HL,IX
@RebuildFb:
        CALL    FbClearAll
        CALL    RendWorldBack
        CALL    RendPwrPills
        LD      IX,Monster0
        CALL    RendEnemyBack
        LD      IX,Monster1
        CALL    RendEnemyBack
        LD      A,(PacLevel)
        CP      2
        JR      C,RebuildMonsDone
        LD      IX,Monster2
        CALL    RendEnemyBack
RebuildMonsDone:
        CALL    RendPlyBack
        JP      FbCopyAll

; RendGOverBack —
; Fill FramebufferBack with PacColorGOver.
; Used as a dramatic full-matrix flash.
;!      clobbers  A,B,HL
@RendGOverBack:
        LD      HL,FramebufferBack
        LD      B,RowCount
RendGOverRow:
        LD      A,PacColorGOver
        AND     ColorRed
        JR      Z,RendGOverRedOff
        LD      A,0xFF
RendGOverRedOff:
        LD      (HL),A
        INC     HL
        LD      A,PacColorGOver
        AND     ColorGreen
        JR      Z,RendGOverGrnOff
        LD      A,0xFF
RendGOverGrnOff:
        LD      (HL),A
        INC     HL
        LD      A,PacColorGOver
        AND     ColorBlue
        JR      Z,RendGOverBluOff
        LD      A,0xFF
RendGOverBluOff:
        LD      (HL),A
        INC     HL
        XOR     A
        LD      (HL),A                  ; aux off
        INC     HL
        DJNZ    RendGOverRow
        RET

; RendLvlDoneBack —
; Fill FramebufferBack with PacColorRound.
; Used as the level-complete visual cue.
;!      clobbers  A,B,HL
@RendLvlDoneBack:
        LD      HL,FramebufferBack
        LD      B,RowCount
RendLvlDoneRow:
        LD      A,PacColorRound
        AND     ColorRed
        JR      Z,RendLvlRedOff
        LD      A,0xFF
RendLvlRedOff:
        LD      (HL),A
        INC     HL
        LD      A,PacColorRound
        AND     ColorGreen
        JR      Z,RendLvlGrnOff
        LD      A,0xFF
RendLvlGrnOff:
        LD      (HL),A
        INC     HL
        LD      A,PacColorRound
        AND     ColorBlue
        JR      Z,RendLvlBluOff
        LD      A,0xFF
RendLvlBluOff:
        LD      (HL),A
        INC     HL
        XOR     A
        LD      (HL),A                  ; aux off
        INC     HL
        DJNZ    RendLvlDoneRow
        RET

; RendWorldBack —
; Render the full 8x8 viewport into back-buffer.
; Calls RendWorldRow with A=screen row for each row
; 0..7. Raw outputs are loop residue, not render state.
;!      out       HL,A,zero
;!      clobbers  B,DE
@RendWorldBack:
        LD      B,0
RendWorldBackLp:
        LD      A,B
        PUSH    BC
        CALL    RendWorldRow
        POP     BC
        INC     B
        LD      A,B
        CP      RowCount
        JR      C,RendWorldBackLp
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
@RendWorldRow:
        LD      C,A                     ; C = screen row
        ADD     A,A
        ADD     A,A
        LD      E,A
        LD      D,0
        LD      HL,FramebufferBack
        ADD     HL,DE
        PUSH    HL                      ; target Framebuffer row

        LD      A,(ViewY)
        ADD     A,C                     ; A = world row
        ADD     A,A
        LD      E,A
        LD      D,0
        PUSH    DE                      ; source byte offset

        LD      HL,PacWorldRows
        ADD     HL,DE
        LD      A,(HL)
        LD      B,A                     ; B = high byte of 15-bit row
        INC     HL
        LD      A,(HL)
        LD      C,A                     ; C = low byte of 15-bit row
        LD      A,(ViewX)
        CALL    WindowByteBc
        POP     DE
        PUSH    AF                      ; visible wall mask

        LD      HL,PacEatenRows
        ADD     HL,DE
        LD      A,(HL)
        LD      B,A
        INC     HL
        LD      A,(HL)
        LD      C,A
        LD      A,(ViewX)
        CALL    WindowByteBc
        LD      B,A                     ; B = visible eaten mask
        POP     AF
        LD      C,A                     ; C = visible wall mask
        OR      B
        CPL                             ; A = visible uneaten open path mask
        LD      D,A
        POP     HL                      ; target Framebuffer row
        JP      WrWorldColors

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
@WrWorldColors:
        XOR     A
        LD      B,A
        CALL    GetWallColor
        AND     ColorRed
        JR      Z,WrWorldRedPath
        LD      B,C
WrWorldRedPath:
        LD      A,PacColorPath
        AND     ColorRed
        JR      Z,WrWorldRedSet
        LD      A,B
        OR      D
        LD      B,A
WrWorldRedSet:
        LD      (HL),B
        INC     HL

        XOR     A
        LD      B,A
        CALL    GetWallColor
        AND     ColorGreen
        JR      Z,WrWorldGrnPath
        LD      B,C
WrWorldGrnPath:
        LD      A,PacColorPath
        AND     ColorGreen
        JR      Z,WrWorldGrnSet
        LD      A,B
        OR      D
        LD      B,A
WrWorldGrnSet:
        LD      (HL),B
        INC     HL

        XOR     A
        LD      B,A
        CALL    GetWallColor
        AND     ColorBlue
        JR      Z,WrWorldBluPath
        LD      B,C
WrWorldBluPath:
        LD      A,PacColorPath
        AND     ColorBlue
        JR      Z,WrWorldBluSet
        LD      A,B
        OR      D
        LD      B,A
WrWorldBluSet:
        LD      (HL),B
        INC     HL
        RET

; GetWallColor —
; Choose wall colour based on game state.
; Returns PacColorCaught when caught,
; PacColorDone when round is complete,
; PacColorWall otherwise, in A. Flags are incidental.
;!      out       A,carry
@GetWallColor:
        LD      A,(PacPlayerCaught)
        OR      A
        JR      NZ,GetWallCaught
        LD      A,(PacRoundDone)
        OR      A
        JR      NZ,GetWallDone
        LD      A,PacColorWall
        RET
GetWallCaught:
        LD      A,PacColorCaught
        RET
GetWallDone:
        LD      A,PacColorDone
        RET

; WindowByteBc —
; Extract an 8-bit viewport window from a 16-bit row.
; A contains the horizontal window offset. BC contains
; the full 15-column row with bit 15 = column 0.
; The visible byte is returned in A.
;!      in        A,BC
;!      out       A,C,D,carry,zero,sign,parity,halfCarry
;!      clobbers  B
@WindowByteBc:
        LD      D,A
        LD      A,D
        OR      A
        JR      Z,WindowByteDone
WindowShiftLoop:
        SLA     C
        RL      B
        DEC     D
        JR      NZ,WindowShiftLoop
WindowByteDone:
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
@RendPwrPills:
        LD      HL,PacPowerPills
        LD      D,1
RendPwrPillLp:
        LD      A,(HL)
        CP      0xFF
        RET     Z
        LD      B,A                     ; B = world x
        INC     HL
        LD      A,(HL)
        INC     HL
        LD      C,A                     ; C = world y
        LD      A,(PacPwrPillsEat)
        AND     D
        JR      NZ,RendPwrPillNext
        PUSH    HL
        PUSH    DE
        CALL    RendPwrPillBc
        POP     DE
        POP     HL
RendPwrPillNext:
        SLA     D
        JR      RendPwrPillLp

; RendPwrPillRow —
; Render uneaten power pills on screen row A.
; Used in the per-row cooperative render path; skips
; table entries whose world Y does not map to A.
;!      in        A
;!      out       HL,D
;!      clobbers  A,BC,E
@RendPwrPillRow:
        LD      E,A                     ; E = target screen row
        LD      HL,PacPowerPills
        LD      D,1
RendPwrRowLoop:
        LD      A,(HL)
        CP      0xFF
        RET     Z
        LD      B,A                     ; B = world x
        INC     HL
        LD      A,(HL)
        INC     HL
        LD      C,A                     ; C = world y
        LD      A,(PacPwrPillsEat)
        AND     D
        JR      NZ,RendPwrRowNext
        LD      A,(ViewY)
        ADD     A,E
        CP      C
        JR      NZ,RendPwrRowNext
        PUSH    HL
        PUSH    DE
        CALL    RendPwrPillBc
        POP     DE
        POP     HL
RendPwrRowNext:
        SLA     D
        JR      RendPwrRowLoop

; RendPwrPillBc —
; Render one power pill if it is in the viewport.
; B=x and C=y identify the pill's world cell. Skips
; silently when off screen; otherwise maps to a
; FramebufferBack row and calls FbSetCell with
; PacColorPwrPill.
;!      in        BC
;!      clobbers  A,BC,DE,HL
@RendPwrPillBc:
        LD      A,(ViewY)
        LD      E,A
        LD      A,C
        SUB     E                       ; A = screenY
        CP      RowCount
        RET     NC
        ADD     A,A
        ADD     A,A
        LD      E,A
        LD      D,0
        LD      HL,FramebufferBack
        ADD     HL,DE

        LD      A,(ViewX)
        LD      E,A
        LD      A,B
        SUB     E                       ; A = screenX
        CP      RowCount
        RET     NC
        CALL    MxMask
        LD      C,A

        LD      A,PacColorPwrPill
        JP      FbSetCell

; RendEnemyBack —
; Render the monster record at IX into FramebufferBack.
; Respawning monsters are skipped. Flee colour is used
; only while the monster is in flee state and the power
; timer is still visibly active; otherwise attack
; colour is written with FbSetCell.
;!      in        IX
;!      clobbers  A,BC,DE,HL
@RendEnemyBack:
        LD      A,(IX + MonRespTimer)
        OR      A
        RET     NZ
        LD      A,(IX + MonsterY)
        LD      B,A
        LD      A,(ViewY)
        LD      C,A
        LD      A,B
        SUB     C                       ; A = screenY
        CP      RowCount
        RET     NC
        ADD     A,A
        ADD     A,A
        LD      E,A
        LD      D,0
        LD      HL,FramebufferBack
        ADD     HL,DE

        LD      A,(IX + MonsterX)
        LD      B,A
        LD      A,(ViewX)
        LD      C,A
        LD      A,B
        SUB     C                       ; A = screenX
        CP      RowCount
        RET     NC
        CALL    MxMask
        LD      C,A

        PUSH    HL
        LD      A,(IX + MonsterState)
        CP      PacEnemyFlee
        JR      NZ,RendEnAtkTmr
        LD      HL,(PacPowerTimerLo)
        LD      A,H
        OR      L
        JR      Z,RendEnAtkTmr
        LD      A,H
        OR      A
        JR      NZ,RendEnFleeTmr
        LD      A,L
        AND     PacPwrWarnMask
        JR      Z,RendEnAtkTmr
RendEnFleeTmr:
        POP     HL
        JR      RendEnemyFlee
RendEnAtkTmr:
        POP     HL
        LD      A,PacColorEnAtk
        JP      FbSetCell
RendEnemyFlee:
        LD      A,PacColorEnFlee
        JP      FbSetCell

; RendMonsRow —
; Render active monsters that map to screen row A.
; Calls RendEnemyIfRow for Monster0 and Monster1;
; Monster2 is skipped before level 2.
;!      in        A
;!      clobbers  A,BC,E,HL,IX
@RendMonsRow:
        LD      C,A
        PUSH    BC
        LD      E,C
        LD      IX,Monster0
        CALL    RendEnemyIfRow
        POP     BC
        PUSH    BC
        LD      E,C
        LD      IX,Monster1
        CALL    RendEnemyIfRow
        POP     BC
        PUSH    BC
        CALL    PacIsLevel2Plus
        POP     BC
        RET     C
        LD      E,C
        LD      IX,Monster2
        JP      RendEnemyIfRow

; RendEnemyIfRow —
; Render the monster record at IX only when its world
; Y maps to screen row E. Respawning or off-row
; monsters return without drawing.
;!      in        IX,E
;!      clobbers  A,BC,HL
@RendEnemyIfRow:
        LD      A,(IX + MonRespTimer)
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
        CALL    RendEnemyBack
        POP     DE
        RET

; RendPlyBack —
; Render the player pixel into FramebufferBack.
; Colour: yellow (PacColorPlayer) normally;
; white (PacColorRound) when round is complete;
; red (PacColorEnAtk) when caught.
; Skips silently when the player is off-screen.
;!      clobbers  A,BC,DE,HL
@RendPlyBack:
        LD      A,(PlayerY)
        LD      B,A
        LD      A,(ViewY)
        LD      C,A
        LD      A,B
        SUB     C                       ; A = screenY
        CP      RowCount
        RET     NC
        ADD     A,A
        ADD     A,A
        LD      E,A
        LD      D,0
        LD      HL,FramebufferBack
        ADD     HL,DE

        LD      A,(PlayerX)
        LD      B,A
        LD      A,(ViewX)
        LD      C,A
        LD      A,B
        SUB     C                       ; A = screenX
        CP      RowCount
        RET     NC
        CALL    MxMask
        LD      C,A

        LD      A,(PacPlayerCaught)
        OR      A
        JR      NZ,RendPlyCaught

        LD      A,(PacRoundDone)
        OR      A
        JR      NZ,RendPlyWhite
        LD      A,PacColorPlayer
        JP      FbSetCell
RendPlyWhite:
        LD      A,PacColorRound
        JP      FbSetCell
RendPlyCaught:
        LD      A,PacColorEnAtk
        JP      FbSetCell

; RendPlyRow —
; Render the player only when PlayerY maps to screen
; row A. Matching rows delegate to RendPlyBack;
; other rows return without drawing.
;!      in        A
;!      clobbers  A,BC,DE,HL
@RendPlyRow:
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
        JP      RendPlyBack
