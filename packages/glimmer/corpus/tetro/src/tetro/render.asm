; RebuildFb —
; Full Framebuffer rebuild from current board
; and active-piece state.
; Used at init, restart, and game-over transitions.
; Clears back-buffer, renders board then piece,
; then copies to the live Framebuffer (JP).
;!      clobbers  A,BC,DE,HL
CM_RBLDF:
        CALL    FC_FBCLR
        CALL    TR_RNDBR
        CALL    TR_RNDCT
        JP      FC_FBCPY

; ClearBoard —
; Zero BoardRows and all three colour planes.
; Sets BoardEmpty=1 after clearing.
; Clears RowCount*4 bytes starting at BoardRows.
;!      clobbers  A,B,HL
TR_CLRBR:
        LD      HL,TW_BRDRW
        LD      B,RowCount * 4
        XOR     A
TR_CLRB0:
        LD      (HL),A
        INC     HL
        DJNZ    TR_CLRB0
        LD      A,1
        LD      (TW_BRDMP),A
        RET

; RendBoardBack —
; Render the landed board into FramebufferBack.
; Normal mode: copies BoardRed, BoardGreen,
; BoardBlue per row.
; GameOver mode: renders BoardRows occupancy in
; red only (silhouette effect).
; Rows set in ClearMask flash white (all planes
; forced to 0xFF) during the line-clear hold.
;!      clobbers  A
TR_RNDBR:
        PUSH    BC
        PUSH    DE
        PUSH    HL
        LD      HL,CM_FRMB0
        LD      B,RowCount
        LD      C,0
TR_RNDRB:
        LD      E,C
        LD      D,0
        LD      A,(GameOver)
        OR      A
        JR      NZ,TR_RNDB2

        PUSH    HL
        LD      HL,BoardRed
        ADD     HL,DE
        LD      A,(HL)
        POP     HL
        LD      (HL),A
        INC     HL

        PUSH    HL
        LD      HL,TW_BRDGR
        ADD     HL,DE
        LD      A,(HL)
        POP     HL
        LD      (HL),A
        INC     HL

        PUSH    HL
        LD      HL,TW_BRDBL
        ADD     HL,DE
        LD      A,(HL)
        POP     HL
        LD      (HL),A
        INC     HL
        INC     HL
        JR      TR_RNDB1

TR_RNDB2:
        PUSH    HL
        LD      HL,TW_BRDRW
        ADD     HL,DE
        LD      A,(HL)
        POP     HL
        LD      (HL),A
        INC     HL
        XOR     A
        LD      (HL),A
        INC     HL
        LD      (HL),A
        INC     HL
        INC     HL

TR_RNDB1:
        LD      A,(TW_CLRPN)
        OR      A
        JR      Z,TR_RNDB3
        PUSH    HL
        LD      H,0
        LD      L,C
        LD      DE,TD_RWBTT
        ADD     HL,DE
        LD      A,(TW_CLRMS)
        AND     (HL)
        POP     HL
        JR      Z,TR_RNDB3
        DEC     HL
        DEC     HL
        DEC     HL
        DEC     HL
        LD      A,$FF
        LD      (HL),A
        INC     HL
        LD      (HL),A
        INC     HL
        LD      (HL),A
        INC     HL
        INC     HL
TR_RNDB3:
        INC     C
        DJNZ    TR_RNDRB
TR_RNDB0:
        POP     HL
        POP     DE
        POP     BC
        RET

; RendActBack —
; OR the active piece into FramebufferBack.
; No-op when ActPieceEnabled is zero.
; Uses CurPiecePtr bitmap, PlayerX/Y position,
; and CurPieceColor for selecting colour planes.
;!      clobbers  A
TR_RNDCT:
        LD      A,(TW_ACTPC)
        OR      A
        RET     Z
        PUSH    BC
        PUSH    DE
        PUSH    HL
        LD      A,(PlayerX)
        LD      (TW_SHFTC),A
        LD      A,(PlayerY)
        LD      L,A
        LD      H,0
        LD      DE,(TW_CRPCP)
        LD      B,4

TR_RNDRS:
        LD      A,(DE)
        CALL    TG_SHFT1 ; returns A = shifted mask
        LD      C,A
        OR      A ; test A; C retains mask for FbOrRow
        JR      Z,TR_RNDSH
        BIT     7,L
        JR      NZ,TR_RNDSH
        LD      A,L
        CP      RowCount
        JR      NC,TR_RNDSH
        PUSH    HL
        PUSH    DE
        ADD     A,A
        ADD     A,A
        LD      E,A
        LD      D,0
        LD      HL,CM_FRMB0
        ADD     HL,DE
        LD      A,(TW_CRPCC)
        CALL    FbOrRow
        POP     DE
        POP     HL
TR_RNDSH:
        INC     DE
        INC     HL
        DJNZ    TR_RNDRS
TR_RNDC0:
        POP     HL
        POP     DE
        POP     BC
        RET
