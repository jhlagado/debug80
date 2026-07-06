; CheckCollAtDe —
; Test candidate piece placement at (D, E).
; Checks X bounds against XMin and CurPieceRight.
; Checks each occupied piece row against BoardRows
; using the MSB-left column convention.
; Carry set means collision or out-of-bounds; carry
; clear means the placement is legal.
; BC, DE, and HL are preserved.
;!      in        DE
;!      out       carry,zero
;!      clobbers  A
@CheckCollAtDe:
        PUSH    BC
        PUSH    DE
        PUSH    HL
        LD      A,D
        CP      XMin
        JR      C,CollXBound
        LD      C,A
        LD      A,(CurPieceRight)
        ADD     A,C
        CP      RowCount
        JR      NC,CollXBound
        LD      A,D
        LD      (ShiftCount),A
        LD      A,E
        LD      L,A
        LD      H,0
        LD      B,4
        LD      DE,(CurPiecePtr)
        ; Empty-board fast path removed:
        ; CheckCollRow handles it correctly
        ; (BoardRows=0 -> AND yields 0 -> no
        ; overlap), at the cost of ~12 cycles
        ; per collision on an empty board (only at
        ; first spawn after reset).
CheckCollRow:
        LD      A,(DE)
        CALL    ShiftRowMask
        LD      C,A
        OR      A
        JR      Z,CollNextRow
        BIT     7,L
        JR      NZ,CollNextRow
        LD      A,L
        CP      RowCount
        JR      NC,CollRowBottom
        PUSH    HL
        PUSH    DE
        LD      H,0
        LD      DE,BoardRows
        ADD     HL,DE
        LD      A,(HL)
        AND     C
        POP     DE
        POP     HL
        JR      NZ,CollRowOverlap
CollNextRow:
        INC     DE
        INC     HL
        DJNZ    CheckCollRow
        OR      A
        JR      CollExitOk

CollXBound:
        SCF
        JR      CollExitOk

CollRowBottom:
        SCF
        JR      CollExitOk

CollRowOverlap:
        SCF
CollExitOk:
        POP     HL
        POP     DE
        POP     BC
        RET

; CheckTopOut —
; Detect an above-field lock that causes game-over.
; Scans the active piece's 4 rows; if any occupied
; row has bit 7 set in L (Y is negative, meaning
; the row is above the visible playfield), carry
; is set. Carry clear means the piece is in-bounds.
;!      out       carry,zero
;!      clobbers  A
@CheckTopOut:
        PUSH    BC
        PUSH    DE
        PUSH    HL
        LD      A,(PlayerY)
        LD      L,A
        LD      H,0
        LD      DE,(CurPiecePtr)
        LD      B,4
TopOutRowLoop:
        LD      A,(DE)
        OR      A
        JR      Z,TopOutNextRow
        BIT     7,L
        JR      NZ,TopOutTrue
TopOutNextRow:
        INC     DE
        INC     HL
        DJNZ    TopOutRowLoop
        OR      A
        JR      TopOutExit
TopOutTrue:
        SCF
TopOutExit:
        POP     HL
        POP     DE
        POP     BC
        RET
