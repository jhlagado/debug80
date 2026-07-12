; RebuildFb —
; Full Framebuffer rebuild from current board
; and active-piece state.
; Used at init, restart, and game-over transitions.
; Clears back-buffer, renders board then piece,
; then copies to the live Framebuffer (JP).
;!      clobbers  A,BC,DE,HL
@RebuildFb:
        CALL    FbClearAll
        CALL    RendBoardBack
        CALL    RendActBack
        JP      FbCopyAll

; ClearBoard —
; Zero BoardRows and all three colour planes.
; Sets BoardEmpty=1 after clearing.
; Clears RowCount*4 bytes starting at BoardRows.
;!      clobbers  A,B,HL
@ClearBoard:
        LD      HL,BoardRows
        LD      B,RowCount * 4
        XOR     A
ClearBoardLoop:
        LD      (HL),A
        INC     HL
        DJNZ    ClearBoardLoop
        LD      A,1
        LD      (BoardEmpty),A
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
@RendBoardBack:
        PUSH    BC
        PUSH    DE
        PUSH    HL
        LD      HL,FramebufferBack
        LD      B,RowCount
        LD      C,0
RenderBoardRow:
        LD      E,C
        LD      D,0
        LD      A,(GameOver)
        OR      A
        JR      NZ,RendBoardGOver

        PUSH    HL
        LD      HL,BoardRed
        ADD     HL,DE
        LD      A,(HL)
        POP     HL
        LD      (HL),A
        INC     HL

        PUSH    HL
        LD      HL,BoardGreen
        ADD     HL,DE
        LD      A,(HL)
        POP     HL
        LD      (HL),A
        INC     HL

        PUSH    HL
        LD      HL,BoardBlue
        ADD     HL,DE
        LD      A,(HL)
        POP     HL
        LD      (HL),A
        INC     HL
        INC     HL
        JR      RendBoardFx

RendBoardGOver:
        PUSH    HL
        LD      HL,BoardRows
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

RendBoardFx:
        LD      A,(ClearPending)
        OR      A
        JR      Z,RendBoardNext
        PUSH    HL
        LD      H,0
        LD      L,C
        LD      DE,RowBitTable
        ADD     HL,DE
        LD      A,(ClearMask)
        AND     (HL)
        POP     HL
        JR      Z,RendBoardNext
        DEC     HL
        DEC     HL
        DEC     HL
        DEC     HL
        LD      A,0xFF
        LD      (HL),A
        INC     HL
        LD      (HL),A
        INC     HL
        LD      (HL),A
        INC     HL
        INC     HL
RendBoardNext:
        INC     C
        DJNZ    RenderBoardRow
RendBoardExit:
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
@RendActBack:
        LD      A,(ActPieceEnabled)
        OR      A
        RET     Z
        PUSH    BC
        PUSH    DE
        PUSH    HL
        LD      A,(PlayerX)
        LD      (ShiftCount),A
        LD      A,(PlayerY)
        LD      L,A
        LD      H,0
        LD      DE,(CurPiecePtr)
        LD      B,4

RenderShapeRow:
        LD      A,(DE)
        CALL    ShiftRowMask          ; returns A = shifted mask
        LD      C,A
        OR      A                       ; test A; C retains mask for FbOrRow
        JR      Z,RendShapeNext
        BIT     7,L
        JR      NZ,RendShapeNext
        LD      A,L
        CP      RowCount
        JR      NC,RendShapeNext
        PUSH    HL
        PUSH    DE
        ADD     A,A
        ADD     A,A
        LD      E,A
        LD      D,0
        LD      HL,FramebufferBack
        ADD     HL,DE
        LD      A,(CurPieceColor)
        CALL    FbOrRow
        POP     DE
        POP     HL
RendShapeNext:
        INC     DE
        INC     HL
        DJNZ    RenderShapeRow
RendActExit:
        POP     HL
        POP     DE
        POP     BC
        RET
